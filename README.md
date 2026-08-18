# 氢能产业商机与精准获客 Agent

这是一个 TypeScript 前后端分离的 pnpm monorepo。系统以北京氢璞创能的公开企业资料和脱敏样例为知识基线，核心是增强企业自动化能力的关系与商机 Agent：帮助用户维护客户、潜客、上游厂商和生态伙伴，补充企业知识，生成每日联系建议，并完成商机发现、评分、产品匹配和证据研判。

## 快速开始

```bash
cp .env.example .env
pnpm install
pnpm dev
```

- Web：<http://localhost:5173>
- API：<http://localhost:4111>
- 健康检查：<http://localhost:4111/api/health>

不配置模型密钥时，系统使用可解释的本地规则引擎和演示信号，Agent 对话、关系提醒、知识补充和商机页面仍可运行。配置 `OPENAI_API_KEY` 等模型提供方密钥后，会启用 Mastra Agent 的工具调用、结构化研判和联网商机发现能力。

### PostgreSQL 持久化

`DATABASE_URL` 留空时 API 使用内存数据；配置后自动切换到 PostgreSQL/Drizzle 仓储。首次使用时先在 `.env` 中设置 `DATABASE_URL=postgres://qingpu:qingpu@localhost:5432/qingpu_agent`，再执行：

```bash
docker compose up -d postgres
pnpm --filter @qingpu/api db:migrate
pnpm --filter @qingpu/api db:seed
pnpm dev
```

迁移与种子是显式命令，API 启动时不会自动修改数据库结构。健康检查响应中的 `storage` 为 `postgres` 或 `memory`。

### OpenAI 与兼容服务

在仓库根目录 `.env` 中配置，密钥只由后端读取，不要放到 Web 环境变量或提交到 Git：

```dotenv
# 官方 OpenAI：OPENAI_BASE_URL 留空即可
MASTRA_MODEL=openai/gpt-4o-mini
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=

# OpenAI 兼容服务示例
# MASTRA_MODEL=openai/服务支持的模型名
# OPENAI_API_KEY=服务提供的密钥
# OPENAI_BASE_URL=https://gateway.example.com/v1
```

`OPENAI_BASE_URL` 会作为 Mastra 的 OpenAI-compatible `url` 传入，不会被返回给前端。地址应包含兼容服务要求的完整版本路径；末尾 `/` 会自动移除。

## 常用命令

```bash
pnpm dev          # 同时启动 API 和 Web
pnpm typecheck    # 全仓类型检查
pnpm test         # 单元测试与 API 测试
pnpm build        # 生产构建
pnpm check        # 完整校验
pnpm --filter @qingpu/api db:generate # 根据 Schema 生成迁移
pnpm --filter @qingpu/api db:migrate  # 应用 PostgreSQL 迁移
pnpm --filter @qingpu/api db:seed     # 幂等写入演示种子
```

## 仓库结构

```text
apps/api           Hono API、Mastra Agents/Tools、关系/知识/商机服务
apps/web           React + Vite Agent 工作台
packages/contracts 前后端共享的 Zod 契约
packages/domain    确定性评分与产品匹配规则
docs               需求与前后端设计文档
T04_...            企业原始资料，保持只读
```

详细范围、验收口径和架构决策参见 [需求文档](./docs/氢能产业商机与精准获客Agent-需求文档.md)、[前后端设计文档](./docs/氢能产业商机与精准获客Agent-前后端设计文档.md) 与 [数据库设计文档](./docs/氢能产业商机与精准获客Agent-数据库设计文档.md)。
