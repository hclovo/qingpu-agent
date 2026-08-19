import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { relationshipHealthEnum, relationshipRoleEnum, sourceKindEnum, touchpointChannelEnum } from './enums.js'
import { users } from './users.js'

export const relationships = pgTable('relationships', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: relationshipRoleEnum('role').notNull(),
  industry: text('industry').notNull(),
  region: text('region').notNull(),
  description: text('description').notNull().default(''),
  health: relationshipHealthEnum('health').notNull(),
  healthScore: integer('health_score').notNull(),
  lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
  nextAction: text('next_action'),
  nextActionAt: timestamp('next_action_at', { withTimezone: true }),
  sourceKind: sourceKindEnum('source_kind').notNull(),
  isDemo: boolean('is_demo').generatedAlwaysAs(sql`source_kind = 'demo-simulated'`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_relationships_role').on(table.role),
  index('idx_relationships_health').on(table.health),
  index('idx_relationships_health_score').on(table.healthScore.desc()),
  index('idx_relationships_next_action').on(table.nextActionAt).where(sql`${table.nextActionAt} IS NOT NULL`),
  index('idx_relationships_last_contact').on(table.lastContactAt),
  check('ck_relationships_health_score', sql`${table.healthScore} BETWEEN 0 AND 100`),
])

export const relationshipTags = pgTable('relationship_tags', {
  relationshipId: text('relationship_id').notNull().references(() => relationships.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
}, (table) => [primaryKey({ columns: [table.relationshipId, table.tag] })])

export const touchpoints = pgTable('touchpoints', {
  id: text('id').primaryKey(),
  relationshipId: text('relationship_id').notNull().references(() => relationships.id, { onDelete: 'cascade' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  channel: touchpointChannelEnum('channel').notNull(),
  summary: text('summary').notNull(),
  outcome: text('outcome').notNull().default('待复盘'),
  nextAction: text('next_action'),
  nextActionAt: timestamp('next_action_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('idx_touchpoints_relationship_occurred').on(table.relationshipId, table.occurredAt.desc())])
