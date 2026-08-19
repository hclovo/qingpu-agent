import type { Permission } from '@qingpu/contracts'
import type { Context, MiddlewareHandler, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { isAuthEnabled, SESSION_COOKIE } from './enabled.js'
import { ForbiddenError, UnauthenticatedError } from './errors.js'
import type { AuthService } from './service.js'
import type { AuthUser } from './types.js'

export type AuthVariables = {
  requestId: string
  actor?: AuthUser
  sessionId?: string
}

function readSessionToken(c: Context<{ Variables: AuthVariables }>) {
  const cookie = getCookie(c, SESSION_COOKIE)
  if (cookie) return cookie
  const header = c.req.header('authorization')
  if (header?.startsWith('Bearer ')) return header.slice(7).trim()
  return undefined
}

export function attachActor(auth: AuthService): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const token = readSessionToken(c)
    if (token) {
      const resolved = await auth.resolveSession(token)
      if (resolved) {
        c.set('actor', resolved.user)
        c.set('sessionId', resolved.session.id)
      }
    }
    if (!c.get('actor') && !isAuthEnabled()) c.set('actor', await auth.anonymousActor())
    await next()
  }
}

export function requireAuth(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c: Context<{ Variables: AuthVariables }>, next: Next) => {
    if (!c.get('actor')) throw new UnauthenticatedError()
    await next()
  }
}

export function requirePermission(permission: Permission): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c: Context<{ Variables: AuthVariables }>, next: Next) => {
    const actor = c.get('actor')
    if (!actor) throw new UnauthenticatedError()
    if (!actor.permissions.includes(permission)) throw new ForbiddenError()
    await next()
  }
}
