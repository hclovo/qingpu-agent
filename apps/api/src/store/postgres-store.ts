import type {
  CreateKnowledgeInput,
  CreateTouchpointInput,
  KnowledgeItem,
  Opportunity,
  Permission,
  Product,
  Relationship,
  ScoreDimension,
} from '@qingpu/contracts'
import { effectivePermissions, sanitizeRolePermissions } from '@qingpu/contracts'
import { relationshipHealth } from '@qingpu/domain'
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { Sql } from 'postgres'
import type { AppDatabase } from '../db/client.js'
import {
  agentInsights,
  knowledgeItemRelationships,
  knowledgeItems,
  knowledgeTags,
  opportunities,
  opportunityProductMatches,
  opportunityScoreDimensions,
  opportunityTags,
  products,
  relationships,
  relationshipTags,
  activityLogs,
  rolePermissions,
  roles,
  sessions,
  sourceEvidences,
  touchpoints,
  userRoles,
  users,
} from '../db/schema/index.js'
import type { ActivityEntry, StoredRole, StoredSession, StoredUser } from '../auth/types.js'
import { DuplicateOpportunityError, type BusinessStore, type OpportunityFilters } from './store.js'

const iso = (value: Date) => value.toISOString()
const optionalIso = (value: Date | null) => value ? iso(value) : undefined
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

const groupBy = <T, K extends string>(rows: T[], key: (row: T) => K): Map<K, T[]> => {
  const result = new Map<K, T[]>()
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row])
  return result
}

const scoreOrder: Record<ScoreDimension['key'], number> = {
  fit: 0,
  demand: 1,
  recency: 2,
  maturity: 3,
  contactability: 4,
  strategic: 5,
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}

export class PostgresStore implements BusinessStore {
  readonly kind = 'postgres' as const

  constructor(private readonly db: AppDatabase, private readonly client?: Sql) {}

  async close() {
    await this.client?.end()
  }

  async listProducts(): Promise<Product[]> {
    const rows = await this.db.select().from(products).orderBy(products.model)
    return rows.map((row) => ({
      id: row.id,
      model: row.model,
      family: row.family,
      ratedPower: row.ratedPower,
      peakPower: row.peakPower ?? undefined,
      lifeHours: row.lifeHours ?? undefined,
      certifications: row.certifications,
      scenarios: row.scenarios,
      highlights: row.highlights,
      source: row.source,
      sourcePage: row.sourcePage ?? undefined,
      reviewNote: row.reviewNote ?? undefined,
    }))
  }

  async listRelationships(role?: Relationship['role']): Promise<Relationship[]> {
    const rows = await this.db.select().from(relationships)
      .where(role ? eq(relationships.role, role) : undefined)
      .orderBy(desc(relationships.healthScore))
    return this.hydrateRelationships(rows)
  }

  async getRelationship(id: string): Promise<Relationship | undefined> {
    const [row] = await this.db.select().from(relationships).where(eq(relationships.id, id)).limit(1)
    if (!row) return undefined
    return (await this.hydrateRelationships([row]))[0]
  }

  private async hydrateRelationships(rows: Array<typeof relationships.$inferSelect>): Promise<Relationship[]> {
    if (!rows.length) return []
    const ids = rows.map((row) => row.id)
    const [tagRows, touchpointRows, opportunityRows] = await Promise.all([
      this.db.select().from(relationshipTags).where(inArray(relationshipTags.relationshipId, ids)),
      this.db.select().from(touchpoints).where(inArray(touchpoints.relationshipId, ids)).orderBy(desc(touchpoints.occurredAt)),
      this.db.select({ id: opportunities.id, relationshipId: opportunities.relationshipId }).from(opportunities).where(inArray(opportunities.relationshipId, ids)),
    ])
    const tagsByRelationship = groupBy(tagRows, (row) => row.relationshipId)
    const touchpointsByRelationship = groupBy(touchpointRows, (row) => row.relationshipId)
    const opportunitiesByRelationship = groupBy(opportunityRows.filter((row): row is typeof row & { relationshipId: string } => Boolean(row.relationshipId)), (row) => row.relationshipId)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      industry: row.industry,
      region: row.region,
      description: row.description,
      health: row.health,
      healthScore: row.healthScore,
      lastContactAt: optionalIso(row.lastContactAt),
      nextAction: row.nextAction ?? undefined,
      nextActionAt: optionalIso(row.nextActionAt),
      tags: (tagsByRelationship.get(row.id) ?? []).map((item) => item.tag),
      opportunityIds: (opportunitiesByRelationship.get(row.id) ?? []).map((item) => item.id),
      touchpoints: (touchpointsByRelationship.get(row.id) ?? []).map((item) => ({
        id: item.id,
        occurredAt: iso(item.occurredAt),
        channel: item.channel,
        summary: item.summary,
        outcome: item.outcome,
        nextAction: item.nextAction ?? undefined,
        nextActionAt: optionalIso(item.nextActionAt),
        createdAt: iso(item.createdAt),
        createdBy: item.createdBy ?? undefined,
      })),
      sourceKind: row.sourceKind,
      isDemo: row.isDemo,
      updatedAt: iso(row.updatedAt),
    }))
  }

  async addTouchpoint(id: string, input: CreateTouchpointInput, actorUserId?: string): Promise<Relationship | undefined> {
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(relationships).where(eq(relationships.id, id)).for('update').limit(1)
      if (!row) return false
      const timestamp = new Date()
      const occurredAt = new Date(input.occurredAt)
      const nextActionAt = input.nextActionAt ? new Date(input.nextActionAt) : null
      const candidate: Relationship = {
        id: row.id,
        name: row.name,
        role: row.role,
        industry: row.industry,
        region: row.region,
        description: row.description,
        health: row.health,
        healthScore: row.healthScore,
        lastContactAt: input.occurredAt,
        nextAction: input.nextAction,
        nextActionAt: input.nextActionAt,
        tags: [],
        opportunityIds: [],
        touchpoints: [],
        sourceKind: row.sourceKind,
        isDemo: row.isDemo,
        updatedAt: timestamp.toISOString(),
      }
      const health = relationshipHealth(candidate)
      const healthScore = health === 'healthy' ? Math.max(row.healthScore, 75)
        : health === 'attention' ? Math.min(row.healthScore, 69) : Math.min(row.healthScore, 44)
      await tx.insert(touchpoints).values({
        id: makeId('touchpoint'),
        relationshipId: id,
        occurredAt,
        channel: input.channel,
        summary: input.summary,
        outcome: input.outcome,
        nextAction: input.nextAction,
        nextActionAt,
        createdBy: actorUserId,
        createdAt: timestamp,
      })
      await tx.update(relationships).set({
        lastContactAt: occurredAt,
        nextAction: input.nextAction ?? null,
        nextActionAt,
        health,
        healthScore,
        updatedAt: timestamp,
      }).where(eq(relationships.id, id))
      return true
    })
    return updated ? this.getRelationship(id) : undefined
  }

  async listKnowledge(query?: string, status?: KnowledgeItem['status']): Promise<KnowledgeItem[]> {
    const conditions: SQL[] = []
    if (status) conditions.push(eq(knowledgeItems.status, status))
    if (query?.trim()) {
      const pattern = `%${query.trim()}%`
      conditions.push(or(
        ilike(knowledgeItems.title, pattern),
        ilike(knowledgeItems.content, pattern),
        sql`EXISTS (SELECT 1 FROM ${knowledgeTags} kt WHERE kt.knowledge_item_id = ${knowledgeItems.id} AND kt.tag ILIKE ${pattern})`,
      )!)
    }
    const rows = await this.db.select().from(knowledgeItems)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(knowledgeItems.updatedAt))
    return this.hydrateKnowledge(rows)
  }

  async searchKnowledge(query: string, limit = 8): Promise<KnowledgeItem[]> {
    const terms = query.toLowerCase().split(/\s+/u).filter(Boolean)
    if (!terms.length) return []
    const termConditions = terms.map((term) => {
      const pattern = `%${term}%`
      return or(
        ilike(knowledgeItems.title, pattern),
        ilike(knowledgeItems.content, pattern),
        sql`EXISTS (SELECT 1 FROM ${knowledgeTags} kt WHERE kt.knowledge_item_id = ${knowledgeItems.id} AND kt.tag ILIKE ${pattern})`,
      )!
    })
    const candidateRows = await this.db.select().from(knowledgeItems)
      .where(or(...termConditions))
      .orderBy(desc(knowledgeItems.updatedAt))
      .limit(Math.max(limit * 10, 50))
    const candidates = await this.hydrateKnowledge(candidateRows)
    return candidates.map((item) => ({
      item,
      score: terms.reduce((total, term) => total
        + (item.title.toLowerCase().includes(term) ? 6 : 0)
        + (item.tags.join(' ').toLowerCase().includes(term) ? 3 : 0)
        + (item.content.toLowerCase().includes(term) ? 1 : 0), 0),
    })).filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
      .slice(0, limit)
      .map(({ item }) => item)
  }

  private async hydrateKnowledge(rows: Array<typeof knowledgeItems.$inferSelect>): Promise<KnowledgeItem[]> {
    if (!rows.length) return []
    const ids = rows.map((row) => row.id)
    const [tagRows, relationshipRows] = await Promise.all([
      this.db.select().from(knowledgeTags).where(inArray(knowledgeTags.knowledgeItemId, ids)),
      this.db.select().from(knowledgeItemRelationships).where(inArray(knowledgeItemRelationships.knowledgeItemId, ids)),
    ])
    const tagsByItem = groupBy(tagRows, (row) => row.knowledgeItemId)
    const relationshipsByItem = groupBy(relationshipRows, (row) => row.knowledgeItemId)
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      content: row.content,
      sourceUrl: row.sourceUrl ?? undefined,
      sourcePath: row.sourcePath ?? undefined,
      tags: (tagsByItem.get(row.id) ?? []).map((item) => item.tag),
      relationshipIds: (relationshipsByItem.get(row.id) ?? []).map((item) => item.relationshipId),
      status: row.status,
      sourceKind: row.sourceKind,
      isDemo: row.isDemo,
      createdBy: row.createdBy ?? undefined,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }))
  }

  async createKnowledge(input: CreateKnowledgeInput, actorUserId?: string): Promise<KnowledgeItem> {
    const id = makeId('knowledge')
    const timestamp = new Date()
    const status: KnowledgeItem['status'] = input.type === 'file' && !/\.(txt|md|csv|json)$/iu.test(input.sourcePath ?? '') ? 'pending' : 'ready'
    await this.db.transaction(async (tx) => {
      await tx.insert(knowledgeItems).values({
        id,
        title: input.title,
        type: input.type,
        content: input.content,
        sourceUrl: input.sourceUrl,
        sourcePath: input.sourcePath,
        status,
        sourceKind: input.sourceKind,
        createdBy: actorUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      const uniqueTags = [...new Set(input.tags)]
      const uniqueRelationshipIds = [...new Set(input.relationshipIds)]
      if (uniqueTags.length) await tx.insert(knowledgeTags).values(uniqueTags.map((tag) => ({ knowledgeItemId: id, tag })))
      if (uniqueRelationshipIds.length) await tx.insert(knowledgeItemRelationships).values(uniqueRelationshipIds.map((relationshipId) => ({ knowledgeItemId: id, relationshipId })))
    })
    const [item] = await this.hydrateKnowledge(await this.db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)))
    if (!item) throw new Error('知识条目写入后无法读取')
    return item
  }

  async listOpportunities(filters: OpportunityFilters = {}): Promise<Opportunity[]> {
    const conditions: SQL[] = []
    if (filters.industry) conditions.push(eq(opportunities.industry, filters.industry))
    if (filters.grade) conditions.push(eq(opportunities.grade, filters.grade))
    if (filters.stage) conditions.push(eq(opportunities.stage, filters.stage))
    if (filters.q?.trim()) {
      const pattern = `%${filters.q.trim()}%`
      conditions.push(or(
        ilike(opportunities.companyName, pattern),
        ilike(opportunities.title, pattern),
        ilike(opportunities.signal, pattern),
        ilike(opportunities.region, pattern),
        sql`EXISTS (SELECT 1 FROM ${opportunityTags} ot WHERE ot.opportunity_id = ${opportunities.id} AND ot.tag ILIKE ${pattern})`,
      )!)
    }
    const rows = await this.db.select().from(opportunities)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(opportunities.score), desc(opportunities.updatedAt))
    return this.hydrateOpportunities(rows)
  }

  async getOpportunity(id: string): Promise<Opportunity | undefined> {
    const rows = await this.db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1)
    return (await this.hydrateOpportunities(rows))[0]
  }

  private async hydrateOpportunities(rows: Array<typeof opportunities.$inferSelect>): Promise<Opportunity[]> {
    if (!rows.length) return []
    const ids = rows.map((row) => row.id)
    const [tagRows, dimensionRows, matchRows, evidenceRows, insightRows] = await Promise.all([
      this.db.select().from(opportunityTags).where(inArray(opportunityTags.opportunityId, ids)),
      this.db.select().from(opportunityScoreDimensions).where(inArray(opportunityScoreDimensions.opportunityId, ids)),
      this.db.select().from(opportunityProductMatches).where(inArray(opportunityProductMatches.opportunityId, ids)).orderBy(opportunityProductMatches.rank),
      this.db.select().from(sourceEvidences).where(inArray(sourceEvidences.opportunityId, ids)).orderBy(sourceEvidences.capturedAt),
      this.db.select().from(agentInsights).where(inArray(agentInsights.opportunityId, ids)),
    ])
    const tagsByOpportunity = groupBy(tagRows, (row) => row.opportunityId)
    const dimensionsByOpportunity = groupBy(dimensionRows, (row) => row.opportunityId)
    const matchesByOpportunity = groupBy(matchRows, (row) => row.opportunityId)
    const evidenceByOpportunity = groupBy(evidenceRows, (row) => row.opportunityId)
    const insightByOpportunity = new Map(insightRows.map((row) => [row.opportunityId, row]))
    return rows.map((row) => {
      const insight = insightByOpportunity.get(row.id)
      if (!insight) throw new Error(`商机 ${row.id} 缺少 agent_insights`)
      return {
        id: row.id,
        relationshipId: row.relationshipId ?? undefined,
        companyName: row.companyName,
        industry: row.industry,
        region: row.region,
        title: row.title,
        signal: row.signal,
        signalType: row.signalType,
        expectedScale: row.expectedScale ?? undefined,
        maturity: row.maturity,
        contactability: row.contactability,
        stage: row.stage,
        score: row.score,
        grade: row.grade,
        scoreVersion: row.scoreVersion,
        scoreBreakdown: (dimensionsByOpportunity.get(row.id) ?? []).map((item) => ({
          key: item.key,
          label: item.label,
          score: item.score,
          maxScore: item.maxScore,
          reason: item.reason,
        })).sort((a, b) => scoreOrder[a.key] - scoreOrder[b.key]),
        productMatches: (matchesByOpportunity.get(row.id) ?? []).map((item) => ({
          productId: item.productId,
          productModel: item.productModel,
          fitScore: item.fitScore,
          matchedOn: item.matchedOn,
          gaps: item.gaps,
          rationale: item.rationale,
        })),
        evidence: (evidenceByOpportunity.get(row.id) ?? []).map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          url: item.url ?? undefined,
          sourcePath: item.sourcePath ?? undefined,
          occurredAt: optionalIso(item.occurredAt),
          capturedAt: iso(item.capturedAt),
          excerpt: item.excerpt,
          confidence: item.confidence,
        })),
        insight: {
          mode: insight.mode,
          summary: insight.summary,
          opportunityType: insight.opportunityType,
          talkingPoints: insight.talkingPoints,
          risks: insight.risks,
          recommendedActions: insight.recommendedActions,
          questionsToVerify: insight.questionsToVerify,
          model: insight.model ?? undefined,
          fallbackReason: insight.fallbackReason ?? undefined,
          generatedAt: iso(insight.generatedAt),
        },
        tags: (tagsByOpportunity.get(row.id) ?? []).map((item) => item.tag),
        isDemo: row.isDemo,
        createdBy: row.createdBy ?? undefined,
        updatedBy: row.updatedBy ?? undefined,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }
    })
  }

  async createOpportunity(opportunity: Opportunity): Promise<Opportunity> {
    const sourceKind = opportunity.evidence[0]?.kind ?? (opportunity.isDemo ? 'demo-simulated' : 'public')
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(opportunities).values({
          id: opportunity.id,
          relationshipId: opportunity.relationshipId,
          companyName: opportunity.companyName,
          industry: opportunity.industry,
          region: opportunity.region,
          title: opportunity.title,
          signal: opportunity.signal,
          signalType: opportunity.signalType,
          expectedScale: opportunity.expectedScale,
          maturity: opportunity.maturity,
          contactability: opportunity.contactability,
          stage: opportunity.stage,
          score: opportunity.score,
          grade: opportunity.grade,
          scoreVersion: opportunity.scoreVersion,
          sourceKind,
          createdBy: opportunity.createdBy,
          updatedBy: opportunity.updatedBy,
          createdAt: new Date(opportunity.createdAt),
          updatedAt: new Date(opportunity.updatedAt),
        })
        const uniqueTags = [...new Set(opportunity.tags)]
        if (uniqueTags.length) await tx.insert(opportunityTags).values(uniqueTags.map((tag) => ({ opportunityId: opportunity.id, tag })))
        if (opportunity.scoreBreakdown.length) await tx.insert(opportunityScoreDimensions).values(opportunity.scoreBreakdown.map((item) => ({ opportunityId: opportunity.id, ...item })))
        if (opportunity.productMatches.length) await tx.insert(opportunityProductMatches).values(opportunity.productMatches.map((item, index) => ({
          id: `${opportunity.id}-match-${index + 1}`,
          opportunityId: opportunity.id,
          productId: item.productId,
          productModel: item.productModel,
          fitScore: item.fitScore,
          matchedOn: item.matchedOn,
          gaps: item.gaps,
          rationale: item.rationale,
          rank: index + 1,
        })))
        if (opportunity.evidence.length) await tx.insert(sourceEvidences).values(opportunity.evidence.map((item) => ({
          id: item.id,
          opportunityId: opportunity.id,
          kind: item.kind,
          title: item.title,
          url: item.url,
          sourcePath: item.sourcePath,
          occurredAt: item.occurredAt ? new Date(item.occurredAt) : null,
          capturedAt: new Date(item.capturedAt),
          excerpt: item.excerpt,
          confidence: item.confidence,
        })))
        await tx.insert(agentInsights).values({
          opportunityId: opportunity.id,
          mode: opportunity.insight.mode,
          summary: opportunity.insight.summary,
          opportunityType: opportunity.insight.opportunityType,
          talkingPoints: opportunity.insight.talkingPoints,
          risks: opportunity.insight.risks,
          recommendedActions: opportunity.insight.recommendedActions,
          questionsToVerify: opportunity.insight.questionsToVerify,
          model: opportunity.insight.model,
          fallbackReason: opportunity.insight.fallbackReason,
          generatedAt: new Date(opportunity.insight.generatedAt),
        })
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateOpportunityError('同一企业的同名商机已存在')
      throw error
    }
    const result = await this.getOpportunity(opportunity.id)
    if (!result) throw new Error('商机写入后无法读取')
    return result
  }

  async updateOpportunityStage(id: string, stage: Opportunity['stage'], actorUserId?: string): Promise<Opportunity | undefined> {
    const [row] = await this.db.update(opportunities).set({ stage, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(opportunities.id, id)).returning({ id: opportunities.id })
    return row ? this.getOpportunity(id) : undefined
  }

  async hasOpportunityFingerprint(companyName: string, title: string): Promise<boolean> {
    const [row] = await this.db.select({ id: opportunities.id }).from(opportunities).where(and(
      sql`lower(btrim(${opportunities.companyName})) = lower(btrim(${companyName}))`,
      sql`lower(btrim(${opportunities.title})) = lower(btrim(${title}))`,
    )).limit(1)
    return Boolean(row)
  }

  async listUsers(): Promise<StoredUser[]> {
    const rows = await this.db.select().from(users).orderBy(desc(users.createdAt))
    return rows.map(mapStoredUser)
  }

  async getUserById(id: string): Promise<StoredUser | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return row ? mapStoredUser(row) : undefined
  }

  async getUserByEmail(email: string): Promise<StoredUser | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1)
    return row ? mapStoredUser(row) : undefined
  }

  async createUser(user: StoredUser): Promise<StoredUser> {
    const [row] = await this.db.insert(users).values({
      id: user.id,
      email: user.email.trim().toLowerCase(),
      displayName: user.displayName,
      status: user.status,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
      isSeed: user.isSeed,
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    }).returning()
    if (!row) throw new Error('用户写入后无法读取')
    return mapStoredUser(row)
  }

  async updateUser(id: string, patch: Partial<StoredUser>): Promise<StoredUser | undefined> {
    const [row] = await this.db.update(users).set({
      ...(patch.email !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.passwordHash !== undefined ? { passwordHash: patch.passwordHash } : {}),
      ...(patch.mustChangePassword !== undefined ? { mustChangePassword: patch.mustChangePassword } : {}),
      ...(patch.lastLoginAt !== undefined ? { lastLoginAt: patch.lastLoginAt ? new Date(patch.lastLoginAt) : null } : {}),
      updatedAt: new Date(),
    }).where(eq(users.id, id)).returning()
    return row ? mapStoredUser(row) : undefined
  }

  async listRoles(): Promise<StoredRole[]> {
    const rows = await this.db.select().from(roles).orderBy(roles.sortOrder, roles.name)
    return this.hydrateRoles(rows)
  }

  async getRoleById(id: string): Promise<StoredRole | undefined> {
    const [row] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1)
    return row ? (await this.hydrateRoles([row]))[0] : undefined
  }

  async getRoleByCode(code: string): Promise<StoredRole | undefined> {
    const [row] = await this.db.select().from(roles).where(eq(roles.code, code)).limit(1)
    return row ? (await this.hydrateRoles([row]))[0] : undefined
  }

  async createRole(role: StoredRole): Promise<StoredRole> {
    await this.db.transaction(async (tx) => {
      await tx.insert(roles).values({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        sortOrder: role.sortOrder,
        createdAt: new Date(role.createdAt),
        updatedAt: new Date(role.updatedAt),
      })
      if (role.permissions.length) {
        await tx.insert(rolePermissions).values(role.permissions.map((permission) => ({ roleId: role.id, permission })))
      }
    })
    const created = await this.getRoleById(role.id)
    if (!created) throw new Error('角色写入后无法读取')
    return created
  }

  async updateRole(id: string, patch: Partial<StoredRole>): Promise<StoredRole | undefined> {
    const existing = await this.getRoleById(id)
    if (!existing) return undefined
    await this.db.transaction(async (tx) => {
      await tx.update(roles).set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        updatedAt: new Date(),
      }).where(eq(roles.id, id))
      if (patch.permissions) {
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id))
        const next = sanitizeRolePermissions(patch.permissions)
        if (next.length) await tx.insert(rolePermissions).values(next.map((permission) => ({ roleId: id, permission })))
      }
    })
    return this.getRoleById(id)
  }

  async deleteRole(id: string): Promise<boolean> {
    const [row] = await this.db.delete(roles).where(eq(roles.id, id)).returning({ id: roles.id })
    return Boolean(row)
  }

  async listUserRoleIds(userId: string): Promise<string[]> {
    const rows = await this.db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId))
    return rows.map((row) => row.roleId)
  }

  async setUserRoles(userId: string, roleIds: string[], assignedBy?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId))
      if (!roleIds.length) return
      await tx.insert(userRoles).values([...new Set(roleIds)].map((roleId) => ({
        userId,
        roleId,
        assignedBy,
        assignedAt: new Date(),
      })))
    })
  }

  async countUsersWithRole(roleId: string): Promise<number> {
    const [row] = await this.db.select({ value: sql<number>`count(*)::int` }).from(userRoles).where(eq(userRoles.roleId, roleId))
    return row?.value ?? 0
  }

  async countActiveUsersWithPermission(permission: Permission): Promise<number> {
    const active = await this.db.select({ id: users.id }).from(users).where(eq(users.status, 'active'))
    const roleRows = await this.listRoles()
    const assignments = await this.db.select().from(userRoles)
    const byUser = new Map<string, string[]>()
    for (const item of assignments) {
      byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item.roleId])
    }
    return active.filter((user) => {
      const perms = effectivePermissions(
        ...(byUser.get(user.id) ?? []).map((roleId) => roleRows.find((role) => role.id === roleId)?.permissions ?? []),
      )
      return perms.includes(permission)
    }).length
  }

  private async hydrateRoles(rows: Array<typeof roles.$inferSelect>): Promise<StoredRole[]> {
    if (!rows.length) return []
    const permissionRows = await this.db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, rows.map((row) => row.id)))
    const byRole = groupBy(permissionRows, (row) => row.roleId)
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      sortOrder: row.sortOrder,
      permissions: sanitizeRolePermissions((byRole.get(row.id) ?? []).map((item) => item.permission)),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }))
  }

  async createSession(session: StoredSession): Promise<void> {
    await this.db.insert(sessions).values({
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      expiresAt: new Date(session.expiresAt),
      lastSeenAt: new Date(session.lastSeenAt),
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: new Date(session.createdAt),
    })
  }

  async getSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1)
    return row ? mapStoredSession(row) : undefined
  }

  async touchSession(id: string, lastSeenAt: string): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt: new Date(lastSeenAt) }).where(eq(sessions.id, id))
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id))
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId))
  }

  async recordActivity(entry: ActivityEntry): Promise<void> {
    await this.db.insert(activityLogs).values({
      id: makeId('activity'),
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      requestId: entry.requestId,
    })
  }
}

function mapStoredUser(row: typeof users.$inferSelect): StoredUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    status: row.status,
    passwordHash: row.passwordHash,
    mustChangePassword: row.mustChangePassword,
    isSeed: row.isSeed,
    lastLoginAt: optionalIso(row.lastLoginAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

function mapStoredSession(row: typeof sessions.$inferSelect): StoredSession {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: iso(row.expiresAt),
    lastSeenAt: iso(row.lastSeenAt),
    userAgent: row.userAgent ?? undefined,
    ip: row.ip ?? undefined,
    createdAt: iso(row.createdAt),
  }
}
