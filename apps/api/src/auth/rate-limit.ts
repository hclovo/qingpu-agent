import { RateLimitedError } from './errors.js'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 15 * 60_000
const MAX_ATTEMPTS = 10

export function assertLoginAllowed(key: string) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  current.count += 1
  if (current.count > MAX_ATTEMPTS) throw new RateLimitedError()
}

export function clearLoginAttempts(key: string) {
  buckets.delete(key)
}
