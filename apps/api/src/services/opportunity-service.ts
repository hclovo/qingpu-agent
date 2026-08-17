import type {
  AgentInsight,
  AnalyzeOpportunityInput,
  DiscoverOpportunityInput,
  Opportunity,
  OpportunityStage,
} from '@qingpu/contracts'
import { createRulesInsight, matchProducts, scoreOpportunity } from '@qingpu/domain'
import type { MastraRuntime, ResearchCandidate } from '../mastra/index.js'
import type { MemoryStore, OpportunityFilters } from '../store/memory-store.js'

const publicError = (error: unknown) => error instanceof Error && /超时|timeout/iu.test(error.message)
  ? 'Agent 调用超时'
  : '外部智能服务暂时不可用'

export class DuplicateOpportunityError extends Error {}

export class OpportunityService {
  constructor(private readonly store: MemoryStore, private readonly runtime: MastraRuntime) {}

  list(filters: OpportunityFilters) { return this.store.listOpportunities(filters) }
  get(id: string) { return this.store.getOpportunity(id) }
  updateStage(id: string, stage: OpportunityStage) { return this.store.updateOpportunityStage(id, stage) }

  async analyze(input: AnalyzeOpportunityInput): Promise<Opportunity> {
    if (this.store.hasOpportunityFingerprint(input.companyName, input.title)) throw new DuplicateOpportunityError('相同企业和标题的商机已存在')
    const score = scoreOpportunity(input)
    const productMatches = matchProducts(input, this.store.listProducts())
    let insight: AgentInsight
    if (this.runtime.intelligent) {
      try {
        insight = await this.runtime.analyze(input, score, productMatches)
      } catch (error) {
        insight = createRulesInsight(input, score, productMatches, `智能研判失败，已降级：${publicError(error)}`)
      }
    } else {
      insight = createRulesInsight(input, score, productMatches, '未配置受支持的模型密钥')
    }
    const timestamp = new Date().toISOString()
    const opportunity: Opportunity = {
      id: `opportunity-${crypto.randomUUID()}`,
      relationshipId: input.relationshipId,
      companyName: input.companyName,
      industry: input.industry,
      region: input.region,
      title: input.title,
      signal: input.signal,
      signalType: input.signalType,
      expectedScale: input.expectedScale,
      maturity: input.maturity,
      contactability: input.contactability,
      stage: 'qualified',
      score: score.score,
      grade: score.grade,
      scoreVersion: score.scoreVersion,
      scoreBreakdown: score.dimensions,
      productMatches,
      evidence: [{ id: `evidence-${crypto.randomUUID()}`, kind: input.sourceKind, title: input.sourceTitle, url: input.sourceUrl, occurredAt: input.occurredAt, capturedAt: timestamp, excerpt: input.signal, confidence: input.sourceKind === 'demo-simulated' ? 0.55 : 0.75 }],
      insight,
      tags: input.sourceKind === 'demo-simulated' ? ['演示数据'] : ['用户提交'],
      isDemo: input.sourceKind === 'demo-simulated',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.store.createOpportunity(opportunity)
  }

  async discover(input: DiscoverOpportunityInput): Promise<{ mode: 'intelligent' | 'demo'; notice: string; fallbackReason?: string; candidates: Opportunity[] }> {
    if (this.runtime.intelligent) {
      try {
        const candidates = await this.runtime.discover(input.query, input.region, input.days)
        const opportunities: Opportunity[] = []
        for (const candidate of candidates) {
          if (this.store.hasOpportunityFingerprint(candidate.companyName, candidate.title)) continue
          opportunities.push(await this.createDiscovered(candidate))
        }
        return { mode: 'intelligent', notice: '联网候选均处于待核验阶段，不会自动外发或推进跟进。', candidates: opportunities }
      } catch (error) {
        return this.demoDiscovery(input, `智能发现不可用：${publicError(error)}`)
      }
    }
    return this.demoDiscovery(input, '未配置模型或实时搜索密钥')
  }

  private async createDiscovered(candidate: ResearchCandidate): Promise<Opportunity> {
    const input: AnalyzeOpportunityInput = {
      companyName: candidate.companyName, title: candidate.title, signal: candidate.signal,
      industry: candidate.industry, region: candidate.region, signalType: candidate.signalType,
      expectedScale: candidate.expectedScale, maturity: 'planning', contactability: 'public-channel',
      sourceTitle: candidate.sourceTitle, sourceUrl: candidate.sourceUrl, occurredAt: candidate.occurredAt,
      sourceKind: 'public', strategic: false,
    }
    const result = await this.analyze(input)
    return this.store.updateOpportunityStage(result.id, 'verifying') ?? result
  }

  private demoDiscovery(input: DiscoverOpportunityInput, fallbackReason: string) {
    const query = input.query.toLowerCase()
    const all = this.store.listOpportunities({ stage: 'verifying' })
    const selected = all.filter((item) => !input.region || item.region.includes(input.region)).filter((item) => [item.title, item.signal, item.industry].join(' ').toLowerCase().includes(query) || query.split(/\s+/).some((term) => [item.title, item.signal, item.industry].join(' ').toLowerCase().includes(term))).slice(0, 4)
    return {
      mode: 'demo' as const,
      notice: '当前返回显著标识的内置演示信号，并非实时联网结果；请勿据此直接联系外部对象。',
      fallbackReason,
      candidates: selected.length ? selected : all.slice(0, 4),
    }
  }
}
