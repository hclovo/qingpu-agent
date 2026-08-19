import type { Permission, PublicUser, RoleSummary, UserStatus } from '@qingpu/contracts'

export type AuthUser = PublicUser

export type StoredUser = {
  id: string
  email: string
  displayName: string
  status: UserStatus
  passwordHash: string
  mustChangePassword: boolean
  isSeed: boolean
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export type StoredRole = {
  id: string
  code: string
  name: string
  description: string
  isSystem: boolean
  sortOrder: number
  permissions: Permission[]
  createdAt: string
  updatedAt: string
}

export type StoredUserRole = {
  userId: string
  roleId: string
  assignedAt: string
  assignedBy?: string
}

export type StoredSession = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  lastSeenAt: string
  userAgent?: string
  ip?: string
  createdAt: string
}

export type ActivityEntry = {
  actorUserId?: string
  action: string
  targetType?: string
  targetId?: string
  requestId?: string
}

export function toPublicUser(
  user: StoredUser,
  roles: RoleSummary[],
  permissions: Permission[],
  primaryRole = roles[0]?.code ?? 'anonymous',
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: primaryRole,
    roles,
    status: user.status,
    permissions,
    mustChangePassword: user.mustChangePassword,
    isSeed: user.isSeed,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }
}
