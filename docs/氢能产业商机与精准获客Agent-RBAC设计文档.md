# 氢能产业商机与精准获客 Agent — RBAC 设计文档

> 版本：V2.0  
> 日期：2026-08-19  
> 状态：已实现（V2 自定义角色 / 角色权限 / 用户派角）  
> 前置：`氢能产业商机与精准获客Agent-用户与权限设计文档.md`（V1 已实现）

## 1. 为什么要演进

V1 把角色写成枚举，权限矩阵写在 `ROLE_PERMISSIONS` 常量里：

```text
用户 ──1── 固定角色码 ──应用层矩阵── 能力码
```

这够用「五类业务角色 + 观察者」，但改一次矩阵就要发版。氢璞后续会出现「销售兼售前」「只开放发现、不许改阶段」等组合，需要标准 RBAC：

```text
用户 *── 用户角色 ──* 角色 *── 角色权限 ──* 能力码（产品目录）
```

本设计只做三件事：

1. **自定义角色**（名称、编码、说明；可复制系统角色）。
2. **给角色分配权限**（从封闭能力目录勾选）。
3. **给用户分配角色**（一用户可多角色，生效权限取并集）。

认证、Cookie、停用吊销、`created_by`、人工确认边界、单租户共享工作台，全部沿用 V1。

## 2. 模型

### 2.1 三层，而不是两层

| 层 | 谁定义 | 能否在界面新建 |
| --- | --- | --- |
| **能力码 Permission** | 产品（与 API / 导航一一对应） | 否。新增能力必须改代码 |
| **角色 Role** | 管理员 | 是 |
| **用户 User** | 管理员 | 是（沿用现有建号） |

管理员不能发明 `opportunities.delete-all` 这种能力。他们只能把已有能力码打成不同的「角色包」，再把包发给人。

### 2.2 生效权限

```text
effective(user) = ∪ { permissions(role) | role ∈ user.roles } ∪ { session.self }
```

- 多角色取 **并集**，不做交集、不做拒绝覆盖。
- `session.self` 对任何已登录账号 **隐式授予**，不出现在角色勾选里，避免管理员误取消后无法改密、无法登出。
- 未登录且 `AUTH_REQUIRED=false`：虚拟主体 `anonymous`（游客），权限固定为只读查看包（总览 / 关系 / 知识 / 商机 / 产品），**不能**对话 Agent、改知识库、记录互动或发现/研判商机。游客能力不随系统角色矩阵改动。
- 路由与按钮仍只认 **能力码**，不认角色名。自定义「大区经理」只要勾了 `opportunities.discover`，就能点自动发现。

### 2.3 系统角色与自定义角色

种子六类角色继续存在，作为可改、不可删的模板：

| `code` | 中文 | `isSystem` |
| --- | --- | --- |
| `sales` | 市场/销售 | 是 |
| `supply` | 采购/供应链 | 是 |
| `sales_lead` | 销售负责人 | 是 |
| `presales` | 产品/售前 | 是 |
| `admin` | 系统管理员 | 是 |
| `viewer` | 演示观察者 | 是 |

系统角色：

- 可以改显示名、说明、权限勾选（例如把销售的发现关掉）。
- 不可以删、不可以改 `code`、不可以取消 `isSystem`。
- 出厂权限与 V1 第 4.2 节矩阵一致，作为迁移默认值。

自定义角色：

- 管理员新建，建议「从系统角色复制」再改。
- `code` 全局唯一，格式 `^[a-z][a-z0-9_-]{1,31}$`。
- 无用户引用时可删；有引用时先改派或拒绝删除（409）。

### 2.4 一用户多角色

V1 是「恰好一个角色」。自定义之后，兼岗是常态（销售 + 售前、管理员 + 观察者演示号分开更好，但兼岗仍会出现）。

规则：

- 用户至少绑定 **1** 个角色。
- 可以绑定多个；界面用多选，默认建号时选一个。
- `PublicUser.role` **保留**，取「排序最前的角色 code」，兼容现有壳层展示。
- 新增 `PublicUser.roles: { id, code, name }[]`。
- 前端展示用角色中文名列表，鉴权只用 `permissions`。

不引入「角色优先级 / 拒绝权限 / 数据范围」。共享工作台不变。

## 3. 能力目录（封闭）

沿用 V1 能力码，并增加角色管理两项：

| 能力码 | 含义 | 入口 |
| --- | --- | --- |
| 既有 16 项 | 见 V1 §4.1 | 不变 |
| `roles.read` | 查看角色与矩阵 | `GET /api/roles` |
| `roles.manage` | 新建/改/删角色，改角色权限 | `POST/PATCH/DELETE /api/roles` |

`users.manage` 继续只管 **人**：建号、停用、重置口令、**给用户派角色**。  
改某个角色有哪些能力，走 `roles.manage`。一个人可以同时拥有这两项（出厂 `admin` 都有）。

出厂 `admin` 在 V1 基础上增加 `roles.read`、`roles.manage`。其余系统角色默认不加。

导航：

| 页 | 最低能力 |
| --- | --- |
| 用户管理 `/settings/users` | `users.read` |
| 角色权限 `/settings/roles` | `roles.read` |

按钮「保存矩阵 / 新建角色」要 `roles.manage`。

## 4. 安全护栏

自定义 RBAC 最容易把自己锁死。服务端必须拦截，不能只靠前端。

| 规则 | 冲突时 |
| --- | --- |
| 全系统至少一名 **启用** 用户，其生效权限含 `users.manage` | 409「不能移除最后一位可管账号的人」 |
| 全系统至少有一个角色含 `users.manage` 且仍被启用用户引用 | 409 |
| 全系统至少有一个角色含 `roles.manage` 且仍被启用用户引用 | 409 |
| 删除系统角色 / 改系统角色 `code` | 409 |
| 删除仍被用户引用的角色 | 409「请先把用户改派到其他角色」 |
| 给用户去掉全部角色 | 400 |
| 写入不存在的能力码 | 400 |
| 能力目录以外的字符串 | 400 |
| `session.self` 出现在角色矩阵请求里 | 忽略，不落库 |

「最后一位管理员」从「`role === admin`」改为「生效权限含 `users.manage` 的启用用户」。停用、改派、改矩阵三条路径都要跑同一套检查。

## 5. 数据库

新迁移 `0002_rbac.sql`。不改 V1 认证开关与会话表。

### 5.1 `roles`

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | `role-<uuid>`；系统角色可用稳定 id，如 `role-sales` |
| `code` | `text` | UQ | `sales` / `region_east` |
| `name` | `text` |  | 界面中文名 |
| `description` | `text` | 默认 `''` |  |
| `is_system` | `boolean` | 默认 `false` | 种子六类为 true |
| `sort_order` | `integer` | 默认 `100` | 列表与 `PublicUser.role` 取值 |
| `created_at` / `updated_at` | `timestamptz` |  |  |

### 5.2 `role_permissions`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `role_id` | `text` | PK, FK → roles ON DELETE CASCADE |
| `permission` | `text` | PK；值必须属于能力目录 |

不建 `permissions` 表。目录在 contracts 常量里，避免库与代码两套真相。

### 5.3 `user_roles`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `user_id` | `text` | PK, FK → users ON DELETE CASCADE |
| `role_id` | `text` | PK, FK → roles ON DELETE RESTRICT |
| `assigned_at` | `timestamptz` | 默认 now() |
| `assigned_by` | `text` | 可空，FK → users SET NULL |

### 5.4 `users` 变更

| 动作 | 说明 |
| --- | --- |
| 新增可空 `role_id` 过渡列（可选） | 不推荐长期保留 |
| **删除** `users.role`（`user_role` 枚举） | 权限来源改为 `user_roles` |
| 保留 `status` / 密码 / 种子标记 | 不变 |

迁移步骤：

1. 建 `roles`、`role_permissions`、`user_roles`。
2. 插入六个系统角色及 V1 矩阵。
3. `INSERT user_roles SELECT id, mapped_role_id FROM users`。
4. 确认每个用户至少一行后，删除 `users.role` 与枚举 `user_role`。

内存 Store 用同样三张结构的数组，种子逻辑与 Postgres 一致。

## 6. API

### 6.1 角色

| 方法 | 路径 | 能力 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/roles` | `roles.read` | 列表，含每角色权限数组 |
| GET | `/api/roles/:id` | `roles.read` | 详情 |
| POST | `/api/roles` | `roles.manage` | `{ code, name, description?, permissionCodes[], copyFromRoleId? }` |
| PATCH | `/api/roles/:id` | `roles.manage` | 改名/说明/权限；系统角色不可改 code |
| DELETE | `/api/roles/:id` | `roles.manage` | 非系统且无引用 |

`GET /api/permissions`（`roles.read` 或已登录即可）：返回能力目录，供矩阵勾选，含分组与中文说明。

### 6.2 用户（相对 V1 的增量）

| 方法 | 路径 | 变化 |
| --- | --- | --- |
| POST | `/api/users` | `role` 改为 `roleIds: string[]`（至少 1）；过渡期仍接受单个 `role` code |
| PATCH | `/api/users/:id` | `roleIds` 整表替换该用户角色；去掉 `role` 枚举 |
| GET | `/api/users` / `/api/me` | 增加 `roles[]`；`permissions` 为并集；`role` 为 sort 最小的 code |

创建示例：

```json
{
  "email": "li@qingpu.local",
  "displayName": "李销售",
  "password": "********",
  "roleIds": ["role-sales"]
}
```

兼岗：

```json
{ "roleIds": ["role-sales", "role-presales"] }
```

### 6.3 主体

```ts
type AuthUser = {
  id: string
  email: string
  displayName: string
  role: string          // 兼容展示，不再是固定枚举
  roles: Array<{ id: string; code: string; name: string }>
  permissions: Permission[]
  status: 'active' | 'disabled'
}
```

`requirePermission(code)` 只读 `permissions`，与 V1 中间件兼容。

错误码沿用：400 校验、401 未登录、403 无能力、409 护栏冲突。

活动日志新增：`roles.create` `roles.update` `roles.delete` `users.assign_roles`。

## 7. 前端

### 7.1 角色权限页 `/settings/roles`

一张矩阵：行 = 能力（按 Agent / 关系 / 知识 / 商机 / 产品 / 账号 分组），列 = 角色。

- `roles.manage`：单元格可勾选，底部保存（按列或整表提交）。
- 顶部「从角色复制」「新建角色」。
- 系统角色列带「系统」标记，无删除。
- 自定义列可删除（无引用时）。

不做组织树、不做权限继承树。氢璞人数少，一张表比树更不容易点错。

### 7.2 用户页 `/settings/users`

角色列从「单个下拉」改为 **多选**（或标签选择）。新建账号必选至少一角。展示「市场/销售 · 产品/售前」。

### 7.3 壳层

状态栏继续显示主角色中文名；多角色时显示「销售 等 2 个」。导航与按钮仍看 `me.permissions`。

观察者、供应链等 **出厂行为不变**，除非管理员改了系统角色矩阵。

## 8. 与 V1 的兼容

| 项 | 策略 |
| --- | --- |
| Cookie / 登录 / 限流 | 不动 |
| `AUTH_REQUIRED` / 匿名演示 | 关认证时游客只读，写操作与 Agent 需登录 |
| 业务路由守卫 | 仍挂能力码 |
| 前端 `PublicUser.role` | 保留字符串，放宽枚举 |
| 种子账号 | 仍绑定系统角色：admin / sales / viewer |
| 最后管理员 | 语义改为「最后一位具备 users.manage 的启用用户」 |
| Agent | 仍不直接写库；Prompt 可带角色名列表，不带完整矩阵 |

## 9. 明确不做

- 多租户、数据范围（行级 ACL）。
- 用户直接勾选权限（绕过角色）。那会让「角色包」形同虚设，排障困难。
- 管理员自造能力码。
- 角色继承（`sales_lead extends sales`）。并集多角色已能表达兼岗。
- 审批流、SSO、负责人字段（仍属 F09 / 需求 4.3 非目标）。

## 10. 实施切片

| 切片 | 内容 | 验收 |
| --- | --- | --- |
| R1 契约与目录 | `Role` 类型、能力分组文案、`roleIds` | 旧 `ROLE_PERMISSIONS` 仅作种子 |
| R2 表与迁移 | `0002_rbac`、回填 user_roles、删枚举 | 旧库用户权限与 V1 矩阵一致 |
| R3 角色 API | CRUD + 矩阵 + 护栏 | 删最后管账号角色 → 409 |
| R4 用户派角 | 创建/更新走 roleIds，生效权限并集 | 销售+售前可研判也可 `products.review` |
| R5 Web | `/settings/roles` 分栏编辑、用户派角抽屉 | 新建「大区销售」只给 discover+read |
| R6 回归 | 关认证测试仍绿；V1 auth 用例改绑系统角色 | viewer 发现仍 403（出厂矩阵） |

## 11. 验收口径

1. 管理员能新建角色、勾选既有能力、保存后立即对已派该角色的用户生效（下次请求即可，无需重新登录；会话里只存 userId）。
2. 给用户分配多个角色后，`/api/me.permissions` 为并集。
3. 不能删除系统角色；不能删除仍被引用的自定义角色。
4. 不能通过改矩阵或改派，使系统失去最后一位可管理用户/角色的人。
5. 界面不能创建目录外的能力；API 同样拒绝。
6. 出厂六类角色行为与 V1 矩阵一致，现有演示与观察者路径不 regress。
7. `AUTH_REQUIRED=false` 时游客仅有只读查看；Agent、知识写入、发现/研判需登录后的角色权限。
8. 业务写入、人工确认、单租户共享范围均不因 RBAC 改变。

## 12. 风险

| 项 | 说明 | 处理 |
| --- | --- | --- |
| 改系统角色影响面大 | 改 `sales` 等于改所有销售号 | 矩阵页对系统列二次确认 |
| 并集难解释 | 「为什么他能发现」 | `/api/me` 可附 `permissionSources`（可选，二期） |
| 枚举删除 | 旧代码仍写 `user.role === 'admin'` | 实现时全局改为 `has('users.manage')` |
| 匿名读库 | 内存模式无角色表 | 种子必须在 MemoryStore 同步创建 |

## 13. 参考

- 已落地：`packages/contracts/src/auth.ts`、`apps/api/src/auth/*`、`/settings/users`
- V1 用户与权限设计文档 §4 能力码与矩阵
- 需求文档 §3.1 五类角色（作为系统角色种子，不再是唯一形态）
