import { z } from 'zod'

export const AgentModeSchema = z.enum(['intelligent', 'rules', 'demo'])
export const OpportunityGradeSchema = z.enum(['A', 'B', 'C', 'D'])
export const OpportunityStageSchema = z.enum([
  'new',
  'verifying',
  'qualified',
  'engaging',
  'converted',
  'closed',
])
export const SignalTypeSchema = z.enum([
  'procurement',
  'project',
  'policy',
  'operation',
  'partnership',
])
export const MaturitySchema = z.enum([
  'awareness',
  'planning',
  'approved',
  'tendering',
  'pilot',
  'operating',
  'repeat-purchase',
])
export const ContactabilitySchema = z.enum(['unknown', 'public-channel', 'known-contact', 'existing-relationship'])
export const RelationshipRoleSchema = z.enum(['customer', 'prospect', 'supplier', 'partner'])
export const RelationshipHealthSchema = z.enum(['healthy', 'attention', 'at-risk'])
export const KnowledgeTypeSchema = z.enum(['enterprise-document', 'text', 'url', 'file', 'interaction'])
export const KnowledgeStatusSchema = z.enum(['ready', 'pending', 'review-needed', 'failed'])
export const SourceKindSchema = z.enum(['public', 'enterprise-provided', 'demo-simulated'])

export const SourceEvidenceSchema = z.object({
  id: z.string(),
  kind: SourceKindSchema,
  title: z.string(),
  url: z.string().url().optional(),
  sourcePath: z.string().optional(),
  occurredAt: z.string().optional(),
  capturedAt: z.string(),
  excerpt: z.string(),
  confidence: z.number().min(0).max(1),
})

export const ScoreDimensionSchema = z.object({
  key: z.enum(['fit', 'demand', 'recency', 'maturity', 'contactability', 'strategic']),
  label: z.string(),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  reason: z.string(),
})

export const ScoreResultSchema = z.object({
  score: z.number().min(0).max(100),
  grade: OpportunityGradeSchema,
  scoreVersion: z.string(),
  dimensions: z.array(ScoreDimensionSchema),
})

export const ProductSchema = z.object({
  id: z.string(),
  model: z.string(),
  family: z.string(),
  ratedPower: z.string(),
  peakPower: z.string().optional(),
  lifeHours: z.number().int().positive().optional(),
  certifications: z.array(z.string()),
  scenarios: z.array(z.string()),
  highlights: z.array(z.string()),
  source: z.string(),
  sourcePage: z.number().int().positive().optional(),
  reviewNote: z.string().optional(),
})

export const ProductMatchSchema = z.object({
  productId: z.string(),
  productModel: z.string(),
  fitScore: z.number().min(0).max(100),
  matchedOn: z.array(z.string()),
  gaps: z.array(z.string()),
  rationale: z.string(),
})

export const AgentInsightSchema = z.object({
  mode: AgentModeSchema,
  summary: z.string(),
  opportunityType: z.string(),
  talkingPoints: z.array(z.string()),
  risks: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  questionsToVerify: z.array(z.string()),
  model: z.string().optional(),
  fallbackReason: z.string().optional(),
  generatedAt: z.string(),
})

export const OpportunitySchema = z.object({
  id: z.string(),
  relationshipId: z.string().optional(),
  companyName: z.string(),
  industry: z.string(),
  region: z.string(),
  title: z.string(),
  signal: z.string(),
  signalType: SignalTypeSchema,
  expectedScale: z.string().optional(),
  maturity: MaturitySchema,
  contactability: ContactabilitySchema,
  stage: OpportunityStageSchema,
  score: z.number().min(0).max(100),
  grade: OpportunityGradeSchema,
  scoreVersion: z.string(),
  scoreBreakdown: z.array(ScoreDimensionSchema),
  productMatches: z.array(ProductMatchSchema),
  evidence: z.array(SourceEvidenceSchema),
  insight: AgentInsightSchema,
  tags: z.array(z.string()),
  isDemo: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const TouchpointSchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  channel: z.enum(['meeting', 'phone', 'email', 'wechat', 'event', 'visit', 'other']),
  summary: z.string(),
  outcome: z.string(),
  nextAction: z.string().optional(),
  nextActionAt: z.string().optional(),
  createdAt: z.string(),
})

export const RelationshipSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: RelationshipRoleSchema,
  industry: z.string(),
  region: z.string(),
  description: z.string(),
  health: RelationshipHealthSchema,
  healthScore: z.number().min(0).max(100),
  lastContactAt: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionAt: z.string().optional(),
  tags: z.array(z.string()),
  opportunityIds: z.array(z.string()),
  touchpoints: z.array(TouchpointSchema),
  sourceKind: SourceKindSchema,
  isDemo: z.boolean(),
  updatedAt: z.string(),
})

export const KnowledgeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: KnowledgeTypeSchema,
  content: z.string(),
  sourceUrl: z.string().url().optional(),
  sourcePath: z.string().optional(),
  tags: z.array(z.string()),
  relationshipIds: z.array(z.string()),
  status: KnowledgeStatusSchema,
  sourceKind: SourceKindSchema,
  isDemo: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const AnalyzeOpportunityInputSchema = z.object({
  companyName: z.string().min(2),
  relationshipId: z.string().optional(),
  title: z.string().min(4),
  signal: z.string().min(10),
  industry: z.string().min(2),
  region: z.string().min(2),
  signalType: SignalTypeSchema,
  expectedScale: z.string().optional(),
  maturity: MaturitySchema.default('planning'),
  contactability: ContactabilitySchema.default('unknown'),
  sourceTitle: z.string().min(2),
  sourceUrl: z.string().url().optional(),
  occurredAt: z.string(),
  sourceKind: SourceKindSchema.default('public'),
  strategic: z.boolean().default(false),
})

export const DiscoverOpportunityInputSchema = z.object({
  query: z.string().min(2).max(300),
  region: z.string().optional(),
  days: z.number().int().min(1).max(365).default(90),
})

export const CreateKnowledgeInputSchema = z.object({
  title: z.string().min(2),
  type: z.enum(['text', 'url', 'file']),
  content: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  sourcePath: z.string().optional(),
  tags: z.array(z.string()).default([]),
  relationshipIds: z.array(z.string()).default([]),
  sourceKind: SourceKindSchema.default('enterprise-provided'),
})

export const CreateTouchpointInputSchema = z.object({
  occurredAt: z.string(),
  channel: TouchpointSchema.shape.channel,
  summary: z.string().min(2),
  outcome: z.string().min(1).default('待复盘'),
  nextAction: z.string().optional(),
  nextActionAt: z.string().optional(),
})

export const AgentChatInputSchema = z.object({
  message: z.string().min(2).max(4000),
  relationshipId: z.string().optional(),
  opportunityId: z.string().optional(),
})

export const AgentCitationSchema = z.object({
  title: z.string(),
  source: z.string(),
  excerpt: z.string(),
})

export const AgentChatResponseSchema = z.object({
  answer: z.string(),
  mode: AgentModeSchema,
  citations: z.array(AgentCitationSchema),
  suggestedActions: z.array(z.string()),
  model: z.string().optional(),
  generatedAt: z.string(),
})

export const BriefingItemSchema = z.object({
  id: z.string(),
  type: z.enum(['follow-up', 'dormant-relationship', 'hot-opportunity', 'knowledge-gap']),
  priority: z.enum(['high', 'medium', 'low']),
  title: z.string(),
  description: z.string(),
  relationshipId: z.string().optional(),
  opportunityId: z.string().optional(),
  dueAt: z.string().optional(),
})

export const AgentBriefingSchema = z.object({
  date: z.string(),
  greeting: z.string(),
  summary: z.string(),
  items: z.array(BriefingItemSchema),
})

export const DashboardSchema = z.object({
  opportunityTotal: z.number().int(),
  highPotential: z.number().int(),
  newThisWeek: z.number().int(),
  averageScore: z.number(),
  relationshipTotal: z.number().int(),
  relationshipAttention: z.number().int(),
  knowledgeTotal: z.number().int(),
  gradeDistribution: z.record(z.string(), z.number()),
  industryDistribution: z.array(z.object({ name: z.string(), value: z.number() })),
  topOpportunities: z.array(OpportunitySchema),
})

export type AgentMode = z.infer<typeof AgentModeSchema>
export type OpportunityGrade = z.infer<typeof OpportunityGradeSchema>
export type OpportunityStage = z.infer<typeof OpportunityStageSchema>
export type SignalType = z.infer<typeof SignalTypeSchema>
export type Maturity = z.infer<typeof MaturitySchema>
export type Contactability = z.infer<typeof ContactabilitySchema>
export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>
export type ScoreDimension = z.infer<typeof ScoreDimensionSchema>
export type ScoreResult = z.infer<typeof ScoreResultSchema>
export type Product = z.infer<typeof ProductSchema>
export type ProductMatch = z.infer<typeof ProductMatchSchema>
export type AgentInsight = z.infer<typeof AgentInsightSchema>
export type Opportunity = z.infer<typeof OpportunitySchema>
export type Touchpoint = z.infer<typeof TouchpointSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>
export type AnalyzeOpportunityInput = z.infer<typeof AnalyzeOpportunityInputSchema>
export type DiscoverOpportunityInput = z.infer<typeof DiscoverOpportunityInputSchema>
export type CreateKnowledgeInput = z.infer<typeof CreateKnowledgeInputSchema>
export type CreateTouchpointInput = z.infer<typeof CreateTouchpointInputSchema>
export type AgentChatInput = z.infer<typeof AgentChatInputSchema>
export type AgentChatResponse = z.infer<typeof AgentChatResponseSchema>
export type AgentBriefing = z.infer<typeof AgentBriefingSchema>
export type Dashboard = z.infer<typeof DashboardSchema>
