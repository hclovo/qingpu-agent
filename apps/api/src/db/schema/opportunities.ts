import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { agentModeEnum, contactabilityEnum, maturityEnum, opportunityGradeEnum, opportunityStageEnum, scoreDimensionKeyEnum, signalTypeEnum, sourceKindEnum } from './enums.js'
import { products } from './products.js'
import { relationships } from './relationships.js'

export const opportunities = pgTable('opportunities', {
  id: text('id').primaryKey(),
  relationshipId: text('relationship_id').references(() => relationships.id, { onDelete: 'set null' }),
  companyName: text('company_name').notNull(),
  industry: text('industry').notNull(),
  region: text('region').notNull(),
  title: text('title').notNull(),
  signal: text('signal').notNull(),
  signalType: signalTypeEnum('signal_type').notNull(),
  expectedScale: text('expected_scale'),
  maturity: maturityEnum('maturity').notNull(),
  contactability: contactabilityEnum('contactability').notNull(),
  stage: opportunityStageEnum('stage').notNull().default('new'),
  score: integer('score').notNull(),
  grade: opportunityGradeEnum('grade').notNull(),
  scoreVersion: text('score_version').notNull(),
  sourceKind: sourceKindEnum('source_kind').notNull(),
  isDemo: boolean('is_demo').generatedAlwaysAs(sql`source_kind = 'demo-simulated'`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_opportunities_fingerprint').on(sql`lower(btrim(${table.companyName}))`, sql`lower(btrim(${table.title}))`),
  index('idx_opportunities_grade_score_updated').on(table.grade, table.score.desc(), table.updatedAt.desc()),
  index('idx_opportunities_stage').on(table.stage),
  index('idx_opportunities_industry').on(table.industry),
  index('idx_opportunities_relationship').on(table.relationshipId),
  index('idx_opportunities_created').on(table.createdAt),
  index('idx_opportunities_search_trgm').using('gin', sql`(${table.companyName} || ' ' || ${table.title} || ' ' || ${table.signal} || ' ' || ${table.region}) gin_trgm_ops`),
  check('ck_opportunities_score', sql`${table.score} BETWEEN 0 AND 100`),
])

export const opportunityTags = pgTable('opportunity_tags', {
  opportunityId: text('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
}, (table) => [primaryKey({ columns: [table.opportunityId, table.tag] })])

export const opportunityScoreDimensions = pgTable('opportunity_score_dimensions', {
  opportunityId: text('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  key: scoreDimensionKeyEnum('key').notNull(),
  label: text('label').notNull(),
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull(),
  reason: text('reason').notNull(),
}, (table) => [
  primaryKey({ columns: [table.opportunityId, table.key] }),
  check('ck_score_dimensions_score', sql`${table.score} >= 0 AND ${table.maxScore} > 0 AND ${table.score} <= ${table.maxScore}`),
])

export const opportunityProductMatches = pgTable('opportunity_product_matches', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  productModel: text('product_model').notNull(),
  fitScore: integer('fit_score').notNull(),
  matchedOn: jsonb('matched_on').$type<string[]>().notNull().default([]),
  gaps: jsonb('gaps').$type<string[]>().notNull().default([]),
  rationale: text('rationale').notNull(),
  rank: smallint('rank').notNull(),
}, (table) => [
  uniqueIndex('uq_opportunity_matches_product').on(table.opportunityId, table.productId),
  uniqueIndex('uq_opportunity_matches_rank').on(table.opportunityId, table.rank),
  check('ck_opportunity_matches_fit_score', sql`${table.fitScore} BETWEEN 0 AND 100`),
  check('ck_opportunity_matches_rank', sql`${table.rank} BETWEEN 1 AND 3`),
])

export const sourceEvidences = pgTable('source_evidences', {
  id: text('id').primaryKey(),
  opportunityId: text('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  kind: sourceKindEnum('kind').notNull(),
  title: text('title').notNull(),
  url: text('url'),
  sourcePath: text('source_path'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  excerpt: text('excerpt').notNull(),
  confidence: numeric('confidence', { precision: 3, scale: 2, mode: 'number' }).notNull(),
}, (table) => [
  index('idx_source_evidences_opportunity_captured').on(table.opportunityId, table.capturedAt),
  check('ck_source_evidences_confidence', sql`${table.confidence} BETWEEN 0 AND 1`),
])

export const agentInsights = pgTable('agent_insights', {
  opportunityId: text('opportunity_id').primaryKey().references(() => opportunities.id, { onDelete: 'cascade' }),
  mode: agentModeEnum('mode').notNull(),
  summary: text('summary').notNull(),
  opportunityType: text('opportunity_type').notNull(),
  talkingPoints: jsonb('talking_points').$type<string[]>().notNull().default([]),
  risks: jsonb('risks').$type<string[]>().notNull().default([]),
  recommendedActions: jsonb('recommended_actions').$type<string[]>().notNull().default([]),
  questionsToVerify: jsonb('questions_to_verify').$type<string[]>().notNull().default([]),
  model: text('model'),
  fallbackReason: text('fallback_reason'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
})
