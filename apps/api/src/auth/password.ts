import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64
const OPTIONS = { N: 16_384, r: 8, p: 1 } as const

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LEN, OPTIONS)
  return `scrypt$${OPTIONS.N}$${OPTIONS.r}$${OPTIONS.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, n, r, p, saltB64, hashB64] = encoded.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
