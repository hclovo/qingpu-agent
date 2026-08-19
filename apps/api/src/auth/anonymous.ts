import { permissionsForRole } from '@qingpu/contracts'
import type { AuthUser } from './types.js'

export const ANONYMOUS_USER_ID = 'user-anonymous'

export function anonymousUser(): AuthUser {
  return {
    id: ANONYMOUS_USER_ID,
    email: 'anonymous@qingpu.local',
    displayName: '游客',
    role: 'anonymous',
    roles: [],
    status: 'active',
    permissions: permissionsForRole('anonymous'),
    mustChangePassword: false,
    isSeed: false,
  }
}
