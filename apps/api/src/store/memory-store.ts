import type {
  CreateKnowledgeInput,
  CreateTouchpointInput,
  KnowledgeItem,
  Opportunity,
  Permission,
  Product,
  Relationship,
} from '@qingpu/contracts'
import { effectivePermissions } from '@qingpu/contracts'
import { relationshipHealth } from '@qingpu/domain'
import type { ActivityEntry, StoredRole, StoredSession, StoredUser, StoredUserRole } from '../auth/types.js'
import { createSeedRoles, createSeedUserRoles } from '../data/seed-roles.js'
import { createSeedData } from '../data/seed.js'
import { createSeedUsers } from '../data/seed-users.js'
import type { BusinessStore, OpportunityFilters } from './store.js'

const clone = <T>(value: T): T => structuredClone(value)
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export class MemoryStore implements BusinessStore {
  readonly kind = 'memory' as const
  private products: Product[]
  private relationships: Relationship[]
  private knowledge: KnowledgeItem[]
  private opportunities: Opportunity[]
  private users: StoredUser[]
  private roles: StoredRole[]
  private userRoles: StoredUserRole[]
  private sessions: StoredSession[] = []

  constructor(seed = createSeedData()) {
    this.products = seed.products
    this.relationships = seed.relationships
    this.knowledge = seed.knowledge
    this.opportunities = seed.opportunities
    this.users = createSeedUsers()
    this.roles = createSeedRoles()
    this.userRoles = createSeedUserRoles()
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

  async addTouchpoint(id: string, input: CreateTouchpointInput, actorUserId?: string): Promise<Relationship | undefined> {
    const relationship = this.relationships.find((item) => item.id === id)
    if (!relationship) return undefined
    const timestamp = new Date().toISOString()
    relationship.touchpoints.unshift({
      id: makeId('touchpoint'),
      ...input,
      createdAt: timestamp,
      createdBy: actorUserId,
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

  async createKnowledge(input: CreateKnowledgeInput, actorUserId?: string): Promise<KnowledgeItem> {
    const timestamp = new Date().toISOString()
    const item: KnowledgeItem = {
      id: makeId('knowledge'),
      ...input,
      tags: [...new Set(input.tags)],
      relationshipIds: [...new Set(input.relationshipIds)],
      status: input.type === 'file' && !/\.(txt|md|csv|json)$/iu.test(input.sourcePath ?? '') ? 'pending' : 'ready',
      isDemo: input.sourceKind === 'demo-simulated',
      createdBy: actorUserId,
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

  async updateOpportunityStage(id: string, stage: Opportunity['stage'], actorUserId?: string): Promise<Opportunity | undefined> {
    const opportunity = this.opportunities.find((item) => item.id === id)
    if (!opportunity) return undefined
    opportunity.stage = stage
    opportunity.updatedBy = actorUserId
    opportunity.updatedAt = new Date().toISOString()
    return clone(opportunity)
  }

  async hasOpportunityFingerprint(companyName: string, title: string): Promise<boolean> {
    const normalize = (value: string) => value.trim().toLowerCase()
    return this.opportunities.some((item) => normalize(item.companyName) === normalize(companyName) && normalize(item.title) === normalize(title))
  }

  async listUsers(): Promise<StoredUser[]> {
    return clone(this.users)
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    const row = this.users.find((item) => item.id === id)
    return row ? clone(row) : undefined
  }

  async getUserByEmail(email: string): Promise<StoredUser | undefined> {
    const needle = email.trim().toLowerCase()
    const row = this.users.find((item) => item.email === needle)
    return row ? clone(row) : undefined
  }

  async createUser(user: StoredUser): Promise<StoredUser> {
    const row = { ...user, email: user.email.trim().toLowerCase() }
    this.users.push(row)
    return clone(row)
  }

  async updateUser(id: string, patch: Partial<StoredUser>): Promise<StoredUser | undefined> {
    const row = this.users.find((item) => item.id === id)
    if (!row) return undefined
    Object.assign(row, patch, { updatedAt: new Date().toISOString() })
    return clone(row)
  }

  async listRoles(): Promise<StoredRole[]> {
    return clone(this.roles.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh')))
  }

  async getRoleById(id: string): Promise<StoredRole | undefined> {
    const row = this.roles.find((item) => item.id === id)
    return row ? clone(row) : undefined
  }

  async getRoleByCode(code: string): Promise<StoredRole | undefined> {
    const row = this.roles.find((item) => item.code === code)
    return row ? clone(row) : undefined
  }

  async createRole(role: StoredRole): Promise<StoredRole> {
    this.roles.push({ ...role })
    return clone(role)
  }

  async updateRole(id: string, patch: Partial<StoredRole>): Promise<StoredRole | undefined> {
    const row = this.roles.find((item) => item.id === id)
    if (!row) return undefined
    Object.assign(row, patch, { updatedAt: new Date().toISOString() })
    return clone(row)
  }

  async deleteRole(id: string): Promise<boolean> {
    const before = this.roles.length
    this.roles = this.roles.filter((item) => item.id !== id)
    this.userRoles = this.userRoles.filter((item) => item.roleId !== id)
    return this.roles.length < before
  }

  async listUserRoleIds(userId: string): Promise<string[]> {
    return this.userRoles.filter((item) => item.userId === userId).map((item) => item.roleId)
  }

  async setUserRoles(userId: string, roleIds: string[], assignedBy?: string): Promise<void> {
    const now = new Date().toISOString()
    this.userRoles = this.userRoles.filter((item) => item.userId !== userId)
    this.userRoles.push(...[...new Set(roleIds)].map((roleId) => ({ userId, roleId, assignedAt: now, assignedBy })))
  }

  async countUsersWithRole(roleId: string): Promise<number> {
    return this.userRoles.filter((item) => item.roleId === roleId).length
  }

  async countActiveUsersWithPermission(permission: Permission): Promise<number> {
    return this.users.filter((user) => {
      if (user.status !== 'active') return false
      const perms = effectivePermissions(
        ...this.userRoles.filter((item) => item.userId === user.id)
          .map((item) => this.roles.find((role) => role.id === item.roleId)?.permissions ?? []),
      )
      return perms.includes(permission)
    }).length
  }

  async createSession(session: StoredSession): Promise<void> {
    this.sessions.push(session)
  }

  async getSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    const row = this.sessions.find((item) => item.tokenHash === tokenHash)
    return row ? clone(row) : undefined
  }

  async touchSession(id: string, lastSeenAt: string): Promise<void> {
    const row = this.sessions.find((item) => item.id === id)
    if (row) row.lastSeenAt = lastSeenAt
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions = this.sessions.filter((item) => item.id !== id)
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    this.sessions = this.sessions.filter((item) => item.userId !== userId)
  }

  async recordActivity(_entry: ActivityEntry): Promise<void> {}
}
