import type {
  AnalyzeInput,
  Briefing,
  ChatResponse,
  Dashboard,
  DiscoverResponse,
  Health,
  KnowledgeItem,
  Opportunity,
  OpportunityStage,
  Product,
  Relationship,
} from './types'

type ApiEnvelope<T> = T | { data: T }

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('无法连接服务，请确认 API 已启动。', 0, 'NETWORK_ERROR')
  }

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { error?: { message?: string; code?: string; requestId?: string } }
    | null

  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined
    throw new ApiError(error?.message || `请求失败（${response.status}）`, response.status, error?.code, error?.requestId)
  }

  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data as T
  return payload as T
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const api = {
  health: () => request<Health>('/health'),
  chat: (message: string, context?: { relationshipId?: string; opportunityId?: string }) =>
    request<ChatResponse>('/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message, ...context }),
    }),
  briefing: () => request<Briefing>('/agent/briefing'),
  dashboard: () => request<Dashboard>('/dashboard'),
  relationships: () => request<Relationship[]>('/relationships'),
  relationship: (id: string) => request<Relationship>(`/relationships/${encodeURIComponent(id)}`),
  addTouchpoint: (
    id: string,
    input: {
      occurredAt: string
      channel: string
      summary: string
      outcome?: string
      nextAction?: string
      nextActionAt?: string
    },
  ) =>
    request<Relationship>(`/relationships/${encodeURIComponent(id)}/touchpoints`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  knowledge: (q?: string) => request<KnowledgeItem[]>(`/knowledge${queryString({ q })}`),
  addKnowledge: (input: {
    title: string
    content: string
    type: 'text' | 'url' | 'file'
    source?: string
    tags: string[]
    relationshipId?: string
  }) => request<KnowledgeItem>('/knowledge', { method: 'POST', body: JSON.stringify(input) }),
  opportunities: (filters?: { q?: string; industry?: string; grade?: string; stage?: string }) =>
    request<Opportunity[]>(`/opportunities${queryString(filters ?? {})}`),
  opportunity: (id: string) => request<Opportunity>(`/opportunities/${encodeURIComponent(id)}`),
  analyze: (input: AnalyzeInput) =>
    request<Opportunity>('/opportunities/analyze', { method: 'POST', body: JSON.stringify(input) }),
  discover: (input: { industry?: string; region?: string; keywords?: string; days?: number }) =>
    request<DiscoverResponse>('/opportunities/discover', { method: 'POST', body: JSON.stringify(input) }),
  updateStage: (id: string, stage: OpportunityStage) =>
    request<Opportunity>(`/opportunities/${encodeURIComponent(id)}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    }),
  products: () => request<Product[]>('/products'),
}
