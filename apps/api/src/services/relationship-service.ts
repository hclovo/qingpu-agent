import type { AgentBriefing, Relationship } from '@qingpu/contracts'
import type { MemoryStore } from '../store/memory-store.js'

export class RelationshipService {
  constructor(private readonly store: MemoryStore) {}

  list(role?: Relationship['role']) {
    return this.store.listRelationships(role)
  }

  get(id: string) {
    const relationship = this.store.getRelationship(id)
    if (!relationship) return undefined
    return {
      ...relationship,
      relatedOpportunities: relationship.opportunityIds
        .map((opportunityId) => this.store.getOpportunity(opportunityId))
        .filter((item) => item !== undefined),
      relatedKnowledge: this.store.listKnowledge().filter((item) => item.relationshipIds.includes(id)),
    }
  }

  addTouchpoint(id: string, input: Parameters<MemoryStore['addTouchpoint']>[1]) {
    return this.store.addTouchpoint(id, input)
  }

  briefing(now = new Date()): AgentBriefing & {
    mode: 'rules'
    dueFollowUps: Relationship[]
    silentRelationships: Relationship[]
    highPotentialOpportunities: ReturnType<MemoryStore['listOpportunities']>
    knowledgeGaps: string[]
    suggestedActions: string[]
  } {
    const relationships = this.store.listRelationships()
    const dueFollowUps = relationships.filter((item) => item.nextActionAt && new Date(item.nextActionAt) <= now)
    const silentRelationships = relationships.filter((item) => !item.lastContactAt || now.getTime() - new Date(item.lastContactAt).getTime() > 45 * 86_400_000)
    const highPotentialOpportunities = this.store.listOpportunities().filter((item) => item.grade === 'A').slice(0, 5)
    const knowledgeGaps = [
      ...(relationships.some((item) => item.role === 'supplier' && item.health !== 'healthy') ? ['上游厂商交期与产能信息需要更新'] : []),
      ...(highPotentialOpportunities.some((item) => item.productMatches.some((match) => match.gaps.length)) ? ['高优先级商机仍缺功率、工况或认证确认'] : []),
    ]
    const items: AgentBriefing['items'] = [
      ...dueFollowUps.map((item) => ({ id: `due-${item.id}`, type: 'follow-up' as const, priority: 'high' as const, title: `跟进 ${item.name}`, description: item.nextAction ?? '确认下一步行动', relationshipId: item.id, dueAt: item.nextActionAt })),
      ...silentRelationships.filter((item) => !dueFollowUps.some((due) => due.id === item.id)).map((item) => ({ id: `silent-${item.id}`, type: 'dormant-relationship' as const, priority: 'medium' as const, title: `${item.name} 已久未联系`, description: '建议先核验关系现状，再准备一次低打扰的业务更新。', relationshipId: item.id })),
      ...highPotentialOpportunities.map((item) => ({ id: `hot-${item.id}`, type: 'hot-opportunity' as const, priority: item.grade === 'A' ? 'high' as const : 'medium' as const, title: item.title, description: `${item.companyName} · ${item.score}分 · ${item.grade}级`, opportunityId: item.id })),
      ...knowledgeGaps.map((gap, index) => ({ id: `gap-${index}`, type: 'knowledge-gap' as const, priority: 'medium' as const, title: '补充业务信息', description: gap })),
    ]
    return {
      date: now.toISOString().slice(0, 10),
      greeting: '这是基于当前关系、知识和商机数据生成的行动简报。',
      summary: `今天有 ${dueFollowUps.length} 项到期跟进、${silentRelationships.length} 个沉默关系和 ${highPotentialOpportunities.length} 个重点商机。`,
      items,
      mode: 'rules',
      dueFollowUps,
      silentRelationships,
      highPotentialOpportunities,
      knowledgeGaps,
      suggestedActions: items.slice(0, 4).map((item) => item.title),
    }
  }
}
