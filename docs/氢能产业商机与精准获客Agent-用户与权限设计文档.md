# 氢能产业商机与精准获客 Agent 用户与权限设计文档

> 版本：V1.1  
> 日期：2026-08-19  
> 状态：V1 固定角色已落地。自定义角色见 [RBAC 设计文档](./氢能产业商机与精准获客Agent-RBAC设计文档.md)。  
> 对应需求：`氢能产业商机与精准获客Agent-需求文档.md`  
> 对应设计：`氢能产业商机与精准获客Agent-前后端设计文档.md`  
> 对应数据库：`氢能产业商机与精准获客Agent-数据库设计文档.md`

## 1. 设计目标

当前系统是**单企业工作台**：面向北京氢璞创能内部少数人，把行业信号变成可核验、可跟进的商机。需求文档 3.1 已给出五类业务角色；数据库文档明确 V1 **无认证**；前后端设计把身份认证和 RBAC 列在生产化清单。

本设计补上用户与权限，原则是：

1. **单租户，不做多租户。** 需求 4.3 已排除「大规模……多租户权限体系」。全员共享同一套关系、知识、商机。
2. **角色来自业务，不来自通用 SaaS。** 市场/销售、采购/供应链、销售负责人、产品/售前、系统管理员；另增只读「演示观察者」，覆盖 PRODUCT.md 中的评审、领导和客户参观。
3. **权限是能力码，角色是能力包。** API 和导航按能力码判断，避免把角色名写死在每个路由里。
4. **先管「能不能做」，不管「分给谁」。** 需求 F09：MVP 不含多人分配、审批和完整审计。本阶段不引入商机负责人、审批流。
5. **人工确认仍是产品硬边界。** 拥有 `opportunities.stage` 不等于可以外发、报价或技术承诺；这些动作继续只出现在界面提示，不进入可执行权限。
6. **本地演示可关认证。** 无 `DATABASE_URL` 或 `AUTH_REQUIRED=false` 时允许游客只读查看；写操作与 Agent 需登录。

## 2. 约束与非目标

### 2.1 必须遵守的既有约束

| 来源 | 约束 |
| --- | --- |
| 需求 1.2 / PRODUCT.md | 系统不自动代表企业联系外部对象 |
| 需求 3.1 | 五类角色及 MVP 权限边界 |
| 需求 4.3 | 不做多租户；不做完整 CRM |
| 需求 6 | 密钥只在后端；生产需认证、CORS、限流 |
| 需求 9 | 落地前需确认用户权限与联系人使用规范 |
| 数据库 2.3 / 7.4 | 用户/RBAC 原为二期；互动预留 `created_by` |
| 数据库 13 | 演示数据必须可筛选，禁止与生产统计混淆 |
| 前后端 11.2 | 生产化增加身份认证、RBAC、限流、安全头 |

### 2.2 本阶段不做

- 多租户 / 多组织隔离。
- 商机或关系的「负责人 / 团队分配」。
- 审批流（阶段变更无需第二人批准）。
- SSO / OIDC / 企业微信扫码（预留 `identity_provider`，首期只做本地账号）。
- 用户自助注册。
- 完整审计日志平台（只记登录与敏感写操作的轻量活动）。
- 行级数据隔离（例如销售只能看自己的客户）。人数很少，共享工作台更符合「时间碎、线索散」。

## 3. 用户模型

### 3.1 用户是什么

用户是**氢璞内部操作者**（或受邀参观的只读观察者），不是关系对象。`relationships` 继续表示客户/潜客/上游/伙伴，二者不得混表。

一个用户：

- 有唯一登录名（邮箱或工号，本阶段用邮箱）。
- 恰好绑定 **一个** 业务角色（单角色，避免小型团队里权限叠加难解释）。
- 账号可启用/停用；停用立即失效会话。
- 不存明文密码；不把密码哈希返回 API。

### 3.2 角色

| 角色码 | 中文 | 对应需求 | 工作目的 |
| --- | --- | --- | --- |
| `sales` | 市场/销售 | 需求 3.1 | 发现线索、维护客户/潜客、研判、记联系、推阶段 |
| `supply` | 采购/供应链 | 需求 3.1 | 维护上游与伙伴、记协同、补供应侧知识 |
| `sales_lead` | 销售负责人 | 需求 3.1 | 看全量结构与健康度，校准优先级；本阶段不分配团队 |
| `presales` | 产品/售前 | 需求 3.1 | 看匹配证据，维护产品边界与知识，把条目标为待复核 |
| `admin` | 系统管理员 | 需求 3.1 | 管账号与角色；模型/评分版本仍以环境变量为主 |
| `viewer` | 演示观察者 | PRODUCT.md 第二类用户 | 会议室投影只读；不能改数据、不能触发联网发现入库 |

`admin` 拥有全部业务只读能力，外加用户管理。管理员改业务数据不是默认路径：氢能工作台的写入应落在销售/供应链/售前身上。

### 3.3 生命周期

1. 管理员创建账号：邮箱、显示名、角色、初始密码（或一次性口令）。
2. 首次登录建议改密（`must_change_password`）。
3. 停用：`status=disabled`，删除该用户全部会话。
4. 不提供自助注销删除；离职由管理员停用。
5. 种子：本地可内置 `admin@qingpu.local` / `sales@qingpu.local`，且必须带「演示账号」标识，禁止把演示口令写进生产镜像。

## 4. 权限模型

### 4.1 能力码

能力码是稳定字符串，前后端共用。新增能力必须同时改矩阵、路由守卫和导航显隐。

| 能力码 | 含义 | 主要入口 |
| --- | --- | --- |
| `agent.chat` | 与企业关系 Agent 对话 | `POST /api/agent/chat` |
| `agent.briefing` | 每日行动简报 | `GET /api/agent/briefing` |
| `dashboard.read` | 总览指标 | `GET /api/dashboard` |
| `relationships.read` | 查看关系 | `GET /api/relationships` |
| `relationships.touch` | 新增互动 / 下一步 | `POST .../touchpoints` |
| `knowledge.read` | 检索知识 | `GET /api/knowledge` |
| `knowledge.write` | 补充知识 | `POST /api/knowledge` |
| `opportunities.read` | 商机列表与详情 | `GET /api/opportunities` |
| `opportunities.analyze` | 新信号研判并落库 | `POST .../analyze` |
| `opportunities.discover` | 自动发现（会写待核验商机） | `POST .../discover` |
| `opportunities.stage` | 变更阶段 | `PATCH .../stage` |
| `products.read` | 产品知识基线 | `GET /api/products` |
| `products.review` | 维护产品复核说明 / 知识边界 | 后续产品写接口；现可用 `knowledge.write` 过渡 |
| `users.read` | 查看账号列表 | `GET /api/users` |
| `users.manage` | 创建/停用/改角色 | `POST/PATCH /api/users` |
| `session.self` | 读自己、改自己的密码 | `GET /api/me`、`POST /api/me/password` |

`GET /api/health` **不要求登录**，继续给前端壳层和探针用；响应不得带用户列表或密钥。

### 4.2 角色 × 能力

| 能力 | sales | supply | sales_lead | presales | admin | viewer |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| `agent.chat` | ● | ● | ● | ● | ● | ○ |
| `agent.briefing` | ● | ● | ● | ● | ● | ○ |
| `dashboard.read` | ● | ● | ● | ● | ● | ● |
| `relationships.read` | ● | ● | ● | ● | ● | ● |
| `relationships.touch` | ● | ● | ● | ○ | ○ | ○ |
| `knowledge.read` | ● | ● | ● | ● | ● | ● |
| `knowledge.write` | ● | ● | ● | ● | ○ | ○ |
| `opportunities.read` | ● | ● | ● | ● | ● | ● |
| `opportunities.analyze` | ● | ○ | ● | ○ | ○ | ○ |
| `opportunities.discover` | ● | ○ | ● | ○ | ○ | ○ |
| `opportunities.stage` | ● | ○ | ● | ○ | ○ | ○ |
| `products.read` | ● | ● | ● | ● | ● | ● |
| `products.review` | ○ | ○ | ○ | ● | ● | ○ |
| `users.read` | ○ | ○ | ○ | ○ | ● | ○ |
| `users.manage` | ○ | ○ | ○ | ○ | ● | ○ |
| `session.self` | ● | ● | ● | ● | ● | ● |

● 允许　○ 拒绝

说明：

- **供应链**可对话、看关系和知识、记上游互动，但不能研判/发现/改商机阶段。这与「维护上游厂商、识别供应协同」一致，避免采购误把线索推进「跟进中」。
- **售前**可写知识、看匹配证据，不改商机阶段，避免技术预筛被当成商务推进。
- **销售负责人**与销售同一套写权限，本阶段多出来的是「看全量」而不是「分配」。校准优先级仍通过查看评分与阶段，不另做覆盖分。
- **观察者**只读看板、关系、商机、产品；无 Agent 对话（避免在投影场误触发模型调用与费用）；无发现入库。
- **管理员**默认不写业务对象。需要顶号操作时，应另开业务角色账号，而不是把 admin 当成万能销售。

### 4.3 导航显隐

| 导航 | 最低能力 |
| --- | --- |
| Agent 工作台 | `agent.chat` |
| 业务总览 | `dashboard.read` |
| 关系中心 | `relationships.read` |
| 知识库 | `knowledge.read` |
| 商机雷达 | `opportunities.read` |
| 信号研判 | `opportunities.analyze` |
| 产品知识 | `products.read` |
| 账号管理（新） | `users.manage` |

按钮级：

- 「记录互动」→ `relationships.touch`
- 「添加知识」→ `knowledge.write`
- 「Agent 自动发现」→ `opportunities.discover`
- 「更新阶段」→ `opportunities.stage`
- 「进入研判」对 viewer 隐藏或改为只读详情

无能力时 API 返回 403，前端不得只靠藏按钮。

### 4.4 数据范围（本阶段）

**公司共享工作台。** 已登录用户看到同一份关系/知识/商机。不按 `created_by` 过滤列表。

可选的**默认筛选**（不是硬隔离）：

- `supply` 打开关系中心时，默认 `role=supplier|partner`，仍可切换到客户/潜客。
- `viewer` 总览默认排除 `is_demo=false` 之外的策略不变；若演示账号打开，应能看到种子演示数据，并继续显著标识「演示」。

二期若要「我负责的商机」，再增加 `opportunities.owner_user_id`，且必须同步改 F09。

## 5. 认证设计

### 5.1 方案

同一浏览器、Vite 反代 `/api` 的内网工作台，采用 **HttpOnly + Secure + SameSite=Lax 的会话 Cookie**，不把 JWT 放进 `localStorage`。

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 凭证 | 邮箱 + 密码 | 人数很少，无现成 IdP |
| 会话 | 服务端 `sessions` 表 + 随机 token | 可立刻吊销；适合停用账号 |
| Cookie 名 | `qingpu_session` | 不进前端可读存储 |
| 密码 | `scrypt`（Node 内置） | 无新依赖；参数写入哈希串 |
| CSRF | SameSite=Lax + 仅同源 Cookie；写操作继续 JSON | 与现有 CORS 白名单一致 |
| 限流 | 登录接口按 IP + 邮箱 | 需求 6 生产清单 |

Authorization Bearer 作为**可选**头，便于以后脚本/评测，浏览器主路径只用 Cookie。

### 5.2 开关

| 变量 | 默认 | 行为 |
| --- | --- | --- |
| `AUTH_REQUIRED` | 未设且无 `DATABASE_URL` 时视为 `false`；生产必须 `true` | `false`：游客只读查看；写操作与 Agent 需登录 |
| `SESSION_TTL_HOURS` | `12` | 超过则 401 |
| `SESSION_IDLE_HOURS` | `4` | 空闲超时 |

判定：

```text
authEnabled = AUTH_REQUIRED === 'true'
  || (AUTH_REQUIRED !== 'false' && 已配置 DATABASE_URL && NODE_ENV === 'production')
```

本地 `pnpm dev` 默认无登录，游客只能只读查看。写操作与 Agent 需登录销售等账号。接上生产库并设 `AUTH_REQUIRED=true` 后强制登录。

### 5.3 会话与主体

中间件解析 Cookie 后写入 Hono `Variables`：

```ts
type AuthUser = {
  id: string
  email: string
  displayName: string
  role: UserRole
  permissions: Permission[]
  status: 'active' | 'disabled'
}
```

未登录且 `authEnabled`：除 `/api/health`、`POST /api/auth/login` 外一律 401。  
已登录但缺能力：403，`error.code = FORBIDDEN`。  
账号停用：401，并清 Cookie。

### 5.4 登录接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ email, password }` → Set-Cookie + `{ user }` |
| POST | `/api/auth/logout` | 删会话、清 Cookie |
| GET | `/api/me` | 当前用户与能力列表 |
| POST | `/api/me/password` | 改自己的密码 |
| GET | `/api/users` | 管理员列出账号 |
| POST | `/api/users` | 管理员创建 |
| PATCH | `/api/users/:id` | 改角色、停用、重置口令 |

登录失败统一「邮箱或密码不正确」，不暴露账号是否存在。连续失败锁定短时（如 10 次 / 15 分钟）。

## 6. 与现有业务对象的衔接

### 6.1 操作人落库

在认证开启时，写入路径补上预留字段：

| 表 | 字段 | 何时写 |
| --- | --- | --- |
| `touchpoints` | `created_by` | 新增互动（需求实体 Touchpoint「记录人」） |
| `knowledge_items` | `created_by` | 用户补充知识 |
| `opportunities` | `created_by` | 研判创建或发现入库 |
| `opportunities` | `updated_by` | 改阶段 |
| `activity_logs` | `actor_user_id` | 登录、失败登录、用户管理、阶段变更、发现 |

未开认证时这些列保持 `NULL`，与现网数据兼容。

### 6.2 Agent

Agent 仍不直接写库。Service 在调用 Agent 前检查 `agent.chat` / `opportunities.discover`。  
Prompt 可带「当前操作者角色与姓名」，**不带密码、会话 token、其他用户邮箱列表**。  
观察者无 `agent.chat`，避免投影场误耗模型和检索额度。

### 6.3 人工确认

权限只解决「谁可以点工作台里的按钮」。下列事项**不设「一键执行」权限**：

- 对外发邮件/短信/微信
- 报价与技术承诺
- 把演示数据改标为已核验企业事实（如要做，必须 `admin` + 单独能力，本阶段不做）

界面继续用锻铜色表达「需要人确认」（DESIGN.md）。

## 7. 数据库

沿用 PostgreSQL + Drizzle；表名 `snake_case`；主键 `text`（`user-<uuid>`、`session-<uuid>`）。  
**仅在认证启用或执行本迁移时创建**，不塞进 V1 的 `0000` 基线混写；新迁移 `0001_users_rbac.sql`。

### 7.1 枚举

```text
user_role     = sales | supply | sales_lead | presales | admin | viewer
user_status   = active | disabled
```

V1 采用**应用层常量** `ROLE_PERMISSIONS`，数据库只存 `users.role`。V2 把角色与矩阵落库，见 RBAC 设计文档。

### 7.2 `users`

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | `user-<uuid>` |
| `email` | `text` | UQ，大小写不敏感 | 登录名 |
| `display_name` | `text` |  | 界面称呼 |
| `role` | `user_role` |  |  |
| `status` | `user_status` | 默认 `active` |  |
| `password_hash` | `text` |  | scrypt 串 |
| `must_change_password` | `boolean` | 默认 `true` | 管理员重置后为 true |
| `is_seed` | `boolean` | 默认 `false` | 演示种子账号 |
| `last_login_at` | `timestamptz` | 可空 |  |
| `created_at` / `updated_at` | `timestamptz` |  |  |

唯一索引：`lower(email)`。

### 7.3 `sessions`

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK |  |
| `user_id` | `text` | FK → users ON DELETE CASCADE |  |
| `token_hash` | `text` | UQ | 只存 sha256(token)，Cookie 里放明文 token |
| `expires_at` | `timestamptz` |  |  |
| `last_seen_at` | `timestamptz` |  | 空闲超时 |
| `user_agent` | `text` | 可空 |  |
| `ip` | `text` | 可空 | 脱敏后可只留前缀 |
| `created_at` | `timestamptz` |  |  |

索引：`user_id`；`expires_at`（清理任务）。

### 7.4 `activity_logs`（轻量）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `text` | PK |
| `actor_user_id` | `text` | 可空（登录失败） |
| `action` | `text` | `login` `login_failed` `logout` `user.create` `user.disable` `opportunity.stage` `opportunity.discover` |
| `target_type` / `target_id` | `text` | 可空 |
| `request_id` | `text` | 与现有 `x-request-id` 对齐 |
| `created_at` | `timestamptz` |  |

不记密码、不记知识正文、不记模型密钥。

### 7.5 既有表补列

```text
touchpoints.created_by          text NULL  FK users(id) SET NULL
knowledge_items.created_by      text NULL  FK users(id) SET NULL
opportunities.created_by        text NULL  FK users(id) SET NULL
opportunities.updated_by        text NULL  FK users(id) SET NULL
```

FK 在无用户表的旧库上通过新迁移添加。内存 Store 用可选字段，contracts 改为 optional。

## 8. API 与错误码

在现有错误信封上增加：

| HTTP | `error.code` | 何时 |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | 无会话 / 会话过期 / 已停用 |
| 403 | `FORBIDDEN` | 有会话但无能力 |
| 429 | `RATE_LIMITED` | 登录刷爆 |

CORS `allowHeaders` 增加不必；Cookie 走同源。若以后跨站，再加 `Access-Control-Allow-Credentials` 并收紧 `WEB_ORIGIN`。

现有业务路由一律：`requireAuth` → `requirePermission('...')` → 原 Service。  
Service 签名可增加 `actor?: AuthUser`，无认证时 `actor` 为空。

## 9. 前端

### 9.1 信息架构增量

- `/login`：登录页。未登录访问工作台则跳到这里，并带 `from`。
- 壳层状态栏右侧：显示名 + 角色中文 + 退出。
- `/settings/users`：仅 `users.manage`。人数很少，表格即可，不做组织树。

观察者登录后：隐藏 Agent 工作台、信号研判、自动发现、写按钮；总览与商机雷达可进，满足「明亮会议室十分钟演示」。

### 9.2 前端鉴权

1. 启动时 `GET /api/me`。401 且认证开启 → `/login`。
2. `me.permissions` 驱动导航和按钮。
3. API Client 带 `credentials: 'include'`。
4. 收到 403 展示「当前角色不能执行该操作」，不伪装成系统故障。

`AUTH_REQUIRED=false` 时 `/api/me` 返回 `role: 'anonymous'`（游客），能力仅为只读查看，不能使用 Agent 或改知识库。

## 10. 安全

- 密码哈希不可逆；重置由管理员发一次性口令，不在日志打印。
- 会话 token 只存哈希。
- 登录与 `users.manage` 写 `activity_logs`。
- 响应头：`X-Content-Type-Options`、`Referrer-Policy`、`Cache-Control: no-store`（`/api/me`）。
- 不把用户表暴露给 Agent Tool。
- 演示种子账号不得用于生产；生产首次部署必须改 admin 口令。
- 自然人联系方式规则不变：公开渠道级信息；未来个人电话另表 + 合法性基础（数据库文档 13）。

## 11. 内存模式

无 PostgreSQL 时：

- 认证默认关闭。
- 若开发者强行 `AUTH_REQUIRED=true`，`MemoryStore` 提供内存 `users`/`sessions`，种子两个演示账号，进程重启会话丢失。这只为单测，不作为部署形态。

## 12. 实施切片（未开工）

| 切片 | 内容 | 验收 |
| --- | --- | --- |
| S1 契约与中间件 | 角色/能力常量、`AuthUser`、401/403、开关 | 关认证时现有 26+ 测试仍绿 |
| S2 表与 Store | 迁移 `0001`、users/sessions、created_by | 空库 migrate + 旧数据 NULL 兼容 |
| S3 登录 | login/logout/me、Cookie、限流 | 错误口令 401；停用立即失效 |
| S4 路由守卫 | 各 API 挂能力码 | 用 viewer 调 discover 得 403 |
| S5 Web | 登录页、壳层用户区、按钮显隐 | 观察者看不到发现与研判 |
| S6 管理 | 用户 CRUD | 仅 admin；不能停用最后一个 admin |

## 13. 验收口径

1. 需求 3.1 五类角色都能登录，能力与第 4.2 节矩阵一致。
2. 观察者可完成「十分钟投影看总览和一条商机详情」，不能改阶段、不能发现入库、不能对话耗模型。
3. 供应链能记上游互动、补知识，不能把商机推到「跟进中」。
4. 售前能补知识、看产品匹配，不能改商机阶段。
5. 管理员能建号、停用、改角色，不能在矩阵外获得销售写权限（除非另开 sales 账号）。
6. `AUTH_REQUIRED=false` 时游客只读；写路径测试以登录销售账号覆盖。
7. 开启认证后，互动/知识/商机写入带 `created_by`，需求实体「记录人」可追溯。
8. Agent 仍不直接写库；外发/报价/技术承诺仍无自动执行权限。
9. 不出现第二套租户 ID，不出现「我的商机」强制过滤。

## 14. 风险与待确认

| 项 | 说明 | 建议 |
| --- | --- | --- |
| 销售负责人是否要改别人阶段 | 本设计允许，因 F09 无分配 | 若公司要求「谁跟进谁改」，二期加 owner |
| 供应链能否看客户详情 | 本设计允许只读 | 若保密，再加关系 `role` 硬过滤 |
| 观察者要不要 Agent | 默认关，控费用与误操作 | 演示需要对话时临时改角色为 sales |
| 生产首次账号 | 无人值守部署会锁死 | 迁移后打印一次性 admin 口令到安全渠道 |
| 与 CRM 对接 | 需求 9 待确认 | 用户表预留 `external_id` 可选列，本阶段不加 |

## 15. 参考

- 需求文档 §3.1 用户角色、§4.3 非 MVP、§5.1 Touchpoint 记录人、§6 安全
- PRODUCT.md「市场推广人员」与「评审/领导/客户」两类使用者
- 前后端设计文档 §1 为权限预留、§11.2 生产化清单
- 数据库设计文档 §2.3 用户/RBAC、§7.4 `created_by` 预留、§13 治理
- DESIGN.md 人工确认视觉边界
