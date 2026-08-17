import type { Dashboard } from '@qingpu/contracts'
import type { MemoryStore } from '../store/memory-store.js'

export class DashboardService {
  constructor(private readonly store: MemoryStore) {}

  get(): Dashboard & { stageDistribution: Record<string, number>; agentMode: 'intelligent' | 'rules' } {
    const opportunities = this.store.listOpportunities()
    const relationships = this.store.listRelationships()
    const weekAgo = Date.now() - 7 * 86_400_000
    const countBy = (values: string[]) => values.reduce<Record<string, number>>((result, value) => {
      result[value] = (result[value] ?? 0) + 1
      return result
    }, {})
    const industryCounts = countBy(opportunities.map((item) => item.industry))
    return {
      opportunityTotal: opportunities.length,
      highPotential: opportunities.filter((item) => item.grade === 'A').length,
      newThisWeek: opportunities.filter((item) => new Date(item.createdAt).getTime() >= weekAgo).length,
      averageScore: opportunities.length ? Math.round(opportunities.reduce((sum, item) => sum + item.score, 0) / opportunities.length * 10) / 10 : 0,
      relationshipTotal: relationships.length,
      relationshipAttention: relationships.filter((item) => item.health !== 'healthy').length,
      knowledgeTotal: this.store.listKnowledge().length,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, ...countBy(opportunities.map((item) => item.grade)) },
      industryDistribution: Object.entries(industryCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      topOpportunities: opportunities.slice(0, 5),
      stageDistribution: countBy(opportunities.map((item) => item.stage)),
      agentMode: 'rules',
    }
  }
}
