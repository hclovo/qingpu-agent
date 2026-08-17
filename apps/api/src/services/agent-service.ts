import type { AgentChatInput, AgentChatResponse } from '@qingpu/contracts'
import type { MastraRuntime } from '../mastra/index.js'
import type { MemoryStore } from '../store/memory-store.js'
import type { RelationshipService } from './relationship-service.js'

type ChatResult = AgentChatResponse & { fallbackReason?: string; needsConfirmation?: string[] }

export class AgentService {
  constructor(
    private readonly store: MemoryStore,
    private readonly runtime: MastraRuntime,
    private readonly relationships: RelationshipService,
  ) {}

  get mode(): 'intelligent' | 'rules' {
    return this.runtime.intelligent ? 'intelligent' : 'rules'
  }

  get model() {
    return this.runtime.intelligent ? this.runtime.model : undefined
  }

  async chat(input: AgentChatInput): Promise<ChatResult> {
    if (this.runtime.intelligent) {
      try {
        const smart = await this.runtime.chat(input)
        return { ...smart, mode: 'intelligent', model: this.runtime.model, generatedAt: new Date().toISOString(), needsConfirmation: ['外发沟通、技术参数和商务承诺需人工确认'] }
      } catch (error) {
        void error
        return this.rulesChat(input, '智能模式暂时不可用，已安全降级到本地规则。')
      }
    }
    return this.rulesChat(input, '未配置受支持的模型密钥，已使用本地规则与企业数据回答。')
  }

  private rulesChat(input: AgentChatInput, fallbackReason: string): ChatResult {
    const message = input.message.toLowerCase()
    const generatedAt = new Date().toISOString()
    const base = { mode: 'rules' as const, generatedAt, fallbackReason, needsConfirmation: ['任何外部联系、报价和技术承诺需人工确认'] }

    if (input.relationshipId || /客户|潜客|关系|供应商|上游|伙伴|联系|跟进/u.test(message)) {
      const relationship = input.relationshipId ? this.store.getRelationship(input.relationshipId) : undefined
      const rows = relationship ? [relationship] : this.store.listRelationships().slice(0, 5)
      return {
        ...base,
        answer: relationship
          ? `${relationship.name}当前关系健康度为 ${relationship.health}（${relationship.healthScore}/100）。最近联系：${relationship.lastContactAt?.slice(0, 10) ?? '暂无记录'}；下一步：${relationship.nextAction ?? '待补充'}。${relationship.isDemo ? '该对象为显著标识的模拟数据。' : ''}`
          : `当前共维护 ${this.store.listRelationships().length} 个关系对象。优先关注：${rows.map((item) => `${item.name}（${item.health}，下一步：${item.nextAction ?? '待补充'}）`).join('；')}。`,
        citations: rows.map((item) => ({ title: item.name, source: item.sourceKind, excerpt: item.description })),
        suggestedActions: rows.slice(0, 3).map((item) => item.nextAction ?? `补充 ${item.name} 的下一步行动`),
      }
    }

    if (/知识|资料|产品册|宣传册|案例|参数/u.test(message)) {
      const rows = this.store.searchKnowledge(input.message, 5)
      const selected = rows.length ? rows : this.store.listKnowledge().slice(0, 4)
      return {
        ...base,
        answer: selected.length
          ? `找到 ${selected.length} 条相关企业知识：${selected.map((item) => `${item.title}：${item.content.slice(0, 100)}`).join('\n')}`
          : '当前知识库没有匹配内容，请补充文本、URL 或文件内容后重试。',
        citations: selected.map((item) => ({ title: item.title, source: item.sourcePath ?? item.sourceUrl ?? item.sourceKind, excerpt: item.content.slice(0, 180) })),
        suggestedActions: ['核对资料版本和来源时间', '对关键技术参数发起产品专家复核'],
      }
    }

    if (/产品|电堆|船用|车用|制氢|ocean|cesp|e200/u.test(message)) {
      const products = this.store.listProducts().filter((item) => [item.model, item.family, ...item.scenarios].join(' ').toLowerCase().split(/\s+/).some((term) => term && message.includes(term.toLowerCase())))
      const selected = (products.length ? products : this.store.listProducts()).slice(0, 5)
      return {
        ...base,
        answer: `产品候选：${selected.map((item) => `${item.model}（${item.family}，${item.ratedPower}）`).join('；')}。这些参数仅用于线索预筛，不替代正式选型。`,
        citations: selected.map((item) => ({ title: item.model, source: item.source, excerpt: `${item.family}；场景：${item.scenarios.join('、')}` })),
        suggestedActions: ['补充功率、工况、认证与交付时间', '由售前确认产品版本和技术边界'],
      }
    }

    if (input.opportunityId || /商机|线索|机会|高潜|评分/u.test(message)) {
      const opportunity = input.opportunityId ? this.store.getOpportunity(input.opportunityId) : undefined
      const rows = opportunity ? [opportunity] : this.store.listOpportunities().slice(0, 5)
      return {
        ...base,
        answer: opportunity
          ? `${opportunity.companyName}的“${opportunity.title}”为 ${opportunity.grade} 级、${opportunity.score} 分，当前阶段 ${opportunity.stage}。${opportunity.insight.summary}`
          : `当前重点商机：${rows.map((item) => `${item.companyName} ${item.grade}级/${item.score}分`).join('；')}。评分表示跟进优先级，不是成交概率。`,
        citations: rows.flatMap((item) => item.evidence.slice(0, 1).map((evidence) => ({ title: evidence.title, source: evidence.url ?? evidence.kind, excerpt: evidence.excerpt }))),
        suggestedActions: rows.slice(0, 3).flatMap((item) => item.insight.recommendedActions.slice(0, 1)),
      }
    }

    const briefing = this.relationships.briefing()
    return {
      ...base,
      answer: `${briefing.summary} 建议先处理：${briefing.items.slice(0, 3).map((item) => item.title).join('；')}。你也可以问我某个客户、供应商、产品或商机。`,
      citations: [],
      suggestedActions: briefing.suggestedActions,
    }
  }
}
