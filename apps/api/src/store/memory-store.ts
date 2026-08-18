import type {
  CreateKnowledgeInput,
  CreateTouchpointInput,
  KnowledgeItem,
  Opportunity,
  Product,
  Relationship,
} from '@qingpu/contracts'
import { relationshipHealth } from '@qingpu/domain'
import { createSeedData } from '../data/seed.js'
import type { BusinessStore, OpportunityFilters } from './store.js'

const clone = <T>(value: T): T => structuredClone(value)
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export class MemoryStore implements BusinessStore {
  readonly kind = 'memory' as const
  private products: Product[]
  private relationships: Relationship[]
  private knowledge: KnowledgeItem[]
  private opportunities: Opportunity[]

  constructor(seed = createSeedData()) {
    this.products = seed.products
    this.relationships = seed.relationships
    this.knowledge = seed.knowledge
    this.opportunities = seed.opportunities
  }

  async listProducts(): Promise<Product[]> {
    return clone(this.products)
  }

  async listRelationships(role?: Relationship['role']): Promise<Relationship[]> {
    const rows = role ? this.relationships.filter((item) => item.role === role) : this.relationships
    return clone(rows.sort((a, b) => b.healthScore - a.healthScore))
  }

  async getRelationship(id: string): Promise<Relationship | undefined> {
    const row = this.relationships.find((item) => item.id === id)
    return row ? clone(row) : undefined
  }

  async addTouchpoint(id: string, input: CreateTouchpointInput): Promise<Relationship | undefined> {
    const relationship = this.relationships.find((item) => item.id === id)
    if (!relationship) return undefined
    const timestamp = new Date().toISOString()
    relationship.touchpoints.unshift({
      id: makeId('touchpoint'),
      ...input,
      createdAt: timestamp,
    })
    relationship.lastContactAt = input.occurredAt
    relationship.nextAction = input.nextAction
    relationship.nextActionAt = input.nextActionAt
    relationship.updatedAt = timestamp
    relationship.health = relationshipHealth(relationship)
    relationship.healthScore = relationship.health === 'healthy' ? Math.max(relationship.healthScore, 75)
      : relationship.health === 'attention' ? Math.min(relationship.healthScore, 69)
        : Math.min(relationship.healthScore, 44)
    return clone(relationship)
  }

  async listKnowledge(query?: string, status?: KnowledgeItem['status']): Promise<KnowledgeItem[]> {
    const needle = query?.trim().toLowerCase()
    return clone(this.knowledge
      .filter((item) => !status || item.status === status)
      .filter((item) => !needle || [item.title, item.content, ...item.tags].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  }

  async searchKnowledge(query: string, limit = 8): Promise<KnowledgeItem[]> {
    const terms = query.toLowerCase().split(/\s+/u).filter(Boolean)
    return clone(this.knowledge
      .map((item) => {
        const title = item.title.toLowerCase()
        const content = item.content.toLowerCase()
        const tags = item.tags.join(' ').toLowerCase()
        const score = terms.reduce((total, term) => total
          + (title.includes(term) ? 6 : 0)
          + (tags.includes(term) ? 3 : 0)
          + (content.includes(term) ? 1 : 0), 0)
        return { item, score }
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
      .slice(0, limit)
      .map(({ item }) => item))
  }

  async createKnowledge(input: CreateKnowledgeInput): Promise<KnowledgeItem> {
    const timestamp = new Date().toISOString()
    const item: KnowledgeItem = {
      id: makeId('knowledge'),
      ...input,
      tags: [...new Set(input.tags)],
      relationshipIds: [...new Set(input.relationshipIds)],
      status: input.type === 'file' && !/\.(txt|md|csv|json)$/iu.test(input.sourcePath ?? '') ? 'pending' : 'ready',
      isDemo: input.sourceKind === 'demo-simulated',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.knowledge.unshift(item)
    return clone(item)
  }

  async listOpportunities(filters: OpportunityFilters = {}): Promise<Opportunity[]> {
    const needle = filters.q?.trim().toLowerCase()
    return clone(this.opportunities
      .filter((item) => !filters.industry || item.industry === filters.industry)
      .filter((item) => !filters.grade || item.grade === filters.grade)
      .filter((item) => !filters.stage || item.stage === filters.stage)
      .filter((item) => !needle || [item.companyName, item.title, item.signal, item.region, ...item.tags].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)))
  }

  async getOpportunity(id: string): Promise<Opportunity | undefined> {
    const row = this.opportunities.find((item) => item.id === id)
    return row ? clone(row) : undefined
  }

  async createOpportunity(opportunity: Opportunity): Promise<Opportunity> {
    this.opportunities.unshift(clone(opportunity))
    if (opportunity.relationshipId) {
      const relationship = this.relationships.find((item) => item.id === opportunity.relationshipId)
      if (relationship && !relationship.opportunityIds.includes(opportunity.id)) {
        relationship.opportunityIds.unshift(opportunity.id)
        relationship.updatedAt = opportunity.createdAt
      }
    }
    return clone(opportunity)
  }

  async updateOpportunityStage(id: string, stage: Opportunity['stage']): Promise<Opportunity | undefined> {
    const opportunity = this.opportunities.find((item) => item.id === id)
    if (!opportunity) return undefined
    opportunity.stage = stage
    opportunity.updatedAt = new Date().toISOString()
    return clone(opportunity)
  }

  async hasOpportunityFingerprint(companyName: string, title: string): Promise<boolean> {
    const normalize = (value: string) => value.trim().toLowerCase()
    return this.opportunities.some((item) => normalize(item.companyName) === normalize(companyName) && normalize(item.title) === normalize(title))
  }
}
