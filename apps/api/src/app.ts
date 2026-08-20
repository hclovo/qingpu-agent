import { randomUUID } from 'node:crypto'
import {
  AgentChatInputSchema,
  AnalyzeOpportunityInputSchema,
  ChangePasswordInputSchema,
  CreateRoleInputSchema,
  CreateKnowledgeInputSchema,
  CreateTouchpointInputSchema,
  CreateUserInputSchema,
  DiscoverOpportunityInputSchema,
  KnowledgeStatusSchema,
  LoginInputSchema,
  OpportunityGradeSchema,
  OpportunityStageSchema,
  RelationshipRoleSchema,
  PERMISSION_CATALOG,
  UpdateRoleInputSchema,
  UpdateUserInputSchema,
  type Opportunity,
} from '@qingpu/contracts'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { deleteCookie, setCookie } from 'hono/cookie'
import { ZodError } from 'zod'
import { attachActor, requirePermission, type AuthVariables } from './auth/middleware.js'
import { SESSION_COOKIE, sessionTtlMs } from './auth/enabled.js'
import { AuthConflictError, AuthNotFoundError, ForbiddenError, RateLimitedError, UnauthenticatedError } from './auth/errors.js'
import { persistableActorId } from './auth/session.js'
import { AuthService } from './auth/service.js'
import { BusinessService } from './services/business-service.js'
import { DuplicateOpportunityError } from './store/store.js'

function webOrigins() {
  const configured = [process.env.WEB_ORIGIN, process.env.WEB_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => value!.split(','))
    .map((value) => value.trim())
    .filter(Boolean)

  const values = configured.length ? configured : ['http://localhost:5173']
  return [...new Set(values.map((value) => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error(`无效的 Web Origin：${value}`)
    }
    if (!['http:', 'https:'].includes(url.protocol) || value.replace(/\/+$/, '') !== url.origin) {
      throw new Error(`Web Origin 必须是仅含协议、域名和端口的 HTTP(S) 地址：${value}`)
    }
    return url.origin
  }))]
}
class RequestBodyError extends Error {
  readonly code = 'VALIDATION_ERROR'
}

function errorBody(requestId: string, code: string, message: string, details?: unknown) {
  return { error: { code, message, requestId, details } }
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new RequestBodyError('请求体必须是有效的 JSON 对象')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestBodyError('请求体必须是 JSON 对象')
  return body as Record<string, unknown>
}

function presentOpportunity(item: Opportunity) {
  const source = item.evidence[0]
  return {
    ...item,
    sourceType: source?.kind,
    occurredAt: source?.occurredAt,
    evidence: item.evidence.map((evidence) => ({
      ...evidence,
      sourceType: evidence.kind,
      publishedAt: evidence.occurredAt,
    })),
  }
}

function normalizeMaturity(value: unknown) {
  if (value === 'attention') return 'awareness'
  if (value === 'repeat') return 'repeat-purchase'
  if (value === 'operating') return 'operating'
  return value || 'planning'
}

function normalizeContactability(value: unknown) {
  if (value === 'partner') return 'known-contact'
  if (value === 'existing') return 'existing-relationship'
  return value || 'unknown'
}

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined
}

function requestHostname(c: Context) {
  try {
    return new URL(c.req.url).hostname
  } catch {
    return ''
  }
}

function isCrossSiteSession(c: Context) {
  const host = requestHostname(c)
  if (!host) return false
  return webOrigins().some((origin) => {
    try {
      return new URL(origin).hostname !== host
    } catch {
      return false
    }
  })
}

function sessionCookieOptions(c: Context) {
  const crossSite = isCrossSiteSession(c)
  return {
    httpOnly: true,
    path: '/',
    maxAge: Math.floor(sessionTtlMs() / 1000),
    secure: crossSite || process.env.NODE_ENV === 'production',
    sameSite: crossSite ? 'None' as const : 'Lax' as const,
    partitioned: crossSite || undefined,
  }
}

function writeSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(c))
}

function clearSessionCookie(c: Context) {
  const options = sessionCookieOptions(c)
  deleteCookie(c, SESSION_COOKIE, {
    path: options.path,
    secure: options.secure,
    sameSite: options.sameSite,
  })
}

export function createApp(service = new BusinessService()) {
  const auth = new AuthService(service.store)
  const app = new Hono<{ Variables: AuthVariables }>()
  const allowedOrigins = webOrigins()

  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') || randomUUID()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    await next()
  })
  app.use('/api/*', cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Request-Id', 'Authorization'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  }))
  app.use('/api/*', attachActor(auth))

  app.onError((error, c) => {
    const requestId = c.get('requestId') || randomUUID()
    if (error instanceof ZodError) {
      return c.json(errorBody(requestId, 'VALIDATION_ERROR', '请求参数不合法', error.issues), 400)
    }
    if (error instanceof RequestBodyError) {
      return c.json(errorBody(requestId, error.code, error.message), 400)
    }
    if (error instanceof DuplicateOpportunityError || error instanceof AuthConflictError) {
      return c.json(errorBody(requestId, error.code, error.message), 409)
    }
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError || error instanceof RateLimitedError || error instanceof AuthNotFoundError) {
      return c.json(errorBody(requestId, error.code, error.message), error.status)
    }
    return c.json(errorBody(requestId, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试'), 500)
  })

  app.notFound((c) => c.json(errorBody(c.get('requestId') || randomUUID(), 'NOT_FOUND', '请求的资源不存在'), 404))

  app.get('/api/health', (c) => c.json({ ...service.health(), requestId: c.get('requestId') }))

  app.post('/api/auth/login', async (c) => {
    const input = LoginInputSchema.parse(await jsonBody(c.req.raw))
    const { user, token } = await auth.login(input, {
      ip: clientIp(c.req.raw),
      userAgent: c.req.header('user-agent') ?? undefined,
      requestId: c.get('requestId'),
    })
    writeSessionCookie(c, token)
    return c.json({ user })
  })
  app.post('/api/auth/logout', async (c) => {
    await auth.logout(c.get('sessionId'), persistableActorId(c.get('actor')?.id), c.get('requestId'))
    clearSessionCookie(c)
    return c.json({ ok: true })
  })
  app.get('/api/me', requirePermission('session.self'), (c) => c.json({ user: c.get('actor') }))
  app.post('/api/me/password', requirePermission('session.self'), async (c) => {
    const actor = c.get('actor')
    if (!actor || actor.role === 'anonymous') throw new UnauthenticatedError()
    const input = ChangePasswordInputSchema.parse(await jsonBody(c.req.raw))
    return c.json({ user: await auth.changePassword(actor.id, input, c.get('requestId')) })
  })

  app.get('/api/permissions', requirePermission('roles.read'), (c) => c.json(PERMISSION_CATALOG))
  app.get('/api/roles', async (c) => {
    const actor = c.get('actor')
    if (!actor) throw new UnauthenticatedError()
    if (!actor.permissions.includes('roles.read') && !actor.permissions.includes('users.read')) throw new ForbiddenError()
    return c.json(await auth.listRoles())
  })
  app.get('/api/roles/:id', requirePermission('roles.read'), async (c) => c.json(await auth.getRole(c.req.param('id'))))
  app.post('/api/roles', requirePermission('roles.manage'), async (c) => {
    const input = CreateRoleInputSchema.parse(await jsonBody(c.req.raw))
    return c.json(await auth.createRole(input, persistableActorId(c.get('actor')?.id), c.get('requestId')), 201)
  })
  app.patch('/api/roles/:id', requirePermission('roles.manage'), async (c) => {
    const input = UpdateRoleInputSchema.parse(await jsonBody(c.req.raw))
    return c.json(await auth.updateRole(c.req.param('id'), input, persistableActorId(c.get('actor')?.id), c.get('requestId')))
  })
  app.delete('/api/roles/:id', requirePermission('roles.manage'), async (c) => {
    await auth.deleteRole(c.req.param('id'), persistableActorId(c.get('actor')?.id), c.get('requestId'))
    return c.json({ ok: true })
  })

  app.get('/api/users', requirePermission('users.read'), async (c) => c.json(await auth.listUsers()))
  app.post('/api/users', requirePermission('users.manage'), async (c) => {
    const input = CreateUserInputSchema.parse(await jsonBody(c.req.raw))
    return c.json(await auth.createUser(input, persistableActorId(c.get('actor')?.id), c.get('requestId')), 201)
  })
  app.patch('/api/users/:id', requirePermission('users.manage'), async (c) => {
    const input = UpdateUserInputSchema.parse(await jsonBody(c.req.raw))
    return c.json(await auth.updateUser(c.req.param('id'), input, persistableActorId(c.get('actor')?.id), c.get('requestId')))
  })

  app.get('/api/dashboard', requirePermission('dashboard.read'), async (c) => {
    const data = await service.dashboard()
    return c.json({ ...data, topOpportunities: data.topOpportunities.map(presentOpportunity) })
  })

  app.post('/api/agent/chat', requirePermission('agent.chat'), async (c) => {
    const input = AgentChatInputSchema.parse(await jsonBody(c.req.raw))
    return c.json(await service.chat(input))
  })
  app.get('/api/agent/briefing', requirePermission('agent.briefing'), async (c) => c.json(await service.briefing()))

  app.get('/api/relationships', requirePermission('relationships.read'), async (c) => {
    const role = c.req.query('role') ? RelationshipRoleSchema.parse(c.req.query('role')) : undefined
    return c.json(await service.store.listRelationships(role))
  })
  app.get('/api/relationships/:id', requirePermission('relationships.read'), async (c) => {
    const item = await service.store.getRelationship(c.req.param('id'))
    return item ? c.json(item) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '关系对象不存在'), 404)
  })
  app.post('/api/relationships/:id/touchpoints', requirePermission('relationships.touch'), async (c) => {
    const body = await jsonBody(c.req.raw)
    const input = CreateTouchpointInputSchema.parse({ ...body, outcome: String(body.outcome ?? '').trim() || '待复盘' })
    const item = await service.addTouchpoint(c.req.param('id'), input, persistableActorId(c.get('actor')?.id))
    return item ? c.json(item, 201) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '关系对象不存在'), 404)
  })

  app.get('/api/knowledge', requirePermission('knowledge.read'), async (c) => {
    const status = c.req.query('status') ? KnowledgeStatusSchema.parse(c.req.query('status')) : undefined
    return c.json(await service.store.listKnowledge(c.req.query('q'), status))
  })
  app.post('/api/knowledge', requirePermission('knowledge.write'), async (c) => {
    const body = await jsonBody(c.req.raw)
    const type = String(body.type ?? 'text')
    const input = CreateKnowledgeInputSchema.parse({
      title: body.title,
      type,
      content: body.content,
      sourceUrl: body.sourceUrl ?? (type === 'url' ? body.source : undefined),
      sourcePath: body.sourcePath ?? (type === 'file' || type === 'text' ? body.source : undefined),
      tags: body.tags ?? [],
      relationshipIds: body.relationshipIds ?? (body.relationshipId ? [body.relationshipId] : []),
      sourceKind: body.sourceKind ?? 'enterprise-provided',
    })
    if (input.type === 'url' && !input.sourceUrl) throw new RequestBodyError('URL 知识必须提供有效的 sourceUrl')
    if (input.type === 'file' && !input.sourcePath) throw new RequestBodyError('文件知识必须提供 sourcePath 或文件名')
    return c.json(await service.createKnowledge(input, persistableActorId(c.get('actor')?.id)), 201)
  })

  app.get('/api/products', requirePermission('products.read'), async (c) => c.json(await service.store.listProducts()))
  app.get('/api/opportunities', requirePermission('opportunities.read'), async (c) => c.json((await service.listOpportunities({
    q: c.req.query('q'),
    industry: c.req.query('industry'),
    grade: c.req.query('grade') ? OpportunityGradeSchema.parse(c.req.query('grade')) : undefined,
    stage: c.req.query('stage') ? OpportunityStageSchema.parse(c.req.query('stage')) : undefined,
  })).map(presentOpportunity)))
  app.get('/api/opportunities/:id', requirePermission('opportunities.read'), async (c) => {
    const item = await service.store.getOpportunity(c.req.param('id'))
    return item ? c.json(presentOpportunity(item)) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '商机不存在'), 404)
  })
  app.post('/api/opportunities/analyze', requirePermission('opportunities.analyze'), async (c) => {
    const body = await jsonBody(c.req.raw)
    const normalized = {
      ...body,
      maturity: normalizeMaturity(body.maturity),
      contactability: normalizeContactability(body.contactability),
      sourceKind: body.sourceKind ?? body.sourceType ?? 'public',
      strategic: body.strategic ?? false,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
    }
    const input = AnalyzeOpportunityInputSchema.parse(normalized)
    if (await service.store.hasOpportunityFingerprint(input.companyName, input.title)) {
      return c.json(errorBody(c.get('requestId'), 'DUPLICATE_OPPORTUNITY', '同一企业的同名商机已存在'), 409)
    }
    return c.json(presentOpportunity(await service.analyze(input, persistableActorId(c.get('actor')?.id))), 201)
  })
  app.post('/api/opportunities/discover', requirePermission('opportunities.discover'), async (c) => {
    const body = await jsonBody(c.req.raw)
    const input = DiscoverOpportunityInputSchema.parse({
      query: (body.query ?? [body.keywords, body.industry].filter(Boolean).join(' ')) || '氢能产业商机',
      region: body.region || undefined,
      days: body.days ?? 180,
    })
    return c.json(await service.discover(input.query, input.region, input.days, persistableActorId(c.get('actor')?.id)))
  })
  app.patch('/api/opportunities/:id/stage', requirePermission('opportunities.stage'), async (c) => {
    const body = await jsonBody(c.req.raw)
    const stage = OpportunityStageSchema.parse(body.stage)
    const item = await service.updateOpportunityStage(c.req.param('id'), stage, persistableActorId(c.get('actor')?.id))
    return item ? c.json(item) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '商机不存在'), 404)
  })

  return app
}

export const app = createApp()
export default app
