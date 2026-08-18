import { relations } from 'drizzle-orm'
import { knowledgeItemRelationships, knowledgeItems, knowledgeTags } from './knowledge.js'
import { agentInsights, opportunities, opportunityProductMatches, opportunityScoreDimensions, opportunityTags, sourceEvidences } from './opportunities.js'
import { products } from './products.js'
import { relationships, relationshipTags, touchpoints } from './relationships.js'

export const productsRelations = relations(products, ({ many }) => ({ matches: many(opportunityProductMatches) }))

export const relationshipsRelations = relations(relationships, ({ many }) => ({
  tags: many(relationshipTags),
  touchpoints: many(touchpoints),
  knowledgeLinks: many(knowledgeItemRelationships),
  opportunities: many(opportunities),
}))

export const relationshipTagsRelations = relations(relationshipTags, ({ one }) => ({
  relationship: one(relationships, { fields: [relationshipTags.relationshipId], references: [relationships.id] }),
}))

export const touchpointsRelations = relations(touchpoints, ({ one }) => ({
  relationship: one(relationships, { fields: [touchpoints.relationshipId], references: [relationships.id] }),
}))

export const knowledgeItemsRelations = relations(knowledgeItems, ({ many }) => ({
  tags: many(knowledgeTags),
  relationshipLinks: many(knowledgeItemRelationships),
}))

export const knowledgeTagsRelations = relations(knowledgeTags, ({ one }) => ({
  knowledgeItem: one(knowledgeItems, { fields: [knowledgeTags.knowledgeItemId], references: [knowledgeItems.id] }),
}))

export const knowledgeItemRelationshipsRelations = relations(knowledgeItemRelationships, ({ one }) => ({
  knowledgeItem: one(knowledgeItems, { fields: [knowledgeItemRelationships.knowledgeItemId], references: [knowledgeItems.id] }),
  relationship: one(relationships, { fields: [knowledgeItemRelationships.relationshipId], references: [relationships.id] }),
}))

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  relationship: one(relationships, { fields: [opportunities.relationshipId], references: [relationships.id] }),
  tags: many(opportunityTags),
  scoreDimensions: many(opportunityScoreDimensions),
  productMatches: many(opportunityProductMatches),
  evidence: many(sourceEvidences),
  insight: one(agentInsights),
}))

export const opportunityTagsRelations = relations(opportunityTags, ({ one }) => ({
  opportunity: one(opportunities, { fields: [opportunityTags.opportunityId], references: [opportunities.id] }),
}))

export const opportunityScoreDimensionsRelations = relations(opportunityScoreDimensions, ({ one }) => ({
  opportunity: one(opportunities, { fields: [opportunityScoreDimensions.opportunityId], references: [opportunities.id] }),
}))

export const opportunityProductMatchesRelations = relations(opportunityProductMatches, ({ one }) => ({
  opportunity: one(opportunities, { fields: [opportunityProductMatches.opportunityId], references: [opportunities.id] }),
  product: one(products, { fields: [opportunityProductMatches.productId], references: [products.id] }),
}))

export const sourceEvidencesRelations = relations(sourceEvidences, ({ one }) => ({
  opportunity: one(opportunities, { fields: [sourceEvidences.opportunityId], references: [opportunities.id] }),
}))

export const agentInsightsRelations = relations(agentInsights, ({ one }) => ({
  opportunity: one(opportunities, { fields: [agentInsights.opportunityId], references: [opportunities.id] }),
}))
