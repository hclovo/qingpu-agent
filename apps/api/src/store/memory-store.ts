import type {
  CreateKnowledgeInput,
  CreateTouchpointInput,
  KnowledgeItem,
  Opportunity,
  OpportunityGrade,
  OpportunityStage,
  Product,
  Relationship,
} from '@qingpu/contracts'
import { relationshipHealth } from '@qingpu/domain'
import { createSeedData } from '../data/seed.js'

export interface OpportunityFilters {
  q?: string
  industry?: string
  grade?: OpportunityGrade
  stage?: OpportunityStage
}

const clone = <T>(value: T): T => structuredClone(value)
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export class MemoryStore {
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

  listProducts(): Product[] {
    return clone(this.products)
  }

  listRelationships(role?: Relationship['role']): Relationship[] {
    const rows = role ? this.relationships.filter((item) => item.role === role) : this.relationships
    return clone(rows.sort((a, b) => b.healthScore - a.healthScore))
  }

  getRelationship(id: string): Relationship | undefined {
    const row = this.relationships.find((item) => item.id === id)
    return row ? clone(row) : undefined
  }

  addTouchpoint(id: string, input: CreateTouchpointInput): Relationship | undefined {
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

  listKnowledge(query?: string, status?: KnowledgeItem['status']): KnowledgeItem[] {
    const needle = query?.trim().toLowerCase()
    return clone(this.knowledge
      .filter((item) => !status || item.status === status)
      .filter((item) => !needle || [item.title, item.content, ...item.tags].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  }

  searchKnowledge(query: string, limit = 8): KnowledgeItem[] {
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

  createKnowledge(input: CreateKnowledgeInput): KnowledgeItem {
    const timestamp = new Date().toISOString()
    const item: KnowledgeItem = {
      id: makeId('knowledge'),
      ...input,
      status: input.type === 'file' && !/\.(txt|md|csv|json)$/iu.test(input.sourcePath ?? '') ? 'pending' : 'ready',
      isDemo: input.sourceKind === 'demo-simulated',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.knowledge.unshift(item)
    return clone(item)
  }

  listOpportunities(filters: OpportunityFilters = {}): Opportunity[] {
    const needle = filters.q?.trim().toLowerCase()
    return clone(this.opportunities
      .filter((item) => !filters.industry || item.industry === filters.industry)
      .filter((item) => !filters.grade || item.grade === filters.grade)
      .filter((item) => !filters.stage || item.stage === filters.stage)
      .filter((item) => !needle || [item.companyName, item.title, item.signal, item.region, ...item.tags].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt)))
  }

  getOpportunity(id: string): Opportunity | undefined {
    const row = this.opportunities.find((item) => item.id === id)
    return row ? clone(row) : undefined
  }

  createOpportunity(opportunity: Opportunity): Opportunity {
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

  updateOpportunityStage(id: string, stage: OpportunityStage): Opportunity | undefined {
    const opportunity = this.opportunities.find((item) => item.id === id)
    if (!opportunity) return undefined
    opportunity.stage = stage
    opportunity.updatedAt = new Date().toISOString()
    return clone(opportunity)
  }

  hasOpportunityFingerprint(companyName: string, title: string): boolean {
    const normalize = (value: string) => value.trim().toLowerCase()
    return this.opportunities.some((item) => normalize(item.companyName) === normalize(companyName) && normalize(item.title) === normalize(title))
  }
}
