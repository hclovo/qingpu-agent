import { ROLE_PERMISSIONS, SYSTEM_ROLE_DEFS, sanitizeRolePermissions, type Permission } from '@qingpu/contracts'
import type { StoredRole, StoredUserRole } from '../auth/types.js'

export function systemRoleId(code: string) {
  return SYSTEM_ROLE_DEFS.find((item) => item.code === code)?.id ?? `role-${code}`
}

export function createSeedRoles(now = new Date().toISOString()): StoredRole[] {
  return SYSTEM_ROLE_DEFS.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    isSystem: true,
    sortOrder: item.sortOrder,
    permissions: sanitizeRolePermissions(ROLE_PERMISSIONS[item.code]),
    createdAt: now,
    updatedAt: now,
  }))
}

export function createSeedUserRoles(now = new Date().toISOString()): StoredUserRole[] {
  return [
    { userId: 'user-seed-admin', roleId: 'role-admin', assignedAt: now },
    { userId: 'user-seed-sales', roleId: 'role-sales', assignedAt: now },
    { userId: 'user-seed-viewer', roleId: 'role-viewer', assignedAt: now },
  ]
}

export function seedPermissionsForCode(code: keyof typeof ROLE_PERMISSIONS): Permission[] {
  return sanitizeRolePermissions(ROLE_PERMISSIONS[code])
}
