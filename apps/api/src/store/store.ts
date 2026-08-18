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

export interface OpportunityFilters {
  q?: string
  industry?: string
  grade?: OpportunityGrade
  stage?: OpportunityStage
}

export class DuplicateOpportunityError extends Error {
  readonly code = 'DUPLICATE_OPPORTUNITY'
}

/**
 * API 持久化端口。所有实现都使用异步签名，使内存模式和 PostgreSQL 模式
 * 可以在不改变 Service/API 契约的前提下互换。
 */
export interface BusinessStore {
  readonly kind: 'memory' | 'postgres'
  listProducts(): Promise<Product[]>
  listRelationships(role?: Relationship['role']): Promise<Relationship[]>
  getRelationship(id: string): Promise<Relationship | undefined>
  addTouchpoint(id: string, input: CreateTouchpointInput): Promise<Relationship | undefined>
  listKnowledge(query?: string, status?: KnowledgeItem['status']): Promise<KnowledgeItem[]>
  searchKnowledge(query: string, limit?: number): Promise<KnowledgeItem[]>
  createKnowledge(input: CreateKnowledgeInput): Promise<KnowledgeItem>
  listOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]>
  getOpportunity(id: string): Promise<Opportunity | undefined>
  createOpportunity(opportunity: Opportunity): Promise<Opportunity>
  updateOpportunityStage(id: string, stage: OpportunityStage): Promise<Opportunity | undefined>
  hasOpportunityFingerprint(companyName: string, title: string): Promise<boolean>
  close?(): Promise<void>
}
