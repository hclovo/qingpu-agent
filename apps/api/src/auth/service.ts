import {
  ASSIGNABLE_PERMISSIONS,
  CreateRoleInputSchema,
  effectivePermissions,
  sanitizeRolePermissions,
  type ChangePasswordInput,
  type CreateRoleInput,
  type CreateUserInput,
  type LoginInput,
  type Permission,
  type Role,
  type UpdateRoleInput,
  type UpdateUserInput,
} from '@qingpu/contracts'
import type { BusinessStore } from '../store/store.js'
import { anonymousUser } from './anonymous.js'
import { isAuthEnabled, sessionIdleMs, sessionTtlMs } from './enabled.js'
import { AuthConflictError, AuthNotFoundError, ForbiddenError, UnauthenticatedError } from './errors.js'
import { hashPassword, verifyPassword } from './password.js'
import { assertLoginAllowed, clearLoginAttempts } from './rate-limit.js'
import { createSessionToken, hashToken } from './session.js'
import { toPublicUser, type AuthUser, type StoredRole, type StoredSession, type StoredUser } from './types.js'

const INVALID_CREDENTIALS = '邮箱或密码不正确'

export class AuthService {
  constructor(private readonly store: BusinessStore) {}

  enabled() {
    return isAuthEnabled()
  }

  async anonymousActor(): Promise<AuthUser> {
    return anonymousUser()
  }

  async login(input: LoginInput, meta: { ip?: string; userAgent?: string; requestId?: string }): Promise<{ user: AuthUser; token: string }> {
    const email = input.email.trim().toLowerCase()
    const rateKey = `${meta.ip ?? 'unknown'}:${email}`
    assertLoginAllowed(rateKey)

    const stored = await this.store.getUserByEmail(email)
    const passwordOk = stored ? verifyPassword(input.password, stored.passwordHash) : false
    if (!stored || !passwordOk) {
      await this.safeActivity({ action: 'auth.login_failed', targetType: 'user', targetId: stored?.id, requestId: meta.requestId })
      throw new UnauthenticatedError(INVALID_CREDENTIALS)
    }
    if (stored.status !== 'active') {
      await this.safeActivity({ actorUserId: stored.id, action: 'auth.login_disabled', targetType: 'user', targetId: stored.id, requestId: meta.requestId })
      throw new UnauthenticatedError('账号已停用')
    }

    clearLoginAttempts(rateKey)
    const now = new Date()
    const token = createSessionToken()
    const session: StoredSession = {
      id: `session-${crypto.randomUUID()}`,
      userId: stored.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + sessionTtlMs()).toISOString(),
      lastSeenAt: now.toISOString(),
      userAgent: meta.userAgent,
      ip: meta.ip,
      createdAt: now.toISOString(),
    }
    await this.store.createSession(session)
    await this.store.updateUser(stored.id, { lastLoginAt: now.toISOString() })
    await this.safeActivity({ actorUserId: stored.id, action: 'auth.login', targetType: 'user', targetId: stored.id, requestId: meta.requestId })
    return { user: await this.toActor(stored), token }
  }

  async logout(sessionId: string | undefined, actorUserId?: string, requestId?: string) {
    if (sessionId) await this.store.deleteSession(sessionId)
    await this.safeActivity({ actorUserId, action: 'auth.logout', targetType: 'session', targetId: sessionId, requestId })
  }

  async resolveSession(token: string): Promise<{ user: AuthUser; session: StoredSession } | undefined> {
    const session = await this.store.getSessionByTokenHash(hashToken(token))
    if (!session) return undefined
    const now = Date.now()
    if (new Date(session.expiresAt).getTime() <= now || now - new Date(session.lastSeenAt).getTime() > sessionIdleMs()) {
      await this.store.deleteSession(session.id)
      return undefined
    }
    const stored = await this.store.getUserById(session.userId)
    if (!stored || stored.status !== 'active') {
      await this.store.deleteSession(session.id)
      return undefined
    }
    await this.store.touchSession(session.id, new Date().toISOString())
    return { user: await this.toActor(stored), session }
  }

  async changePassword(userId: string, input: ChangePasswordInput, requestId?: string) {
    const stored = await this.store.getUserById(userId)
    if (!stored) throw new UnauthenticatedError()
    if (!verifyPassword(input.currentPassword, stored.passwordHash)) throw new ForbiddenError('当前密码不正确')
    const updated = await this.store.updateUser(userId, {
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: false,
    })
    if (!updated) throw new UnauthenticatedError()
    await this.safeActivity({ actorUserId: userId, action: 'auth.password_change', targetType: 'user', targetId: userId, requestId })
    return this.toActor(updated)
  }

  async listUsers(): Promise<AuthUser[]> {
    const rows = await this.store.listUsers()
    return Promise.all(rows.map((item) => this.toActor(item)))
  }

  async createUser(input: CreateUserInput, actorUserId?: string, requestId?: string): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase()
    if (await this.store.getUserByEmail(email)) throw new AuthConflictError('该邮箱已被使用')
    const roleIds = await this.resolveRoleIds(input)
    const now = new Date().toISOString()
    const stored = await this.store.createUser({
      id: `user-${crypto.randomUUID()}`,
      email,
      displayName: input.displayName.trim(),
      status: 'active',
      passwordHash: hashPassword(input.password),
      mustChangePassword: true,
      isSeed: false,
      createdAt: now,
      updatedAt: now,
    })
    await this.store.setUserRoles(stored.id, roleIds, actorUserId)
    await this.safeActivity({ actorUserId, action: 'users.create', targetType: 'user', targetId: stored.id, requestId })
    return this.toActor(stored)
  }

  async updateUser(id: string, input: UpdateUserInput, actorUserId?: string, requestId?: string): Promise<AuthUser> {
    const stored = await this.store.getUserById(id)
    if (!stored) throw new AuthNotFoundError()

    const nextRoleIds = input.roleIds || input.role ? await this.resolveRoleIds(input) : await this.store.listUserRoleIds(id)
    const nextStatus = input.status ?? stored.status
    await this.assertKeepsManagers({
      disableUserId: nextStatus === 'disabled' ? id : undefined,
      userRoleOverride: { userId: id, roleIds: nextRoleIds },
    })

    const patch: Partial<StoredUser> = {}
    if (input.displayName !== undefined) patch.displayName = input.displayName.trim()
    if (input.status !== undefined) patch.status = input.status
    if (input.password !== undefined) {
      patch.passwordHash = hashPassword(input.password)
      patch.mustChangePassword = true
    }
    const updated = await this.store.updateUser(id, patch)
    if (!updated) throw new AuthNotFoundError()
    if (input.roleIds || input.role) {
      await this.store.setUserRoles(id, nextRoleIds, actorUserId)
      await this.safeActivity({ actorUserId, action: 'users.assign_roles', targetType: 'user', targetId: id, requestId })
    }
    if (updated.status === 'disabled') await this.store.deleteSessionsForUser(id)
    await this.safeActivity({ actorUserId, action: 'users.update', targetType: 'user', targetId: id, requestId })
    return this.toActor(updated)
  }

  async listRoles(): Promise<Role[]> {
    return (await this.store.listRoles()).map(presentRole)
  }

  async getRole(id: string): Promise<Role> {
    const role = await this.store.getRoleById(id)
    if (!role) throw new AuthNotFoundError('角色不存在')
    return presentRole(role)
  }

  async createRole(input: CreateRoleInput, actorUserId?: string, requestId?: string): Promise<Role> {
    CreateRoleInputSchema.parse(input)
    if (await this.store.getRoleByCode(input.code)) throw new AuthConflictError('该角色编码已被使用')
    let permissions = sanitizeRolePermissions(input.permissionCodes ?? [])
    if (input.copyFromRoleId) {
      const source = await this.store.getRoleById(input.copyFromRoleId)
      if (!source) throw new AuthNotFoundError('复制来源角色不存在')
      permissions = sanitizeRolePermissions(input.permissionCodes ?? source.permissions)
    }
    const now = new Date().toISOString()
    const created = await this.store.createRole({
      id: `role-${crypto.randomUUID()}`,
      code: input.code,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      isSystem: false,
      sortOrder: 100,
      permissions,
      createdAt: now,
      updatedAt: now,
    })
    await this.safeActivity({ actorUserId, action: 'roles.create', targetType: 'role', targetId: created.id, requestId })
    return presentRole(created)
  }

  async updateRole(id: string, input: UpdateRoleInput, actorUserId?: string, requestId?: string): Promise<Role> {
    const role = await this.store.getRoleById(id)
    if (!role) throw new AuthNotFoundError('角色不存在')
    const nextPermissions = input.permissionCodes ? sanitizeRolePermissions(input.permissionCodes) : role.permissions
    if (input.permissionCodes) {
      await this.assertKeepsManagers({ rolePermissionOverride: { roleId: id, permissions: nextPermissions } })
    }
    const updated = await this.store.updateRole(id, {
      name: input.name?.trim(),
      description: input.description?.trim(),
      permissions: input.permissionCodes ? nextPermissions : undefined,
    })
    if (!updated) throw new AuthNotFoundError('角色不存在')
    await this.safeActivity({ actorUserId, action: 'roles.update', targetType: 'role', targetId: id, requestId })
    return presentRole(updated)
  }

  async deleteRole(id: string, actorUserId?: string, requestId?: string) {
    const role = await this.store.getRoleById(id)
    if (!role) throw new AuthNotFoundError('角色不存在')
    if (role.isSystem) throw new AuthConflictError('不能删除系统角色')
    if (await this.store.countUsersWithRole(id) > 0) throw new AuthConflictError('请先把用户改派到其他角色')
    await this.assertKeepsManagers({ removeRoleId: id })
    await this.store.deleteRole(id)
    await this.safeActivity({ actorUserId, action: 'roles.delete', targetType: 'role', targetId: id, requestId })
  }

  permissionCatalog() {
    return ASSIGNABLE_PERMISSIONS
  }

  hasPermission(user: AuthUser | undefined, permission: Permission) {
    return Boolean(user?.permissions.includes(permission))
  }

  private async resolveRoleIds(input: { role?: string; roleIds?: string[] }): Promise<string[]> {
    const raw = input.roleIds?.length ? input.roleIds : input.role ? [input.role] : []
    if (!raw.length) throw new AuthConflictError('至少指定一个角色')
    const ids: string[] = []
    for (const value of raw) {
      const role = await this.store.getRoleById(value) ?? await this.store.getRoleByCode(value)
      if (!role) throw new AuthNotFoundError(`角色不存在：${value}`)
      ids.push(role.id)
    }
    return [...new Set(ids)]
  }

  private async assertKeepsManagers(options: {
    disableUserId?: string
    userRoleOverride?: { userId: string; roleIds: string[] }
    rolePermissionOverride?: { roleId: string; permissions: Permission[] }
    removeRoleId?: string
  }) {
    const [allUsers, allRoles] = await Promise.all([this.store.listUsers(), this.store.listRoles()])
    const roleMap = new Map(allRoles.map((item) => [item.id, { ...item, permissions: [...item.permissions] }]))
    if (options.rolePermissionOverride) {
      const role = roleMap.get(options.rolePermissionOverride.roleId)
      if (role) role.permissions = options.rolePermissionOverride.permissions
    }
    if (options.removeRoleId) roleMap.delete(options.removeRoleId)

    let userManagers = 0
    let roleManagers = 0
    for (const user of allUsers) {
      if (user.status !== 'active' || user.id === options.disableUserId) continue
      let roleIds = options.userRoleOverride?.userId === user.id
        ? options.userRoleOverride.roleIds
        : await this.store.listUserRoleIds(user.id)
      if (options.removeRoleId) roleIds = roleIds.filter((item) => item !== options.removeRoleId)
      const permissions = effectivePermissions(...roleIds.map((roleId) => roleMap.get(roleId)?.permissions ?? []))
      if (permissions.includes('users.manage')) userManagers += 1
      if (permissions.includes('roles.manage')) roleManagers += 1
    }
    if (userManagers < 1) throw new AuthConflictError('不能移除最后一位可管账号的人')
    if (roleManagers < 1) throw new AuthConflictError('不能移除最后一位可管理角色的人')
  }

  private async toActor(user: StoredUser): Promise<AuthUser> {
    const roleIds = await this.store.listUserRoleIds(user.id)
    const resolved = (await Promise.all(roleIds.map((id) => this.store.getRoleById(id))))
      .filter((item): item is StoredRole => Boolean(item))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh'))
    return toPublicUser(
      user,
      resolved.map((item) => ({ id: item.id, code: item.code, name: item.name })),
      effectivePermissions(...resolved.map((item) => item.permissions)),
    )
  }

  private async safeActivity(entry: Parameters<BusinessStore['recordActivity']>[0]) {
    try {
      await this.store.recordActivity(entry)
    } catch {
      // 活动日志失败不影响主路径
    }
  }
}

function presentRole(role: StoredRole): Role {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    sortOrder: role.sortOrder,
    permissions: role.permissions,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  }
}
