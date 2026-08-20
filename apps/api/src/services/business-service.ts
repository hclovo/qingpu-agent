import type {
  AgentChatInput,
  AgentChatResponse,
  AnalyzeOpportunityInput,
  CreateKnowledgeInput,
  CreateTouchpointInput,
  KnowledgeItem,
  Opportunity,
} from '@qingpu/contracts'
import { createRulesInsight, matchProducts, scoreOpportunity } from '@qingpu/domain'
import { MastraRuntime, type ResearchCandidate } from '../mastra/index.js'
import { isAuthEnabled } from '../auth/enabled.js'
import { persistableActorId } from '../auth/session.js'
import { createStore } from '../store/create-store.js'
import type { BusinessStore, OpportunityFilters } from '../store/store.js'

const today = () => new Date().toISOString()
const daysBetween = (left: string, right = new Date()) => Math.max(0, Math.floor((right.getTime() - new Date(left).getTime()) / 86_400_000))

export class BusinessService {
  readonly store: BusinessStore
  readonly runtime: MastraRuntime

  constructor(store = createStore(), runtime = new MastraRuntime(store)) {
    this.store = store
    this.runtime = runtime
  }

  health() {
    return {
      status: 'ok',
      version: '0.1.0',
      agentMode: this.runtime.intelligent ? 'intelligent' : 'rules',
      model: this.runtime.intelligent ? this.runtime.model : undefined,
      storage: this.store.kind,
      authRequired: isAuthEnabled(),
      now: today(),
    }
  }

  async chat(input: AgentChatInput): Promise<AgentChatResponse & { needsConfirmation: string[] }> {
    if (this.runtime.intelligent) {
      try {
        const response = await this.runtime.chat(input)
        return {
          ...response,
          mode: 'intelligent',
          model: this.runtime.model,
          generatedAt: today(),
          needsConfirmation: ['任何对外沟通、报价和技术承诺都需要人工确认'],
        }
      } catch (error) {
        void error
        return this.rulesChat(input, '智能模式暂时不可用，已安全降级到本地规则。')
      }
    }
    return this.rulesChat(input, '未配置受支持的模型密钥，已使用本地规则与企业数据回答。')
  }

  private async rulesChat(input: AgentChatInput, fallbackReason?: string): Promise<AgentChatResponse & { needsConfirmation: string[]; fallbackReason?: string }> {
    const message = input.message.toLowerCase()
    const [relationships, opportunities] = await Promise.all([
      this.store.listRelationships(),
      this.store.listOpportunities(),
    ])
    const citations: AgentChatResponse['citations'] = []
    let answer: string
    let suggestedActions: string[]

    const [selectedRelationship, selectedOpportunity] = await Promise.all([
      input.relationshipId ? this.store.getRelationship(input.relationshipId) : undefined,
      input.opportunityId ? this.store.getOpportunity(input.opportunityId) : undefined,
    ])

    if (input.relationshipId) {
      if (!selectedRelationship) {
        answer = '指定的关系对象不存在或已失效，请返回关系中心重新选择。'
        suggestedActions = ['重新选择关系对象', '不要基于缺失上下文准备对外沟通']
      } else {
        answer = `${selectedRelationship.name}当前关系健康度为 ${selectedRelationship.health}（${selectedRelationship.healthScore}/100）。沟通目标建议围绕“${selectedRelationship.nextAction ?? '确认当前需求与下一步'}”展开；最近联系时间为 ${selectedRelationship.lastContactAt?.slice(0, 10) ?? '暂无记录'}。${selectedRelationship.isDemo ? '该关系为演示模拟数据。' : ''}`
        suggestedActions = [selectedRelationship.nextAction ?? '确认当前业务需求', '准备与该对象场景相关的企业资料', '人工审核沟通提纲后再通过既有渠道联系']
        citations.push({ title: selectedRelationship.name, source: selectedRelationship.sourceKind, excerpt: selectedRelationship.description })
        selectedRelationship.touchpoints.slice(0, 2).forEach((item) => citations.push({ title: `${item.occurredAt.slice(0, 10)} 互动记录`, source: '关系互动记录', excerpt: `${item.summary}；结果：${item.outcome}` }))
      }
    } else if (input.opportunityId) {
      if (!selectedOpportunity) {
        answer = '指定的商机不存在或已失效，请返回商机雷达重新选择。'
        suggestedActions = ['重新选择商机', '不要基于缺失上下文准备报价或技术承诺']
      } else {
        answer = `${selectedOpportunity.companyName}的“${selectedOpportunity.title}”当前为 ${selectedOpportunity.grade} 级、${selectedOpportunity.score} 分，阶段为 ${selectedOpportunity.stage}。${selectedOpportunity.insight.summary}`
        suggestedActions = [...selectedOpportunity.insight.recommendedActions.slice(0, 3), '人工确认技术边界与沟通内容后再触达']
        selectedOpportunity.evidence.slice(0, 3).forEach((item) => citations.push({ title: item.title, source: item.url ?? item.kind, excerpt: item.excerpt }))
      }
    } else if (/今天|联系谁|跟进|沉默|待办/u.test(message)) {
      const briefing = await this.briefing()
      const dueNames = briefing.dueFollowUps.slice(0, 3).map((item) => item.name).join('、')
      answer = briefing.summary + (dueNames ? ` 建议先处理：${dueNames}。` : '')
      suggestedActions = ['查看关系中心并记录最新互动', '为到期关系准备沟通提纲', '核验下一步行动负责人']
      for (const item of briefing.dueFollowUps.slice(0, 3)) {
        citations.push({ title: item.name, source: '关系与互动记录', excerpt: item.reason })
      }
    } else if (/上游|供应商|厂商|供应/u.test(message)) {
      const suppliers = relationships.filter((item) => item.role === 'supplier')
      answer = suppliers.length
        ? `当前有 ${suppliers.length} 个上游厂商关系。${suppliers.map((item) => `${item.name}（健康度 ${item.healthScore}，下一步：${item.nextAction ?? '待制定'}）`).join('；')}。`
        : '当前没有上游厂商关系数据，建议先在关系中心补充企业级供应方信息。'
      suggestedActions = ['确认交期与质量数据', '补充供应风险知识', '记录最近一次厂商沟通']
      suppliers.forEach((item) => citations.push({ title: item.name, source: item.sourceKind, excerpt: item.description }))
    } else if (/商机|高潜|机会|采购/u.test(message)) {
      const top = opportunities.slice(0, 3)
      answer = top.length
        ? `当前优先级最高的商机是：${top.map((item) => `${item.companyName}“${item.title}”${item.grade}级/${item.score}分`).join('；')}。分数仅表示跟进优先级，不代表成交概率。`
        : '当前没有可用商机，请补充公开信号或使用 Agent 发现功能。'
      suggestedActions = ['查看高潜商机证据链', '补充项目功率与采购时间', '准备产品匹配沟通材料']
      top.forEach((item) => citations.push({ title: item.title, source: item.evidence[0]?.title ?? '商机记录', excerpt: item.signal }))
    } else if (/产品|船|重卡|制氢|电堆|ocean|cesp/u.test(message)) {
      const [knowledge, productRows] = await Promise.all([
        this.store.searchKnowledge(input.message, 4),
        this.store.listProducts(),
      ])
      const products = productRows.filter((product) => {
        const text = `${product.model} ${product.family} ${product.scenarios.join(' ')}`.toLowerCase()
        return input.message.toLowerCase().split(/\s+/u).some((term) => term.length > 1 && text.includes(term))
          || (/船/u.test(message) && product.family.includes('船用'))
          || (/制氢/u.test(message) && product.family.includes('制氢'))
          || (/重卡/u.test(message) && product.scenarios.includes('重卡'))
      }).slice(0, 4)
      answer = products.length
        ? `可优先关注：${products.map((product) => `${product.model}（${product.ratedPower}，${product.family}）`).join('；')}。这些参数用于线索预筛，正式选型必须由产品专家复核。`
        : '知识库中没有找到足够明确的产品匹配，请补充场景、功率、工况和认证要求。'
      suggestedActions = ['补充额定/峰值功率要求', '核实工况与认证要求', '由售前确认正式选型']
      for (const product of products) citations.push({ title: product.model, source: product.source, excerpt: product.reviewNote ?? product.highlights.join('；') })
      for (const item of knowledge) citations.push(this.knowledgeCitation(item))
    } else {
      const knowledge = await this.store.searchKnowledge(input.message, 5)
      answer = knowledge.length
        ? `我从企业知识库找到 ${knowledge.length} 条相关内容：${knowledge.map((item) => item.title).join('、')}。${knowledge[0]?.content ?? ''}`
        : '当前知识库没有找到直接依据。你可以补充资料，或换一种问法并注明企业、场景、地区和时间范围。'
      suggestedActions = knowledge.length ? ['查看相关知识来源', '继续追问具体场景', '把结论关联到关系对象'] : ['添加文本或 URL 知识', '补充关系互动记录', '输入更具体的业务问题']
      knowledge.forEach((item) => citations.push(this.knowledgeCitation(item)))
    }

    return {
      answer,
      mode: 'rules',
      citations: citations.slice(0, 6),
      suggestedActions,
      generatedAt: today(),
      fallbackReason,
      needsConfirmation: ['任何对外沟通、报价和技术承诺都需要人工确认'],
    }
  }

  private knowledgeCitation(item: KnowledgeItem) {
    return {
      title: item.title,
      source: item.sourceUrl ?? item.sourcePath ?? item.sourceKind,
      excerpt: item.content.slice(0, 180),
    }
  }

  async briefing() {
    const now = new Date()
    const [relationships, opportunities, knowledge] = await Promise.all([
      this.store.listRelationships(),
      this.store.listOpportunities(),
      this.store.listKnowledge(),
    ])
    const dueFollowUps = relationships
      .filter((item) => item.nextActionAt && new Date(item.nextActionAt).getTime() <= now.getTime() + 7 * 86_400_000)
      .map((item) => ({ id: item.id, relationshipId: item.id, name: item.name, reason: item.nextAction ?? '下一步行动已到期', nextAction: item.nextAction, dueAt: item.nextActionAt }))
    const silentRelationships = relationships
      .filter((item) => !item.lastContactAt || daysBetween(item.lastContactAt, now) > 45)
      .map((item) => ({ id: item.id, relationshipId: item.id, name: item.name, reason: item.lastContactAt ? `已约 ${daysBetween(item.lastContactAt, now)} 天未联系` : '尚无联系记录', nextAction: item.nextAction }))
    const highPotentialOpportunities = opportunities
      .filter((item) => item.grade === 'A')
      .slice(0, 5)
      .map((item) => ({ id: item.id, opportunityId: item.id, companyName: item.companyName, title: item.title, reason: item.insight.summary, score: item.score, grade: item.grade }))
    const knowledgeGaps = knowledge.filter((item) => item.status !== 'ready').map((item) => ({ id: item.id, title: item.title, reason: `处理状态：${item.status}` }))
    const summary = `今天有 ${dueFollowUps.length} 项关系跟进进入处理窗口，${silentRelationships.length} 个关系需要恢复联系，${highPotentialOpportunities.length} 个高潜商机值得优先核验。`
    const items = [
      ...dueFollowUps.map((item) => ({ id: `follow-up-${item.id}`, type: 'follow-up' as const, priority: 'high' as const, title: `跟进 ${item.name}`, description: item.reason, relationshipId: item.relationshipId, dueAt: item.dueAt })),
      ...silentRelationships.map((item) => ({ id: `dormant-${item.id}`, type: 'dormant-relationship' as const, priority: 'medium' as const, title: `${item.name} 久未联系`, description: item.reason, relationshipId: item.relationshipId })),
      ...highPotentialOpportunities.map((item) => ({ id: `hot-${item.id}`, type: 'hot-opportunity' as const, priority: 'high' as const, title: item.title, description: item.reason, opportunityId: item.opportunityId })),
      ...knowledgeGaps.map((item) => ({ id: `knowledge-gap-${item.id}`, type: 'knowledge-gap' as const, priority: 'medium' as const, title: item.title, description: item.reason })),
    ]
    return {
      date: now.toISOString().slice(0, 10),
      greeting: '这是基于当前关系、知识和商机数据生成的行动简报。',
      generatedAt: today(),
      mode: this.runtime.intelligent ? 'intelligent' : 'rules',
      summary,
      items,
      dueFollowUps,
      silentRelationships,
      highPotentialOpportunities,
      knowledgeGaps,
      suggestedActions: ['先处理已逾期的关系行动', '再核验高潜商机证据', '补齐待复核产品知识'],
    }
  }

  async dashboard() {
    const [opportunities, relationships, knowledge] = await Promise.all([
      this.store.listOpportunities(),
      this.store.listRelationships(),
      this.store.listKnowledge(),
    ])
    const gradeDistribution = Object.fromEntries(['A', 'B', 'C', 'D'].map((grade) => [grade, opportunities.filter((item) => item.grade === grade).length]))
    const industryDistribution = Object.entries(opportunities.reduce<Record<string, number>>((acc, item) => {
      acc[item.industry] = (acc[item.industry] ?? 0) + 1
      return acc
    }, {})).map(([name, value]) => ({ name, value }))
    const highPotential = opportunities.filter((item) => item.grade === 'A').length
    const newThisWeek = opportunities.filter((item) => daysBetween(item.createdAt) <= 7).length
    const averageScore = opportunities.length ? Math.round(opportunities.reduce((sum, item) => sum + item.score, 0) / opportunities.length) : 0
    const relationshipAttention = relationships.filter((item) => item.health !== 'healthy').length
    const knowledgeTotal = knowledge.length
    return {
      opportunityTotal: opportunities.length,
      highPotential,
      newThisWeek,
      averageScore,
      relationshipTotal: relationships.length,
      relationshipAttention,
      knowledgeTotal,
      metrics: {
        total: opportunities.length,
        highPotential,
        addedThisWeek: newThisWeek,
        averageScore,
      },
      relationshipMetrics: {
        total: relationships.length,
        attention: relationshipAttention,
        suppliers: relationships.filter((item) => item.role === 'supplier').length,
      },
      gradeDistribution,
      industryDistribution,
      topOpportunities: opportunities.slice(0, 5),
      agentMode: this.runtime.intelligent ? 'intelligent' : 'rules',
    }
  }

  listOpportunities(filters: OpportunityFilters) {
    return this.store.listOpportunities(filters)
  }

  async analyze(input: AnalyzeOpportunityInput, actorUserId?: string): Promise<Opportunity> {
    const score = scoreOpportunity(input)
    const products = matchProducts(input, await this.store.listProducts())
    let insight = createRulesInsight(input, score, products)
    if (this.runtime.intelligent) {
      try {
        insight = await this.runtime.analyze(input, score, products)
      } catch (error) {
        void error
        insight = createRulesInsight(input, score, products, '智能研判暂时不可用，已安全降级到规则模式。')
      }
    }
    const timestamp = today()
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
      productMatches: products,
      evidence: [{
        id: `evidence-${crypto.randomUUID()}`,
        kind: input.sourceKind,
        title: input.sourceTitle,
        url: input.sourceUrl,
        occurredAt: input.occurredAt,
        capturedAt: timestamp,
        excerpt: input.signal,
        confidence: input.sourceKind === 'demo-simulated' ? 0.55 : 0.75,
      }],
      insight,
      tags: [input.industry, input.signalType, score.grade === 'A' ? '高潜' : '待培育'],
      isDemo: input.sourceKind === 'demo-simulated',
      createdBy: persistableActorId(actorUserId),
      updatedBy: persistableActorId(actorUserId),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.store.createOpportunity(opportunity)
  }

  async discover(query: string, region: string | undefined, days: number, actorUserId?: string) {
    if (this.runtime.intelligent) {
      try {
        const rows = await this.runtime.discover(query, region, days)
        await this.safeActivity(actorUserId, 'opportunities.discover')
        return { mode: 'intelligent', notice: '联网候选均为待核验材料，不会自动触达或写入跟进阶段。', candidates: rows.map((item) => this.scoreResearchCandidate(item)) }
      } catch (error) {
        console.error('[discover] 实时搜索失败:', error)
        return this.demoDiscovery('实时搜索暂时不可用')
      }
    }
    return this.demoDiscovery('未配置模型或实时搜索密钥')
  }

  private scoreResearchCandidate(item: ResearchCandidate) {
    const parsed: AnalyzeOpportunityInput = {
      ...item,
      maturity: 'planning',
      contactability: 'public-channel',
      sourceKind: 'public',
      strategic: false,
    }
    const score = scoreOpportunity(parsed)
    return { ...item, score: score.score, grade: score.grade, status: 'verifying' }
  }

  private async demoDiscovery(reason: string) {
    const candidates = (await this.store.listOpportunities()).slice(0, 4).map((item) => ({
      id: item.id,
      companyName: item.companyName,
      title: item.title,
      signal: item.signal,
      industry: item.industry,
      region: item.region,
      score: item.score,
      grade: item.grade,
      status: 'verifying',
      verificationStatus: 'pending',
      confidence: item.evidence[0]?.confidence,
      sourceTitle: item.evidence[0]?.title ?? '【模拟】内置演示来源',
      sourceUrl: item.evidence[0]?.url ?? `https://example.com/demo-only/${encodeURIComponent(item.id)}`,
      occurredAt: item.evidence[0]?.occurredAt,
      isDemo: true,
    }))
    return {
      mode: 'demo',
      fallbackReason: reason,
      notice: `演示模式：${reason}。以下为显著标注的模拟候选，来源链接是 example.com 演示占位符，不代表实时搜索结果；候选均须人工核验且不会自动触达。`,
      candidates,
    }
  }

  createKnowledge(input: CreateKnowledgeInput, actorUserId?: string) {
    return this.store.createKnowledge(input, persistableActorId(actorUserId))
  }

  addTouchpoint(id: string, input: CreateTouchpointInput, actorUserId?: string) {
    return this.store.addTouchpoint(id, input, persistableActorId(actorUserId))
  }

  updateOpportunityStage(id: string, stage: Opportunity['stage'], actorUserId?: string) {
    return this.store.updateOpportunityStage(id, stage, persistableActorId(actorUserId)).then(async (item) => {
      if (item) await this.safeActivity(actorUserId, 'opportunities.stage', 'opportunity', id)
      return item
    })
  }

  private async safeActivity(actorUserId: string | undefined, action: string, targetType?: string, targetId?: string) {
    try {
      await this.store.recordActivity({ actorUserId: persistableActorId(actorUserId), action, targetType, targetId })
    } catch {
      // 活动日志失败不影响主路径
    }
  }
}
