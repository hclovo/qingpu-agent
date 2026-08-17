export type AgentMode = 'smart' | 'rules' | 'demo' | string
export type SourceType = 'public' | 'enterprise-provided' | 'demo-simulated' | string
export type OpportunityStage = 'new' | 'verifying' | 'qualified' | 'engaging' | 'converted' | 'closed'

export interface Health {
  status: string
  version?: string
  agentMode: AgentMode
  model?: string
}

export interface Citation {
  title?: string
  source?: string
  url?: string
  excerpt?: string
}

export interface ChatResponse {
  answer: string
  citations: Array<Citation | string>
  suggestedActions: string[]
  needsConfirmation?: string[]
  mode: AgentMode
  model?: string
  fallbackReason?: string
}

export interface BriefingItem {
  id?: string
  relationshipId?: string
  opportunityId?: string
  title?: string
  name?: string
  companyName?: string
  reason?: string
  nextAction?: string
  dueAt?: string
  score?: number
  grade?: string
}

export interface Briefing {
  generatedAt: string
  mode: AgentMode
  summary: string
  dueFollowUps: BriefingItem[]
  silentRelationships: BriefingItem[]
  highPotentialOpportunities: BriefingItem[]
  knowledgeGaps: Array<BriefingItem | string>
  suggestedActions: string[]
}

export interface Touchpoint {
  id: string
  occurredAt?: string
  contactedAt?: string
  channel: string
  summary: string
  outcome?: string
  nextAction?: string
  nextActionAt?: string
  createdBy?: string
}

export interface Relationship {
  id: string
  name: string
  role: 'customer' | 'prospect' | 'supplier' | 'partner' | string
  industry?: string
  region?: string
  healthScore?: number
  health?: number | string
  lastContactAt?: string
  nextAction?: string
  nextActionAt?: string
  dataCompleteness?: number
  sourceType?: SourceType
  sourceKind?: SourceType
  opportunityIds?: string[]
  touchpoints?: Touchpoint[]
  description?: string
  tags?: string[]
}

export interface KnowledgeItem {
  id: string
  title: string
  content?: string
  type: 'text' | 'url' | 'file' | string
  source?: string
  sourceUrl?: string
  sourcePath?: string
  sourceType?: SourceType
  sourceKind?: SourceType
  tags?: string[]
  relationshipId?: string
  status: 'ready' | 'pending' | 'review' | 'failed' | string
  updatedAt: string
  createdAt?: string
}

export interface ScoreDimension {
  key?: string
  dimension?: string
  name?: string
  label?: string
  score: number
  maxScore?: number
  max?: number
  reason?: string
  reasons?: string[]
}

export interface ProductMatch {
  productId?: string
  productName?: string
  product?: string
  productModel?: string
  score?: number
  fitScore?: number
  matchedOn?: string[]
  gaps?: string[]
  reason?: string
  rationale?: string
}

export interface SourceEvidence {
  type?: string
  sourceType?: SourceType
  kind?: SourceType
  title: string
  url?: string
  file?: string
  publishedAt?: string
  occurredAt?: string
  capturedAt?: string
  excerpt?: string
  confidence?: number | string
}

export interface AgentInsight {
  mode?: AgentMode
  summary?: string
  opportunityType?: string
  entryPoints?: string[]
  talkingPoints?: string[]
  risks?: string[]
  suggestedActions?: string[]
  recommendedActions?: string[]
  questions?: string[]
  questionsToVerify?: string[]
  generatedAt?: string
  fallbackReason?: string
}

export interface Opportunity {
  id: string
  companyName: string
  industry: string
  region: string
  title: string
  signal: string
  signalType: string
  stage: OpportunityStage
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  scoreVersion?: string
  scoreBreakdown?: ScoreDimension[]
  productMatches?: ProductMatch[]
  evidence?: SourceEvidence[]
  insight?: AgentInsight
  expectedScale?: string
  occurredAt?: string
  sourceType?: SourceType
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

export interface Dashboard {
  metrics: {
    total: number
    highPotential: number
    addedThisWeek: number
    averageScore: number
  }
  gradeDistribution: Record<string, number> | Array<{ label?: string; grade?: string; name?: string; value: number }>
  industryDistribution: Record<string, number> | Array<{ label?: string; industry?: string; name?: string; value: number }>
  stageDistribution?: Record<string, number> | Array<{ label?: string; stage?: string; name?: string; value: number }>
  topOpportunities: Opportunity[]
  agentMode: AgentMode
}

export interface Product {
  id: string
  model?: string
  name?: string
  family: string
  ratedPower?: string | number
  peakPower?: string | number
  powerRange?: string
  lifetime?: string
  lifeHours?: number
  certifications?: string[]
  scenarios?: string[]
  highlights?: string[]
  source?: string
  sourceTitle?: string
  sourcePage?: string | number
  description?: string
  reviewNote?: string
}

export interface DiscoverCandidate {
  id?: string
  companyName: string
  title: string
  signal?: string
  summary?: string
  industry?: string
  region?: string
  sourceUrl?: string
  occurredAt?: string
  confidence?: number | string
  score?: number
  grade?: string
  status?: string
  isDemo?: boolean
  evidence?: SourceEvidence[]
}

export interface DiscoverResponse {
  mode: AgentMode
  notice: string
  candidates: DiscoverCandidate[]
}

export interface AnalyzeInput {
  companyName: string
  title: string
  signal: string
  industry: string
  region: string
  signalType: string
  expectedScale?: string
  maturity?: string
  contactability?: string
  sourceTitle: string
  sourceUrl?: string
  occurredAt: string
}
