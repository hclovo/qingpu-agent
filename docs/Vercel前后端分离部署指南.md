# Vercel 前后端分离部署指南

本文说明如何把本仓库部署为两个独立的 Vercel 项目：

- Web：React + Vite 静态站点，目录为 `apps/web`
- API：Hono + Node.js Vercel Function，目录为 `apps/api`

生产调用链如下：

```text
浏览器
  → https://<web-domain>
  → https://<api-domain>/api/*
  → PostgreSQL / 模型服务 / Tavily
```

## 1. 部署前检查

仓库必须包含以下文件：

- 根目录 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/contracts/package.json`
- `packages/domain/package.json`
- `apps/web/vercel.json`

建议在提交部署前从仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm check
```

项目要求 Node.js 22.13 或更高版本。Vercel 项目的 Node.js Version 应选择 `22.x`。

## 2. 准备生产资源

### 2.1 域名规划

先确定两个不会随单次部署改变的生产地址，例如：

```text
Web: https://qingpu-web.vercel.app
API: https://qingpu-api.vercel.app
```

也可以使用自定义域名：

```text
Web: https://agent.example.com
API: https://api.agent.example.com
```

后续环境变量应使用生产域名或固定别名，不要使用某一次部署生成的临时 URL。

### 2.2 PostgreSQL

生产环境强烈建议配置 PostgreSQL。Vercel Function 使用内存存储时，实例重启、扩缩容或切换实例都会丢失数据，且不同实例之间数据不共享。

数据库连接建议：

- 使用数据库服务商提供的 pooled connection URL。
- 必须启用 TLS 时，按照服务商说明保留 URL 中的 TLS 参数。
- Vercel 环境建议将 `DATABASE_POOL_SIZE` 设为 `1` 或 `2`，防止多个 Function 实例耗尽连接数。
- 不要把真实连接串提交到 Git。

## 3. 创建 API 项目

在 Vercel 中导入同一个 Git 仓库并创建 API 项目。

### 3.1 Build and Deployment

按以下值设置：

| 设置 | 值 |
| --- | --- |
| Project Name | 自定义，例如 `qingpu-api` |
| Root Directory | `apps/api` |
| Framework Preset | `Hono` |
| Node.js Version | `22.x` |
| Install Command | 保持默认 |
| Build Command | `pnpm build` |
| Output Directory | 保持默认 |

在 Root Directory 设置中开启：

> Include source files outside of the Root Directory in the Build Step

这是必要设置。API 依赖根目录下的 `packages/contracts` 和 `packages/domain`。关闭后，Function 运行时可能报错：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@qingpu/contracts'
```

### 3.2 API 环境变量

在 API 项目的 Settings → Environment Variables 中配置：

```dotenv
WEB_ORIGIN=https://qingpu-web.vercel.app
DATABASE_URL=postgresql://...
DATABASE_POOL_SIZE=1
```

`WEB_ORIGIN` 必须是 Web 项目的完整 Origin，只能包含协议、域名和可选端口。推荐不要添加末尾 `/`，不能包含 `/dashboard` 等路径。

如需允许其他固定的 Web 地址访问 API，可增加：

```dotenv
WEB_ORIGINS=https://preview-web.example.com,https://staging-web.example.com
```

多个地址用英文逗号分隔。不要配置 `*`，也不要配置宽泛的 `*.vercel.app`。

### 3.3 模型和搜索变量

不配置模型密钥时，API 会以规则模式运行；不配置 Tavily 时，商机发现会降级为演示模式。

使用官方 OpenAI：

```dotenv
MASTRA_MODEL=openai/gpt-4o-mini
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=
TAVILY_API_KEY=tvly-...
```

使用 OpenAI 兼容服务：

```dotenv
MASTRA_MODEL=openai/<服务支持的模型名>
OPENAI_API_KEY=<服务密钥>
OPENAI_BASE_URL=https://gateway.example.com/v1
TAVILY_API_KEY=tvly-...
```

可选超时设置：

```dotenv
AGENT_TIMEOUT_MS=45000
DISCOVER_TIMEOUT_MS=90000
```

所有密钥只能配置在 API 项目中，禁止使用 `VITE_` 前缀。

### 3.4 环境作用范围

生产值至少勾选 Production。若需要 Preview 部署：

- 数据库建议使用独立的预览数据库。
- `WEB_ORIGIN` 必须对应固定的预览 Web 域名。
- Vercel 每次生成的动态 Preview URL 无法安全地用精确白名单全部覆盖，建议为预览分支绑定固定别名，再加入 `WEB_ORIGINS`。

## 4. 初始化生产数据库

API 启动时不会自动修改数据库结构，因此首次上线前必须显式执行迁移。

推荐在可信的本地环境或 CI 中完成。可以把生产 `DATABASE_URL` 临时放入仓库根目录的 `.env`；该文件已被 `.gitignore` 忽略，但仍需确认不会提交或泄露。

从仓库根目录执行：

```bash
pnpm --filter @qingpu/api db:migrate
```

如需写入演示产品、关系、知识和商机数据，再执行：

```bash
pnpm --filter @qingpu/api db:seed
```

`db:seed` 是可重复执行的幂等命令，但生产环境是否写入演示数据应由业务负责人确认。

迁移完成后，移除本地 `.env` 中不再需要的生产密钥。不要把迁移加入每次 Vercel Build Command，以免并发构建同时修改数据库。

## 5. 部署 API 并验证

部署 API 后访问：

```bash
curl --silent --show-error https://qingpu-api.vercel.app/api/health
```

预期返回 HTTP 200，响应类似：

```json
{
  "status": "ok",
  "storage": "postgres",
  "agentMode": "rules",
  "version": "0.1.0",
  "requestId": "..."
}
```

检查要点：

- `storage` 应为 `postgres`；如果为 `memory`，说明 `DATABASE_URL` 未生效。
- `agentMode` 是否为智能模式取决于模型密钥；规则模式本身不是部署失败。
- 保存 API 的稳定生产地址，下一步配置 Web 项目。

## 6. 创建 Web 项目

再次导入同一个 Git 仓库，创建独立的 Web 项目。

### 6.1 Build and Deployment

按以下值设置：

| 设置 | 值 |
| --- | --- |
| Project Name | 自定义，例如 `qingpu-web` |
| Root Directory | `apps/web` |
| Framework Preset | `Vite` |
| Node.js Version | `22.x` |
| Install Command | 保持默认 |
| Build Command | `pnpm build` |
| Output Directory | `dist`，通常由 Vite 自动识别 |

仓库中的 `apps/web/vercel.json` 已配置 SPA 路由回退。直接刷新 `/dashboard`、`/opportunities/:id` 等前端路由时，会返回 `index.html`，而不是 Vercel 404。

### 6.2 Web 环境变量

在 Web 项目中配置：

```dotenv
VITE_API_BASE_URL=https://qingpu-api.vercel.app
```

该值可以带或不带 `/api`，以下两种写法等价：

```dotenv
VITE_API_BASE_URL=https://qingpu-api.vercel.app
VITE_API_BASE_URL=https://qingpu-api.vercel.app/api
```

`VITE_API_BASE_URL` 是构建时变量。每次修改后必须重新部署 Web 项目，单纯修改变量不会改变已生成的静态 JavaScript。

Vite 会把所有 `VITE_*` 变量写入浏览器可读取的构建产物，因此这里不能放数据库密码、模型密钥或其他秘密。

## 7. 部署 Web 并完成联调

Web 部署完成后，在浏览器打开生产地址并检查：

1. 页面可以正常加载。
2. `/dashboard` 等页面直接刷新不会返回 404。
3. 浏览器开发者工具的 Network 中，请求目标为 API 项目的域名，而不是 Web 项目的 `/api`。
4. `GET /api/health` 返回 200。
5. 控制台没有 CORS 错误。

可以用以下命令单独检查预检请求：

```bash
curl --include --request OPTIONS \
  'https://qingpu-api.vercel.app/api/health' \
  --header 'Origin: https://qingpu-web.vercel.app' \
  --header 'Access-Control-Request-Method: GET' \
  --header 'Access-Control-Request-Headers: Content-Type,X-Request-Id'
```

预期结果：

- HTTP 状态为 `204`
- `Access-Control-Allow-Origin` 等于 Web Origin
- `Access-Control-Allow-Methods` 包含 `GET`
- `Access-Control-Allow-Headers` 包含 `Content-Type` 和 `X-Request-Id`

如果请求来源不在白名单内，API 仍可能返回 204，但不会返回 `Access-Control-Allow-Origin`，浏览器会阻止正式跨域请求。

## 8. 环境变量清单

### 8.1 Web 项目

| 变量 | 生产要求 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 必需 | API 稳定公开地址，可带或不带 `/api` |

### 8.2 API 项目

| 变量 | 生产要求 | 说明 |
| --- | --- | --- |
| `WEB_ORIGIN` | 必需 | Web 生产 Origin，CORS 主白名单 |
| `WEB_ORIGINS` | 可选 | 额外固定 Web Origin，逗号分隔 |
| `PORT` | Vercel 不需要 | 仅用于本地 Node 服务，Vercel Function 不读取自定义监听端口 |
| `DATABASE_URL` | 强烈建议 | PostgreSQL 连接串；缺失时使用非持久内存存储 |
| `DATABASE_POOL_SIZE` | 建议 | Vercel 建议为 `1` 或 `2` |
| `MASTRA_MODEL` | 可选 | `provider/model-name` 格式 |
| `OPENAI_API_KEY` | 按模型需要 | OpenAI 或兼容服务密钥 |
| `OPENAI_BASE_URL` | 可选 | OpenAI 兼容服务完整 API 基地址 |
| `TAVILY_API_KEY` | 可选 | 实时商机搜索；缺失时降级为演示模式 |
| `ANTHROPIC_API_KEY` | 按模型需要 | Anthropic 密钥 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 按模型需要 | Google 模型密钥 |
| `GROQ_API_KEY`、`MISTRAL_API_KEY` | 按模型需要 | 使用对应模型提供方时配置 |
| `AGENT_TIMEOUT_MS` | 可选 | Agent 调用超时，默认 45000 毫秒 |
| `DISCOVER_TIMEOUT_MS` | 可选 | 商机发现超时，默认 90000 毫秒 |

## 9. 更新与重新部署规则

| 变更 | 需要重新部署的项目 |
| --- | --- |
| `apps/web/**` | Web |
| `apps/api/**` | API |
| `packages/contracts/**` | API；若 Web 以后直接依赖该包，也需部署 Web |
| `packages/domain/**` | API |
| `VITE_API_BASE_URL` | Web |
| `WEB_ORIGIN`、`WEB_ORIGINS` | API |
| 数据库、模型或搜索环境变量 | API |
| 数据库 Schema | 先执行迁移，再部署 API |

修改 Root Directory、workspace 文件追踪或依赖安装设置后，建议选择不复用 Build Cache 的 Redeploy。

## 10. 常见故障

### 10.1 `Cannot find package '@qingpu/contracts'`

检查：

1. API Root Directory 是否为 `apps/api`。
2. 是否开启 Include source files outside of the Root Directory。
3. Build Command 是否为 `pnpm build`。
4. 是否从仓库根目录保留了 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml`。
5. 清除 Build Cache 后重新部署。

### 10.2 浏览器报告 CORS 错误

检查：

1. API 项目的 `WEB_ORIGIN` 是否与浏览器地址栏中的 Origin 完全一致。
2. 值是否只包含协议和域名，没有路径。
3. 环境变量是否配置在正确的 Production 或 Preview 环境。
4. 修改变量后是否重新部署 API。
5. 使用本文的 `curl OPTIONS` 命令检查响应头。

不要用 `*` 临时绕过生产 CORS 问题。

### 10.3 前端仍然请求自己的 `/api`

说明构建时没有读到 `VITE_API_BASE_URL`。检查：

1. 变量是否配置在 Web 项目，而不是 API 项目。
2. 变量名是否完全为 `VITE_API_BASE_URL`。
3. 修改变量后是否重新部署 Web。
4. Web 是否使用了最新部署。

### 10.4 健康检查显示 `storage: memory`

API 没有读到 `DATABASE_URL`。检查变量作用范围和生产部署是否已重新构建。生产环境不要依赖内存存储。

### 10.5 数据库提示表不存在

对目标生产数据库执行：

```bash
pnpm --filter @qingpu/api db:migrate
```

确认迁移使用的 `DATABASE_URL` 与 Vercel API 项目中的生产连接串一致。

### 10.6 前端子页面刷新为 404

确认 Web 项目 Root Directory 是 `apps/web`，并且部署中包含 `apps/web/vercel.json`。重新部署 Web。

### 10.7 Agent 一直是规则模式

这通常表示没有配置与 `MASTRA_MODEL` 提供方匹配的密钥。检查 API 项目环境变量；这不影响基础 API 和规则引擎运行。

### 10.8 数据库连接数过多

使用数据库服务商的 pooled connection URL，并把 `DATABASE_POOL_SIZE` 调低到 `1` 或 `2`。同时查看数据库侧最大连接数和 Vercel Function 并发量。

## 11. 上线验收清单

- [ ] API 与 Web 是两个独立 Vercel 项目
- [ ] 两个项目都使用 Node.js 22.x
- [ ] API Root Directory 为 `apps/api`
- [ ] API 已开启 Root Directory 外源码访问
- [ ] Web Root Directory 为 `apps/web`
- [ ] `VITE_API_BASE_URL` 指向稳定 API 地址
- [ ] `WEB_ORIGIN` 与稳定 Web Origin 完全一致
- [ ] 生产 API 已配置 PostgreSQL
- [ ] 数据库迁移已执行
- [ ] `/api/health` 返回 200 且 `storage` 为 `postgres`
- [ ] CORS 预检返回正确白名单 Origin
- [ ] Web 的 API 请求发送到后端项目
- [ ] 前端子路由直接刷新正常
- [ ] 模型和 Tavily 密钥仅存在于 API 项目
- [ ] 生产部署未使用动态预览 URL 作为永久配置
