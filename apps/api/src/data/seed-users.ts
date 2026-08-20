import { hashPassword } from '../auth/password.js'
import type { StoredUser } from '../auth/types.js'

export const SEED_USER_PASSWORDS = {
  'admin@qingpu.local': 'QingpuAdmin!26',
  'sales@qingpu.local': 'QingpuSales!26',
  'viewer@qingpu.local': 'QingpuViewer!26',
} as const

export function createSeedUsers(now = new Date().toISOString()): StoredUser[] {
  return [
    {
      id: 'user-seed-admin',
      email: 'admin@qingpu.local',
      displayName: '系统管理员',
      status: 'active',
      passwordHash: hashPassword(SEED_USER_PASSWORDS['admin@qingpu.local']),
      mustChangePassword: false,
      isSeed: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-seed-sales',
      email: 'sales@qingpu.local',
      displayName: '市场销售',
      status: 'active',
      passwordHash: hashPassword(SEED_USER_PASSWORDS['sales@qingpu.local']),
      mustChangePassword: false,
      isSeed: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'user-seed-viewer',
      email: 'viewer@qingpu.local',
      displayName: '演示观察者',
      status: 'active',
      passwordHash: hashPassword(SEED_USER_PASSWORDS['viewer@qingpu.local']),
      mustChangePassword: false,
      isSeed: true,
      createdAt: now,
      updatedAt: now,
    },
  ]
}
