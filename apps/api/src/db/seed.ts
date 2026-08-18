import { count, eq } from 'drizzle-orm'
import '../env.js'
import { createSeedData } from '../data/seed.js'
import { createDatabaseConnection } from './client.js'
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
  sourceEvidences,
  touchpoints,
} from './schema/index.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('写入种子前必须配置 DATABASE_URL')

const { db, client } = createDatabaseConnection(databaseUrl)
const seed = createSeedData()

try {
  await db.transaction(async (tx) => {
    await tx.insert(products).values(seed.products.map((item) => ({
      id: item.id,
      model: item.model,
      family: item.family,
      ratedPower: item.ratedPower,
      peakPower: item.peakPower,
      lifeHours: item.lifeHours,
      certifications: item.certifications,
      scenarios: item.scenarios,
      highlights: item.highlights,
      source: item.source,
      sourcePage: item.sourcePage,
      reviewNote: item.reviewNote,
    }))).onConflictDoNothing()

    await tx.insert(relationships).values(seed.relationships.map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      industry: item.industry,
      region: item.region,
      description: item.description,
      health: item.health,
      healthScore: item.healthScore,
      lastContactAt: item.lastContactAt ? new Date(item.lastContactAt) : null,
      nextAction: item.nextAction,
      nextActionAt: item.nextActionAt ? new Date(item.nextActionAt) : null,
      sourceKind: item.sourceKind,
      updatedAt: new Date(item.updatedAt),
    }))).onConflictDoNothing()

    const relationshipTagRows = seed.relationships.flatMap((item) => item.tags.map((tag) => ({ relationshipId: item.id, tag })))
    if (relationshipTagRows.length) await tx.insert(relationshipTags).values(relationshipTagRows).onConflictDoNothing()
    const touchpointRows = seed.relationships.flatMap((item) => item.touchpoints.map((touchpoint) => ({
      id: touchpoint.id,
      relationshipId: item.id,
      occurredAt: new Date(touchpoint.occurredAt),
      channel: touchpoint.channel,
      summary: touchpoint.summary,
      outcome: touchpoint.outcome,
      nextAction: touchpoint.nextAction,
      nextActionAt: touchpoint.nextActionAt ? new Date(touchpoint.nextActionAt) : null,
      createdAt: new Date(touchpoint.createdAt),
    })))
    if (touchpointRows.length) await tx.insert(touchpoints).values(touchpointRows).onConflictDoNothing()

    await tx.insert(knowledgeItems).values(seed.knowledge.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      content: item.content,
      sourceUrl: item.sourceUrl,
      sourcePath: item.sourcePath,
      status: item.status,
      sourceKind: item.sourceKind,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    }))).onConflictDoNothing()
    const knowledgeTagRows = seed.knowledge.flatMap((item) => item.tags.map((tag) => ({ knowledgeItemId: item.id, tag })))
    if (knowledgeTagRows.length) await tx.insert(knowledgeTags).values(knowledgeTagRows).onConflictDoNothing()
    const knowledgeRelationshipRows = seed.knowledge.flatMap((item) => item.relationshipIds.map((relationshipId) => ({ knowledgeItemId: item.id, relationshipId })))
    if (knowledgeRelationshipRows.length) await tx.insert(knowledgeItemRelationships).values(knowledgeRelationshipRows).onConflictDoNothing()

    for (const item of seed.opportunities) {
      const [existing] = await tx.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, item.id)).limit(1)
      if (existing) continue
      await tx.insert(opportunities).values({
        id: item.id,
        relationshipId: item.relationshipId,
        companyName: item.companyName,
        industry: item.industry,
        region: item.region,
        title: item.title,
        signal: item.signal,
        signalType: item.signalType,
        expectedScale: item.expectedScale,
        maturity: item.maturity,
        contactability: item.contactability,
        stage: item.stage,
        score: item.score,
        grade: item.grade,
        scoreVersion: item.scoreVersion,
        sourceKind: item.evidence[0]?.kind ?? 'demo-simulated',
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      })
      if (item.tags.length) await tx.insert(opportunityTags).values(item.tags.map((tag) => ({ opportunityId: item.id, tag })))
      await tx.insert(opportunityScoreDimensions).values(item.scoreBreakdown.map((dimension) => ({ opportunityId: item.id, ...dimension })))
      await tx.insert(opportunityProductMatches).values(item.productMatches.map((match, index) => ({
        id: `${item.id}-match-${index + 1}`,
        opportunityId: item.id,
        productId: match.productId,
        productModel: match.productModel,
        fitScore: match.fitScore,
        matchedOn: match.matchedOn,
        gaps: match.gaps,
        rationale: match.rationale,
        rank: index + 1,
      })))
      await tx.insert(sourceEvidences).values(item.evidence.map((evidence) => ({
        id: evidence.id,
        opportunityId: item.id,
        kind: evidence.kind,
        title: evidence.title,
        url: evidence.url,
        sourcePath: evidence.sourcePath,
        occurredAt: evidence.occurredAt ? new Date(evidence.occurredAt) : null,
        capturedAt: new Date(evidence.capturedAt),
        excerpt: evidence.excerpt,
        confidence: evidence.confidence,
      })))
      await tx.insert(agentInsights).values({
        opportunityId: item.id,
        mode: item.insight.mode,
        summary: item.insight.summary,
        opportunityType: item.insight.opportunityType,
        talkingPoints: item.insight.talkingPoints,
        risks: item.insight.risks,
        recommendedActions: item.insight.recommendedActions,
        questionsToVerify: item.insight.questionsToVerify,
        model: item.insight.model,
        fallbackReason: item.insight.fallbackReason,
        generatedAt: new Date(item.insight.generatedAt),
      })
    }
  })

  const [[productCount], [relationshipCount], [knowledgeCount], [opportunityCount]] = await Promise.all([
    db.select({ value: count() }).from(products),
    db.select({ value: count() }).from(relationships),
    db.select({ value: count() }).from(knowledgeItems),
    db.select({ value: count() }).from(opportunities),
  ])
  console.log(`数据库种子完成：产品 ${productCount?.value ?? 0}、关系 ${relationshipCount?.value ?? 0}、知识 ${knowledgeCount?.value ?? 0}、商机 ${opportunityCount?.value ?? 0}`)
} finally {
  await client.end()
}
