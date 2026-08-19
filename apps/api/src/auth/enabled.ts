export function isAuthEnabled(): boolean {
  const flag = process.env.AUTH_REQUIRED?.trim()
  if (flag === 'true') return true
  if (flag === 'false') return false
  return Boolean(process.env.DATABASE_URL?.trim()) && process.env.NODE_ENV === 'production'
}

export function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS?.trim()) || 12
  return hours * 3_600_000
}

export function sessionIdleMs(): number {
  const hours = Number(process.env.SESSION_IDLE_HOURS?.trim()) || 4
  return hours * 3_600_000
}

export const SESSION_COOKIE = 'qingpu_session'
