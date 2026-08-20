import { createHash, randomBytes } from 'node:crypto'

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function persistableActorId(userId: string | undefined): string | undefined {
  return userId && userId !== 'user-anonymous' ? userId : undefined
}
