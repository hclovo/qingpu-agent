import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AgentBriefingSchema,
  AgentChatResponseSchema,
  DashboardSchema,
  KnowledgeItemSchema,
  OpportunitySchema,
  ProductSchema,
  RelationshipSchema,
} from '@qingpu/contracts'
import { createApp } from './app.js'
import { SEED_USER_PASSWORDS } from './data/seed-users.js'
import { resolveRuntimeModel, type MastraRuntime } from './mastra/index.js'
import { BusinessService } from './services/business-service.js'
import { MemoryStore } from './store/memory-store.js'

async function salesAuth(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'sales@qingpu.local',
      password: SEED_USER_PASSWORDS['sales@qingpu.local'],
    }),
  })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]
  expect(response.status).toBe(200)
  expect(cookie).toBeTruthy()
  return { cookie: cookie!, headers: (extra: Record<string, string> = {}) => ({ ...extra, cookie: cookie! }) }
}

describe('Hono API', () => {
  beforeEach(() => {
    process.env.AUTH_REQUIRED = 'false'
    delete process.env.WEB_ORIGIN
    delete process.env.WEB_ORIGINS
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  afterEach(() => {
    delete process.env.WEB_ORIGIN
    delete process.env.WEB_ORIGINS
    delete process.env.MASTRA_MODEL
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
  })

  it('健康检查明确展示规则模式并返回 requestId', async () => {
    const response = await createApp().request('/api/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(await response.json()).toMatchObject({ status: 'ok', agentMode: 'rules', version: '0.1.0', authRequired: false, requestId: expect.any(String) })
    const me = await createApp().request('/api/me')
    expect(me.status).toBe(200)
    const body = await me.json() as { user: { role: string; displayName: string; permissions: string[] } }
    expect(body).toMatchObject({ user: { role: 'anonymous', displayName: '游客' } })
    expect(body.user.permissions).toEqual(expect.arrayContaining([
      'dashboard.read', 'relationships.read', 'knowledge.read', 'opportunities.read', 'products.read', 'session.self',
    ]))
    for (const code of ['agent.chat', 'agent.briefing', 'knowledge.write', 'relationships.touch', 'opportunities.analyze', 'opportunities.discover', 'opportunities.stage']) {
      expect(body.user.permissions, code).not.toContain(code)
    }
  })

  it('游客只能只读查看，不能使用 Agent 或改知识库', async () => {
    const app = createApp()
    expect((await app.request('/api/opportunities')).status).toBe(200)
    expect((await app.request('/api/knowledge')).status).toBe(200)
    expect((await app.request('/api/dashboard')).status).toBe(200)
    expect((await app.request('/api/products')).status).toBe(200)
    expect((await app.request('/api/agent/briefing')).status).toBe(403)
    const chat = await app.request('/api/agent/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '今天应该联系谁？' }),
    })
    expect(chat.status).toBe(403)
    const write = await app.request('/api/knowledge', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '游客写入', type: 'text', content: '不应被接受的知识补充', tags: [] }),
    })
    expect(write.status).toBe(403)
    const discover = await app.request('/api/opportunities/discover', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '船舶 氢能', days: 90 }),
    })
    expect(discover.status).toBe(403)
  })

  it('跨域仅允许配置的 Web 域名并正确响应预检请求', async () => {
    process.env.WEB_ORIGIN = 'https://qingpu-web.vercel.app/'
    process.env.WEB_ORIGINS = 'https://preview-one.vercel.app, https://preview-two.vercel.app/'
    const app = createApp()

    for (const origin of [
      'https://qingpu-web.vercel.app',
      'https://preview-one.vercel.app',
      'https://preview-two.vercel.app',
    ]) {
      const response = await app.request('/api/health', {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'Content-Type,X-Request-Id',
        },
      })
      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
      expect(response.headers.get('access-control-allow-methods')).toContain('GET')
      expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type')
      expect(response.headers.get('access-control-allow-headers')).toContain('X-Request-Id')
      expect(response.headers.get('access-control-max-age')).toBe('86400')
      expect(response.headers.get('vary')).toContain('Origin')
    }

    const denied = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example.com',
        'access-control-request-method': 'GET',
      },
    })
    expect(denied.status).toBe(204)
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('前后端不同站点时会话 Cookie 使用 SameSite=None', async () => {
    process.env.WEB_ORIGIN = 'https://qingpu-web.vercel.app'
    const app = createApp()
    const response = await app.request('https://qingpu-api.vercel.app/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'sales@qingpu.local',
        password: SEED_USER_PASSWORDS['sales@qingpu.local'],
      }),
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/qingpu_session=/)
    expect(cookie).toMatch(/SameSite=None/i)
    expect(cookie).toMatch(/Secure/i)
  })

  it('可把 OpenAI API Key 与自定义 Base URL 传给 Mastra 模型配置', () => {
    process.env.MASTRA_MODEL = 'openai/custom-compatible-model'
    process.env.OPENAI_API_KEY = 'test-only-key'
    process.env.OPENAI_BASE_URL = 'https://gateway.example.com/openai/v1/'

    const config = resolveRuntimeModel()

    expect(config).toMatchObject({
      model: 'openai/custom-compatible-model',
      enabled: true,
      usesCustomEndpoint: true,
      agentModel: {
        id: 'openai/custom-compatible-model',
        apiKey: 'test-only-key',
        url: 'https://gateway.example.com/openai/v1',
      },
    })
  })

  it('未配置 Base URL 时默认使用官方 OpenAI API', () => {
    process.env.MASTRA_MODEL = 'openai/gpt-4o-mini'
    process.env.OPENAI_API_KEY = 'test-only-key'

    const config = resolveRuntimeModel()

    expect(config.enabled).toBe(true)
    expect(config.usesCustomEndpoint).toBe(false)
    expect(config.agentModel).toEqual({
      id: 'openai/gpt-4o-mini',
      apiKey: 'test-only-key',
    })
  })

  it('可筛选商机并读取完整详情', async () => {
    const app = createApp()
    const response = await app.request('/api/opportunities?industry=%E8%88%B9%E8%88%B6%E8%88%AA%E8%BF%90')
    const rows = await response.json() as Array<{ id: string; grade: string; productMatches: unknown[]; evidence: unknown[] }>
    expect(response.status).toBe(200)
    expect(rows).toHaveLength(1)
    const detail = await app.request(`/api/opportunities/${rows[0]!.id}`)
    expect(await detail.json()).toMatchObject({ id: rows[0]!.id, isDemo: true })
    expect(rows[0]!.productMatches.length).toBeGreaterThan(0)
    expect(rows[0]!.evidence.length).toBeGreaterThan(0)
  })

  it('无密钥时对话与自动发现稳定降级且显著标识演示数据', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const chat = await app.request('/api/agent/chat', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ message: '今天应该联系哪些客户和上游供应商？' }) })
    expect(await chat.json()).toMatchObject({ mode: 'rules' })
    const discovery = await app.request('/api/opportunities/discover', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ query: '船舶 氢能', days: 90 }) })
    const body = await discovery.json() as { mode: string; notice: string; candidates: Array<{ isDemo: boolean; status: string; sourceUrl?: string }> }
    expect(body.mode).toBe('demo')
    expect(body.notice).toContain('演示')
    expect(body.candidates.every((item) => item.isDemo && item.status === 'verifying' && item.sourceUrl?.startsWith('https://example.com/demo-only/'))).toBe(true)
  })

  it('支持补充知识并立即检索', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const create = await app.request('/api/knowledge', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ title: '低温工况补充', type: 'text', content: '北方重卡项目要求零下30度启动能力待售前确认', tags: ['重卡', '低温'] }) })
    expect(create.status).toBe(201)
    const search = await app.request('/api/knowledge?q=%E9%9B%B6%E4%B8%8B30%E5%BA%A6')
    const rows = await search.json() as Array<{ title: string }>
    expect(rows.some((item) => item.title === '低温工况补充')).toBe(true)
  })

  it('支持新增互动并更新下一步行动', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const response = await app.request('/api/relationships/rel-membrane-supplier/touchpoints', {
      method: 'POST', headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ occurredAt: new Date().toISOString(), channel: 'phone', summary: '确认季度排产', outcome: '收到初版排期', nextAction: '复核批次质量数据', nextActionAt: new Date(Date.now() + 86_400_000).toISOString() }),
    })
    const row = await response.json() as { nextAction: string; touchpoints: unknown[] }
    expect(response.status).toBe(201)
    expect(row.nextAction).toBe('复核批次质量数据')
    expect(row.touchpoints.length).toBe(2)
  })

  it('分析新信号时使用规则评分、产品匹配并保存', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const response = await app.request('/api/opportunities/analyze', {
      method: 'POST', headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ companyName: '【模拟】测试航运企业', title: '内河货船动力改造招标启动', signal: '首批三艘船计划采购200kW燃料电池系统，已经进入招标阶段。', industry: '船舶航运', region: '长江经济带', signalType: 'procurement', expectedScale: '3艘，单船200kW', maturity: 'tendering', contactability: 'public-channel', sourceTitle: '【模拟】公开招标公告', occurredAt: new Date().toISOString(), sourceKind: 'demo-simulated', strategic: true }),
    })
    const row = await response.json() as { score: number; scoreVersion: string; productMatches: Array<{ productModel: string }>; insight: { mode: string } }
    expect(response.status).toBe(201)
    expect(row.score).toBeGreaterThanOrEqual(80)
    expect(row.scoreVersion).toBe('1.0.0')
    expect(row.productMatches[0]?.productModel).toContain('OCEAN')
    expect(row.insight.mode).toBe('rules')
  })

  it('拒绝非法请求并支持阶段更新', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const invalid = await app.request('/api/opportunities/analyze', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: '{}' })
    expect(invalid.status).toBe(400)
    const updated = await app.request('/api/opportunities/opp-river-vessel/stage', { method: 'PATCH', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ stage: 'engaging' }) })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ stage: 'engaging' })
  })

  it('筛选参数和无效 JSON 均返回带 requestId 的 400，而不是静默空列表或 500', async () => {
    const app = createApp()
    for (const path of ['/api/relationships?role=unknown', '/api/knowledge?status=unknown', '/api/opportunities?grade=Z', '/api/opportunities?stage=unknown']) {
      const response = await app.request(path)
      const body = await response.json() as { error: { code: string; requestId: string } }
      expect(response.status, path).toBe(400)
      expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', requestId: expect.any(String) })
    }
    const { headers } = await salesAuth(app)
    const malformed = await app.request('/api/agent/chat', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: '{' })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('知识录入保留文本来源，并拒绝缺失来源的 URL/文件记录', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const created = await app.request('/api/knowledge', {
      method: 'POST', headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ title: '售前边界补充', type: 'text', content: '仅用于预筛，不构成正式技术承诺。', source: '2026-08-17 售前会议纪要', tags: ['售前'] }),
    })
    expect(await created.json()).toMatchObject({ sourcePath: '2026-08-17 售前会议纪要' })
    for (const input of [
      { title: '缺来源网页', type: 'url', content: '网页摘要' },
      { title: '缺文件名记录', type: 'file', content: '文本内容' },
    ]) {
      const response = await app.request('/api/knowledge', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(input) })
      expect(response.status).toBe(400)
    }
  })

  it('总览与简报严格按 A 级统计高潜，并保留来源兼容字段', async () => {
    const app = createApp()
    const opportunities = await (await app.request('/api/opportunities')).json() as Array<{ grade: string; sourceType?: string; occurredAt?: string; evidence: Array<{ sourceType?: string; publishedAt?: string }> }>
    const dashboard = await (await app.request('/api/dashboard')).json() as { metrics: { highPotential: number }; topOpportunities: Array<{ sourceType?: string }> }
    const { headers } = await salesAuth(app)
    const briefing = await (await app.request('/api/agent/briefing', { headers: headers() })).json() as { highPotentialOpportunities: Array<{ grade: string }> }
    expect(dashboard.metrics.highPotential).toBe(opportunities.filter((item) => item.grade === 'A').length)
    expect(briefing.highPotentialOpportunities.every((item) => item.grade === 'A')).toBe(true)
    expect(opportunities.every((item) => item.sourceType && item.occurredAt && item.evidence.every((evidence) => evidence.sourceType && evidence.publishedAt))).toBe(true)
    expect(dashboard.topOpportunities.every((item) => item.sourceType)).toBe(true)
  })

  it('重复研判返回 409，缺失详情返回 404', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const input = { companyName: '【模拟】重复测试企业', title: '重复信号研判测试项目', signal: '首批三辆氢能重卡采购已经进入正式招标阶段。', industry: '商用车', region: '河北', signalType: 'procurement', maturity: 'tendering', contactability: 'public-channel', sourceTitle: '【模拟】测试公告', occurredAt: new Date().toISOString(), sourceKind: 'demo-simulated' }
    expect((await app.request('/api/opportunities/analyze', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(input) })).status).toBe(201)
    const duplicate = await app.request('/api/opportunities/analyze', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(input) })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toMatchObject({ error: { code: 'DUPLICATE_OPPORTUNITY' } })
    expect((await app.request('/api/opportunities/not-exist')).status).toBe(404)
  })

  it('智能调用异常时安全降级并继续强调人工确认边界', async () => {
    const store = new MemoryStore()
    const runtime = {
      intelligent: true,
      model: 'test/model',
      chat: async () => { throw new Error('sensitive provider detail') },
    } as unknown as MastraRuntime
    const app = createApp(new BusinessService(store, runtime))
    const { headers } = await salesAuth(app)
    const response = await app.request('/api/agent/chat', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ message: '今天应该联系谁？' }) })
    const body = await response.json() as { mode: string; fallbackReason?: string; needsConfirmation?: string[] }
    expect(body.mode).toBe('rules')
    expect(body.fallbackReason).toContain('安全降级')
    expect(body.fallbackReason).not.toContain('sensitive provider detail')
    expect(body.needsConfirmation?.join('')).toContain('人工确认')
  })

  it('产品目录使用视觉核验后的型号与参数，不再暴露已知错误口径', async () => {
    const products = await (await createApp().request('/api/products')).json() as Array<{ id: string; model: string; ratedPower: string; peakPower?: string; reviewNote?: string }>
    expect(products.some((item) => item.model === 'E200' && item.peakPower === '210kW')).toBe(true)
    expect(products.some((item) => item.model === 'OCEAN100' && item.peakPower === '130kW')).toBe(true)
    expect(products.some((item) => item.model === 'CESP500' && item.ratedPower.includes('500Nm³/h'))).toBe(true)
    expect(products.some((item) => ['ST120', 'MT100', 'AC5'].includes(item.model))).toBe(false)
    expect(products.every((item) => item.reviewNote || !['E200', 'OCEAN100', 'CESP500'].includes(item.model))).toBe(true)
  })

  it('核心资源响应可通过共享 contracts 的 Zod Schema 校验', async () => {
    const app = createApp()
    const getJson = async (path: string) => (await app.request(path)).json()
    ProductSchema.array().parse(await getJson('/api/products'))
    RelationshipSchema.array().parse(await getJson('/api/relationships'))
    KnowledgeItemSchema.array().parse(await getJson('/api/knowledge'))
    OpportunitySchema.array().parse(await getJson('/api/opportunities'))
    DashboardSchema.parse(await getJson('/api/dashboard'))
    const { headers } = await salesAuth(app)
    AgentBriefingSchema.parse(await (await app.request('/api/agent/briefing', { headers: headers() })).json())
    const chat = await app.request('/api/agent/chat', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ message: '请介绍船用产品' }) })
    AgentChatResponseSchema.parse(await chat.json())
  })

  it('规则 Agent 使用选定关系或商机上下文准备沟通，并保留人工确认边界', async () => {
    const app = createApp()
    const { headers } = await salesAuth(app)
    const relationship = await app.request('/api/agent/chat', {
      method: 'POST', headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ message: '帮我准备沟通', relationshipId: 'rel-river-shipping' }),
    })
    const relationshipBody = await relationship.json() as { answer: string; suggestedActions: string[]; needsConfirmation: string[] }
    expect(relationshipBody.answer).toContain('【模拟】长江清能航运集团')
    expect(relationshipBody.suggestedActions.join('')).toContain('人工审核')
    expect(relationshipBody.needsConfirmation.join('')).toContain('人工确认')

    const opportunity = await app.request('/api/agent/chat', {
      method: 'POST', headers: headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ message: '给我切入建议', opportunityId: 'opp-river-vessel' }),
    })
    const opportunityBody = await opportunity.json() as { answer: string; citations: unknown[]; suggestedActions: string[] }
    expect(opportunityBody.answer).toContain('内河货船氢动力改造项目启动')
    expect(opportunityBody.citations.length).toBeGreaterThan(0)
    expect(opportunityBody.suggestedActions.join('')).toContain('人工确认')
  })
})
