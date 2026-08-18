import { Mastra } from '@mastra/core/mastra'
import type { MastraModelConfig } from '@mastra/core/llm'
import { AgentInsightSchema } from '@qingpu/contracts'
import { z } from 'zod'
import type {
  AgentChatInput,
  AgentInsight,
  AnalyzeOpportunityInput,
  ProductMatch,
  ScoreResult,
} from '@qingpu/contracts'
import type { BusinessStore } from '../store/store.js'
import { createAgents } from './agents.js'
import { createBusinessTools } from './tools.js'

const SmartChatSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ title: z.string(), source: z.string(), excerpt: z.string() })),
  suggestedActions: z.array(z.string()),
})

export const ResearchCandidateSchema = z.object({
  companyName: z.string(),
  title: z.string(),
  signal: z.string(),
  industry: z.string(),
  region: z.string(),
  signalType: z.enum(['procurement', 'project', 'policy', 'operation', 'partnership']),
  sourceTitle: z.string(),
  sourceUrl: z.string().url(),
  occurredAt: z.string(),
  expectedScale: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

const ResearchOutputSchema = z.object({ candidates: z.array(ResearchCandidateSchema).max(8) })

export type ResearchCandidate = z.infer<typeof ResearchCandidateSchema>

const MODEL_KEYS: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY'],
  groq: ['GROQ_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
}

export type RuntimeModelConfig = {
  model: string
  agentModel: MastraModelConfig
  enabled: boolean
  usesCustomEndpoint: boolean
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('OPENAI_BASE_URL 必须使用 http 或 https 协议')
  return value.replace(/\/+$/, '')
}

export function resolveRuntimeModel(): RuntimeModelConfig {
  const explicit = process.env.MASTRA_MODEL?.trim()
  const model = explicit || (process.env.OPENAI_API_KEY?.trim() ? 'openai/gpt-4o-mini'
    : process.env.ANTHROPIC_API_KEY?.trim() ? 'anthropic/claude-3-5-haiku-latest'
      : process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ? 'google/gemini-2.0-flash'
        : 'openai/gpt-4o-mini')
  const [provider, ...modelNameParts] = model.split('/')
  if (!provider || modelNameParts.join('/').trim().length === 0) {
    throw new Error('MASTRA_MODEL 必须使用 provider/model-name 格式')
  }
  const compatibleModelId = model as `${string}/${string}`
  const keys = MODEL_KEYS[provider] ?? []
  const enabled = keys.some((key) => Boolean(process.env[key]?.trim()))
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim()
  const openAiBaseUrl = process.env.OPENAI_BASE_URL?.trim()
  const usesCustomEndpoint = provider === 'openai' && Boolean(openAiBaseUrl)
  const agentModel: MastraModelConfig = provider === 'openai' && (openAiApiKey || openAiBaseUrl)
    ? {
        id: compatibleModelId,
        ...(openAiApiKey ? { apiKey: openAiApiKey } : {}),
        ...(openAiBaseUrl ? { url: normalizeBaseUrl(openAiBaseUrl) } : {}),
      }
    : model
  return { model, agentModel, enabled, usesCustomEndpoint }
}

function extractStructured<T>(result: unknown, schema: z.ZodType<T>): T {
  const candidate = result as { object?: unknown; text?: string }
  if (candidate.object !== undefined) return schema.parse(candidate.object)
  if (candidate.text) return schema.parse(JSON.parse(candidate.text))
  throw new Error('模型未返回可解析的结构化结果')
}

function timeout<T>(promise: Promise<T>, milliseconds = 18_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Agent 调用超时')), milliseconds)),
  ])
}

export class MastraRuntime {
  readonly model: string
  readonly intelligent: boolean
  readonly usesCustomEndpoint: boolean
  readonly mastra: Mastra
  private readonly agents: ReturnType<typeof createAgents>

  constructor(store: BusinessStore) {
    const config = resolveRuntimeModel()
    this.model = config.model
    this.intelligent = config.enabled
    this.usesCustomEndpoint = config.usesCustomEndpoint
    const tools = createBusinessTools(store)
    this.agents = createAgents(config.agentModel, tools)
    this.mastra = new Mastra({ agents: this.agents })
  }

  async chat(input: AgentChatInput) {
    if (!this.intelligent) throw new Error('未配置受支持的模型密钥')
    const result = await timeout(this.agents.enterpriseRelationshipAgent.generate(
      `用户问题：${input.message}\n关系上下文：${input.relationshipId ?? '无'}\n商机上下文：${input.opportunityId ?? '无'}。请调用工具，根据内部数据返回答案。`,
      { structuredOutput: { schema: SmartChatSchema, jsonPromptInjection: 'auto' } },
    ))
    return extractStructured(result, SmartChatSchema)
  }

  async analyze(input: AnalyzeOpportunityInput, score: ScoreResult, matches: ProductMatch[]): Promise<AgentInsight> {
    if (!this.intelligent) throw new Error('未配置受支持的模型密钥')
    const result = await timeout(this.agents.opportunityAnalysisAgent.generate(
      `请解释下列确定性分析，不得修改评分。\n输入：${JSON.stringify(input)}\n评分：${JSON.stringify(score)}\n产品候选：${JSON.stringify(matches)}`,
      { structuredOutput: { schema: AgentInsightSchema, jsonPromptInjection: 'auto' } },
    ))
    return AgentInsightSchema.parse({ ...extractStructured(result, AgentInsightSchema), mode: 'intelligent', model: this.model, generatedAt: new Date().toISOString() })
  }

  async discover(query: string, region: string | undefined, days: number): Promise<ResearchCandidate[]> {
    if (!this.intelligent) throw new Error('未配置受支持的模型密钥')
    if (!process.env.TAVILY_API_KEY?.trim()) throw new Error('未配置实时搜索服务密钥')
    const result = await timeout(this.agents.opportunityResearchAgent.generate(
      `使用 webSearchTool 搜索最近 ${days} 天的“${query}”${region ? `，地区限定：${region}` : ''}。只返回有来源 URL 的企业级商机候选。`,
      { structuredOutput: { schema: ResearchOutputSchema, jsonPromptInjection: 'auto' } },
    ), 25_000)
    return extractStructured(result, ResearchOutputSchema).candidates
  }
}
