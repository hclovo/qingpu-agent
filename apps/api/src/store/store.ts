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
import type { Permission } from '@qingpu/contracts'
import type { ActivityEntry, StoredRole, StoredSession, StoredUser } from '../auth/types.js'

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
  addTouchpoint(id: string, input: CreateTouchpointInput, actorUserId?: string): Promise<Relationship | undefined>
  listKnowledge(query?: string, status?: KnowledgeItem['status']): Promise<KnowledgeItem[]>
  searchKnowledge(query: string, limit?: number): Promise<KnowledgeItem[]>
  createKnowledge(input: CreateKnowledgeInput, actorUserId?: string): Promise<KnowledgeItem>
  listOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]>
  getOpportunity(id: string): Promise<Opportunity | undefined>
  createOpportunity(opportunity: Opportunity): Promise<Opportunity>
  updateOpportunityStage(id: string, stage: OpportunityStage, actorUserId?: string): Promise<Opportunity | undefined>
  hasOpportunityFingerprint(companyName: string, title: string): Promise<boolean>
  listUsers(): Promise<StoredUser[]>
  getUserById(id: string): Promise<StoredUser | undefined>
  getUserByEmail(email: string): Promise<StoredUser | undefined>
  createUser(user: StoredUser): Promise<StoredUser>
  updateUser(id: string, patch: Partial<StoredUser>): Promise<StoredUser | undefined>
  listRoles(): Promise<StoredRole[]>
  getRoleById(id: string): Promise<StoredRole | undefined>
  getRoleByCode(code: string): Promise<StoredRole | undefined>
  createRole(role: StoredRole): Promise<StoredRole>
  updateRole(id: string, patch: Partial<StoredRole>): Promise<StoredRole | undefined>
  deleteRole(id: string): Promise<boolean>
  listUserRoleIds(userId: string): Promise<string[]>
  setUserRoles(userId: string, roleIds: string[], assignedBy?: string): Promise<void>
  countUsersWithRole(roleId: string): Promise<number>
  countActiveUsersWithPermission(permission: Permission): Promise<number>
  createSession(session: StoredSession): Promise<void>
  getSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined>
  touchSession(id: string, lastSeenAt: string): Promise<void>
  deleteSession(id: string): Promise<void>
  deleteSessionsForUser(userId: string): Promise<void>
  recordActivity(entry: ActivityEntry): Promise<void>
  close?(): Promise<void>
}
