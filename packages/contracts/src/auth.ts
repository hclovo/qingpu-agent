import { z } from 'zod'

export const UserStatusSchema = z.enum(['active', 'disabled'])
export const PermissionSchema = z.enum([
  'agent.chat',
  'agent.briefing',
  'dashboard.read',
  'relationships.read',
  'relationships.touch',
  'knowledge.read',
  'knowledge.write',
  'opportunities.read',
  'opportunities.analyze',
  'opportunities.discover',
  'opportunities.stage',
  'products.read',
  'products.review',
  'users.read',
  'users.manage',
  'roles.read',
  'roles.manage',
  'session.self',
])

export type UserStatus = z.infer<typeof UserStatusSchema>
export type Permission = z.infer<typeof PermissionSchema>

const ALL_PERMISSIONS = PermissionSchema.options
export const ASSIGNABLE_PERMISSIONS = ALL_PERMISSIONS.filter((item) => item !== 'session.self')

export const SYSTEM_ROLE_CODES = ['sales', 'supply', 'sales_lead', 'presales', 'admin', 'viewer'] as const
export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number]

export const ROLE_PERMISSIONS: Record<SystemRoleCode, readonly Permission[]> = {
  sales: [
    'agent.chat', 'agent.briefing', 'dashboard.read',
    'relationships.read', 'relationships.touch',
    'knowledge.read', 'knowledge.write',
    'opportunities.read', 'opportunities.analyze', 'opportunities.discover', 'opportunities.stage',
    'products.read',
  ],
  supply: [
    'agent.chat', 'agent.briefing', 'dashboard.read',
    'relationships.read', 'relationships.touch',
    'knowledge.read', 'knowledge.write',
    'opportunities.read', 'products.read',
  ],
  sales_lead: [
    'agent.chat', 'agent.briefing', 'dashboard.read',
    'relationships.read', 'relationships.touch',
    'knowledge.read', 'knowledge.write',
    'opportunities.read', 'opportunities.analyze', 'opportunities.discover', 'opportunities.stage',
    'products.read',
  ],
  presales: [
    'agent.chat', 'agent.briefing', 'dashboard.read',
    'relationships.read',
    'knowledge.read', 'knowledge.write',
    'opportunities.read', 'products.read', 'products.review',
  ],
  admin: [
    'agent.chat', 'agent.briefing', 'dashboard.read',
    'relationships.read', 'knowledge.read', 'opportunities.read', 'products.read', 'products.review',
    'users.read', 'users.manage', 'roles.read', 'roles.manage',
  ],
  viewer: [
    'dashboard.read', 'relationships.read', 'knowledge.read', 'opportunities.read', 'products.read',
  ],
}

/** 未登录游客（AUTH_REQUIRED=false）固定只读，不随系统角色矩阵改动 */
export const GUEST_PERMISSIONS = ROLE_PERMISSIONS.viewer

export const SYSTEM_ROLE_DEFS = [
  { id: 'role-sales', code: 'sales', name: '市场/销售', description: '发现线索、维护客户、研判与跟进', sortOrder: 10 },
  { id: 'role-supply', code: 'supply', name: '采购/供应链', description: '维护上游与伙伴，补供应侧知识', sortOrder: 20 },
  { id: 'role-sales-lead', code: 'sales_lead', name: '销售负责人', description: '看全量结构并校准跟进优先级', sortOrder: 30 },
  { id: 'role-presales', code: 'presales', name: '产品/售前', description: '维护产品边界与知识，复核匹配', sortOrder: 40 },
  { id: 'role-admin', code: 'admin', name: '系统管理员', description: '管理账号与角色，默认不写业务对象', sortOrder: 50 },
  { id: 'role-viewer', code: 'viewer', name: '演示观察者', description: '会议室只读，不能改数据或触发发现', sortOrder: 60 },
] as const

export const PERMISSION_CATALOG = [
  { group: 'Agent', items: [
    { code: 'agent.chat', label: '与 Agent 对话' },
    { code: 'agent.briefing', label: '每日行动简报' },
  ] },
  { group: '总览与关系', items: [
    { code: 'dashboard.read', label: '查看业务总览' },
    { code: 'relationships.read', label: '查看关系' },
    { code: 'relationships.touch', label: '记录互动' },
  ] },
  { group: '知识与产品', items: [
    { code: 'knowledge.read', label: '检索知识' },
    { code: 'knowledge.write', label: '补充知识' },
    { code: 'products.read', label: '查看产品知识' },
    { code: 'products.review', label: '维护产品复核说明' },
  ] },
  { group: '商机', items: [
    { code: 'opportunities.read', label: '查看商机' },
    { code: 'opportunities.analyze', label: '信号研判入库' },
    { code: 'opportunities.discover', label: '自动发现' },
    { code: 'opportunities.stage', label: '变更商机阶段' },
  ] },
  { group: '账号与角色', items: [
    { code: 'users.read', label: '查看账号' },
    { code: 'users.manage', label: '管理账号与派角' },
    { code: 'roles.read', label: '查看角色权限' },
    { code: 'roles.manage', label: '自定义角色与权限' },
  ] },
] as const

export const RoleCodeSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/, '角色编码须为小写字母开头的 2–32 位标识')

export const RoleSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
})

export const RoleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
  permissions: z.array(PermissionSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export function sanitizeRolePermissions(codes: readonly string[]): Permission[] {
  const allowed = new Set<string>(ASSIGNABLE_PERMISSIONS)
  return [...new Set(codes.filter((item): item is Permission => allowed.has(item)))]
}

export function effectivePermissions(...groups: Array<readonly Permission[]>): Permission[] {
  return [...new Set([...groups.flat(), 'session.self' as const])]
}

export function permissionsForRole(role: string): Permission[] {
  if (role === 'anonymous') return effectivePermissions(GUEST_PERMISSIONS)
  if ((SYSTEM_ROLE_CODES as readonly string[]).includes(role)) {
    return effectivePermissions(ROLE_PERMISSIONS[role as SystemRoleCode])
  }
  return ['session.self']
}

export function hasPermission(permissions: readonly Permission[], permission: Permission): boolean {
  return permissions.includes(permission)
}

export const PublicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  roles: z.array(RoleSummarySchema).default([]),
  status: UserStatusSchema,
  permissions: z.array(PermissionSchema),
  mustChangePassword: z.boolean(),
  isSeed: z.boolean(),
  lastLoginAt: z.string().optional(),
  createdAt: z.string().optional(),
})

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
})

export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
})

export const CreateUserInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
  role: z.string().min(1).optional(),
  roleIds: z.array(z.string().min(1)).optional(),
  password: z.string().min(8).max(200),
}).refine((value) => Boolean(value.role) || (value.roleIds && value.roleIds.length > 0), {
  message: '至少指定一个角色',
  path: ['roleIds'],
})

export const UpdateUserInputSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  role: z.string().min(1).optional(),
  roleIds: z.array(z.string().min(1)).optional(),
  status: UserStatusSchema.optional(),
  password: z.string().min(8).max(200).optional(),
})

export const CreateRoleInputSchema = z.object({
  code: RoleCodeSchema,
  name: z.string().min(2).max(40),
  description: z.string().max(200).optional(),
  permissionCodes: z.array(PermissionSchema).optional(),
  copyFromRoleId: z.string().optional(),
})

export const UpdateRoleInputSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  description: z.string().max(200).optional(),
  permissionCodes: z.array(PermissionSchema).optional(),
})

export type PublicUser = z.infer<typeof PublicUserSchema>
export type RoleSummary = z.infer<typeof RoleSummarySchema>
export type Role = z.infer<typeof RoleSchema>
export type LoginInput = z.infer<typeof LoginInputSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>
export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>
export type UpdateRoleInput = z.infer<typeof UpdateRoleInputSchema>

export const ALL_PERMISSION_CODES = ALL_PERMISSIONS

/** @deprecated 使用 SYSTEM_ROLE_CODES；保留给过渡期调用方 */
export const UserRoleSchema = z.enum(SYSTEM_ROLE_CODES)
export type UserRole = SystemRoleCode
export const PublicUserRoleSchema = z.string()
export type PublicUserRole = string
