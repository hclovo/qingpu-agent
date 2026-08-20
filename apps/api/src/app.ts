import { randomUUID } from 'node:crypto'
import {
  AgentChatInputSchema,
  AnalyzeOpportunityInputSchema,
  CreateKnowledgeInputSchema,
  CreateTouchpointInputSchema,
  DiscoverOpportunityInputSchema,
  KnowledgeStatusSchema,
  OpportunityGradeSchema,
  OpportunityStageSchema,
  RelationshipRoleSchema,
  type Opportunity,
} from '@qingpu/contracts'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ZodError } from 'zod'
import { BusinessService } from './services/business-service.js'
import { DuplicateOpportunityError } from './store/store.js'

type Variables = { requestId: string }

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

export function createApp(service = new BusinessService()) {
  const app = new Hono<{ Variables: Variables }>()
  const allowedOrigins = webOrigins()

  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') || randomUUID()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    await next()
  })
  app.use('/api/*', cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  }))

  app.onError((error, c) => {
    const requestId = c.get('requestId') || randomUUID()
    if (error instanceof ZodError) {
      return c.json(errorBody(requestId, 'VALIDATION_ERROR', '请求参数不合法', error.issues), 400)
    }
    if (error instanceof RequestBodyError) {
      return c.json(errorBody(requestId, error.code, error.message), 400)
    }
    if (error instanceof DuplicateOpportunityError) {
      return c.json(errorBody(requestId, error.code, error.message), 409)
    }
    return c.json(errorBody(requestId, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试'), 500)
  })

  app.notFound((c) => c.json(errorBody(c.get('requestId') || randomUUID(), 'NOT_FOUND', '请求的资源不存在'), 404))

  app.get('/api/health', (c) => c.json({ ...service.health(), requestId: c.get('requestId') }))
  app.get('/api/dashboard', async (c) => {
    const data = await service.dashboard()
    return c.json({ ...data, topOpportunities: data.topOpportunities.map(presentOpportunity) })
  })

  app.post('/api/agent/chat', async (c) => {
    const input = AgentChatInputSchema.parse(await jsonBody(c.req.raw))
    return c.json(await service.chat(input))
  })
  app.get('/api/agent/briefing', async (c) => c.json(await service.briefing()))

  app.get('/api/relationships', async (c) => {
    const role = c.req.query('role') ? RelationshipRoleSchema.parse(c.req.query('role')) : undefined
    return c.json(await service.store.listRelationships(role))
  })
  app.get('/api/relationships/:id', async (c) => {
    const item = await service.store.getRelationship(c.req.param('id'))
    return item ? c.json(item) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '关系对象不存在'), 404)
  })
  app.post('/api/relationships/:id/touchpoints', async (c) => {
    const body = await jsonBody(c.req.raw)
    const input = CreateTouchpointInputSchema.parse({ ...body, outcome: String(body.outcome ?? '').trim() || '待复盘' })
    const item = await service.addTouchpoint(c.req.param('id'), input)
    return item ? c.json(item, 201) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '关系对象不存在'), 404)
  })

  app.get('/api/knowledge', async (c) => {
    const status = c.req.query('status') ? KnowledgeStatusSchema.parse(c.req.query('status')) : undefined
    return c.json(await service.store.listKnowledge(c.req.query('q'), status))
  })
  app.post('/api/knowledge', async (c) => {
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
    return c.json(await service.createKnowledge(input), 201)
  })

  app.get('/api/products', async (c) => c.json(await service.store.listProducts()))
  app.get('/api/opportunities', async (c) => c.json((await service.listOpportunities({
    q: c.req.query('q'),
    industry: c.req.query('industry'),
    grade: c.req.query('grade') ? OpportunityGradeSchema.parse(c.req.query('grade')) : undefined,
    stage: c.req.query('stage') ? OpportunityStageSchema.parse(c.req.query('stage')) : undefined,
  })).map(presentOpportunity)))
  app.get('/api/opportunities/:id', async (c) => {
    const item = await service.store.getOpportunity(c.req.param('id'))
    return item ? c.json(presentOpportunity(item)) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '商机不存在'), 404)
  })
  app.post('/api/opportunities/analyze', async (c) => {
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
    return c.json(presentOpportunity(await service.analyze(input)), 201)
  })
  app.post('/api/opportunities/discover', async (c) => {
    const body = await jsonBody(c.req.raw)
    const input = DiscoverOpportunityInputSchema.parse({
      query: (body.query ?? [body.keywords, body.industry].filter(Boolean).join(' ')) || '氢能产业商机',
      region: body.region || undefined,
      days: body.days ?? 180,
    })
    return c.json(await service.discover(input.query, input.region, input.days))
  })
  app.patch('/api/opportunities/:id/stage', async (c) => {
    const body = await jsonBody(c.req.raw)
    const stage = OpportunityStageSchema.parse(body.stage)
    const item = await service.store.updateOpportunityStage(c.req.param('id'), stage)
    return item ? c.json(item) : c.json(errorBody(c.get('requestId'), 'NOT_FOUND', '商机不存在'), 404)
  })

  return app
}

export const app = createApp()
export default app
