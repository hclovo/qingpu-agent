import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PublicUserSchema } from '@qingpu/contracts'
import { createApp } from './app.js'
import { SEED_USER_PASSWORDS } from './data/seed-users.js'

function cookieFrom(response: Response) {
  const header = response.headers.get('set-cookie')
  return header?.split(';')[0]
}

async function login(app: ReturnType<typeof createApp>, email: keyof typeof SEED_USER_PASSWORDS) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: SEED_USER_PASSWORDS[email] }),
  })
  const cookie = cookieFrom(response)
  const body = await response.json() as { user?: unknown; error?: { code: string } }
  return { response, cookie, body }
}

describe('认证与权限', () => {
  const previous = process.env.AUTH_REQUIRED

  beforeEach(() => {
    process.env.AUTH_REQUIRED = 'true'
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.AUTH_REQUIRED
    else process.env.AUTH_REQUIRED = previous
  })

  it('未登录访问业务接口返回 401，健康检查仍可用', async () => {
    const app = createApp()
    const health = await app.request('/api/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ authRequired: true })
    const dashboard = await app.request('/api/dashboard')
    expect(dashboard.status).toBe(401)
    expect(await dashboard.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('销售账号可以登录并访问发现接口', async () => {
    const app = createApp()
    const { response, cookie, body } = await login(app, 'sales@qingpu.local')
    expect(response.status).toBe(200)
    expect(cookie).toMatch(/^qingpu_session=/)
    expect(PublicUserSchema.parse(body.user)).toMatchObject({ role: 'sales', email: 'sales@qingpu.local' })
    const me = await app.request('/api/me', { headers: { cookie: cookie! } })
    expect(me.status).toBe(200)
    const discover = await app.request('/api/opportunities/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ query: '船舶 氢能', days: 90 }),
    })
    expect(discover.status).toBe(200)
  })

  it('观察者不能发起商机发现', async () => {
    const app = createApp()
    const { cookie } = await login(app, 'viewer@qingpu.local')
    const discover = await app.request('/api/opportunities/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ query: '船舶 氢能', days: 90 }),
    })
    expect(discover.status).toBe(403)
    expect(await discover.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
  })

  it('供应链不能改商机阶段', async () => {
    const app = createApp()
    const admin = await login(app, 'admin@qingpu.local')
    const created = await app.request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie! },
      body: JSON.stringify({ email: 'supply@qingpu.local', displayName: '供应链', role: 'supply', password: 'QingpuSupply!26' }),
    })
    expect(created.status).toBe(201)
    const supplyLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'supply@qingpu.local', password: 'QingpuSupply!26' }),
    })
    const cookie = cookieFrom(supplyLogin)
    const updated = await app.request('/api/opportunities/opp-river-vessel/stage', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ stage: 'engaging' }),
    })
    expect(updated.status).toBe(403)
  })

  it('不能停用最后一位管理员', async () => {
    const app = createApp()
    const { cookie } = await login(app, 'admin@qingpu.local')
    const response = await app.request('/api/users/user-seed-admin', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ status: 'disabled' }),
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'AUTH_CONFLICT' } })
  })

  it('管理员可自定义角色并把并集权限派给用户', async () => {
    const app = createApp()
    const { cookie } = await login(app, 'admin@qingpu.local')
    const created = await app.request('/api/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ code: 'region_east', name: '大区销售', copyFromRoleId: 'role-sales' }),
    })
    expect(created.status).toBe(201)
    const role = await created.json() as { id: string; permissions: string[] }
    expect(role.permissions).toContain('opportunities.discover')

    const forbidden = await app.request(`/api/roles/role-admin`, { method: 'DELETE', headers: { cookie: cookie! } })
    expect(forbidden.status).toBe(409)

    const assigned = await app.request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({
        email: 'combo@qingpu.local',
        displayName: '兼岗',
        roleIds: ['role-sales', 'role-presales'],
        password: 'QingpuCombo!26',
      }),
    })
    expect(assigned.status).toBe(201)
    const user = await assigned.json() as { permissions: string[]; roles: Array<{ code: string }> }
    expect(user.permissions).toEqual(expect.arrayContaining(['opportunities.discover', 'products.review', 'session.self']))
    expect(user.roles.map((item) => item.code).sort()).toEqual(['presales', 'sales'])

    await app.request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({
        email: 'east@qingpu.local',
        displayName: '大区',
        roleIds: [role.id],
        password: 'QingpuEast!26',
      }),
    })
    const inUse = await app.request(`/api/roles/${role.id}`, { method: 'DELETE', headers: { cookie: cookie! } })
    expect(inUse.status).toBe(409)
  })

  it('错误口令不暴露账号是否存在', async () => {
    const app = createApp()
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@qingpu.local', password: 'wrong-password' }),
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { message: '邮箱或密码不正确' } })
  })
})
