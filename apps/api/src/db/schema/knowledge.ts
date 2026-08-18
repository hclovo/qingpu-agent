import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { knowledgeStatusEnum, knowledgeTypeEnum, sourceKindEnum } from './enums.js'
import { relationships } from './relationships.js'

export const knowledgeItems = pgTable('knowledge_items', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: knowledgeTypeEnum('type').notNull(),
  content: text('content').notNull(),
  sourceUrl: text('source_url'),
  sourcePath: text('source_path'),
  status: knowledgeStatusEnum('status').notNull(),
  sourceKind: sourceKindEnum('source_kind').notNull(),
  isDemo: boolean('is_demo').generatedAlwaysAs(sql`source_kind = 'demo-simulated'`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_knowledge_status').on(table.status),
  index('idx_knowledge_updated').on(table.updatedAt.desc()),
  index('idx_knowledge_title_trgm').using('gin', sql`${table.title} gin_trgm_ops`),
  index('idx_knowledge_content_trgm').using('gin', sql`${table.content} gin_trgm_ops`),
])

export const knowledgeTags = pgTable('knowledge_tags', {
  knowledgeItemId: text('knowledge_item_id').notNull().references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
}, (table) => [primaryKey({ columns: [table.knowledgeItemId, table.tag] })])

export const knowledgeItemRelationships = pgTable('knowledge_item_relationships', {
  knowledgeItemId: text('knowledge_item_id').notNull().references(() => knowledgeItems.id, { onDelete: 'cascade' }),
  relationshipId: text('relationship_id').notNull().references(() => relationships.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.knowledgeItemId, table.relationshipId] }),
  index('idx_knowledge_relationships_relationship').on(table.relationshipId),
])
