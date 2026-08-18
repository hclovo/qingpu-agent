import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  model: text('model').notNull(),
  family: text('family').notNull(),
  ratedPower: text('rated_power').notNull(),
  peakPower: text('peak_power'),
  lifeHours: integer('life_hours'),
  certifications: jsonb('certifications').$type<string[]>().notNull().default([]),
  scenarios: jsonb('scenarios').$type<string[]>().notNull().default([]),
  highlights: jsonb('highlights').$type<string[]>().notNull().default([]),
  source: text('source').notNull(),
  sourcePage: integer('source_page'),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_products_model').on(table.model),
  index('idx_products_family').on(table.family),
  index('idx_products_scenarios_gin').using('gin', table.scenarios),
  check('ck_products_life_hours', sql`${table.lifeHours} IS NULL OR ${table.lifeHours} > 0`),
  check('ck_products_source_page', sql`${table.sourcePage} IS NULL OR ${table.sourcePage} > 0`),
])
