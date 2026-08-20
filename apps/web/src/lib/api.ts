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
  Permission,
  PermissionCatalogGroup,
  Product,
  PublicUser,
  Relationship,
  Role,
} from './types'

type ApiEnvelope<T> = T | { data: T }

const backendUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')
const apiBaseUrl = backendUrl
  ? backendUrl.endsWith('/api') ? backendUrl : `${backendUrl}/api`
  : '/api'

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
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('无法连接服务，请检查后端地址及服务状态。', 0, 'NETWORK_ERROR')
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
  me: () => request<{ user: PublicUser }>('/me'),
  login: (email: string, password: string) =>
    request<{ user: PublicUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ user: PublicUser }>('/me/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  users: () => request<PublicUser[]>('/users'),
  createUser: (input: { email: string; displayName: string; roleIds: string[]; password: string }) =>
    request<PublicUser>('/users', { method: 'POST', body: JSON.stringify(input) }),
  updateUser: (id: string, input: { displayName?: string; roleIds?: string[]; status?: 'active' | 'disabled'; password?: string }) =>
    request<PublicUser>(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  roles: () => request<Role[]>('/roles'),
  createRole: (input: { code: string; name: string; description?: string; permissionCodes?: Permission[]; copyFromRoleId?: string }) =>
    request<Role>('/roles', { method: 'POST', body: JSON.stringify(input) }),
  updateRole: (id: string, input: { name?: string; description?: string; permissionCodes?: Permission[] }) =>
    request<Role>(`/roles/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteRole: (id: string) => request<{ ok: boolean }>(`/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  permissionCatalog: () => request<PermissionCatalogGroup[]>('/permissions'),
}
