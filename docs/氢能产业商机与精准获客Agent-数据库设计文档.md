# 氢能产业商机与精准获客 Agent 数据库设计文档

> 版本：V1.1  
> 日期：2026-08-18  
> 对应需求：`氢能产业商机与精准获客Agent-需求文档.md`  
> 对应设计：`氢能产业商机与精准获客Agent-前后端设计文档.md`  
> ORM：Drizzle  
> 数据库：**PostgreSQL 16+（唯一选型，不使用 SQLite 或其他引擎）**
> 实施状态：**V1 Schema、迁移、种子和 PostgreSQL Store 已落地；未配置数据库时保留内存模式**

## 1. 设计目标

API 已支持 `PostgresStore` 持久化，也保留 `MemoryStore` + `apps/api/src/data/seed.ts` 作为无数据库时的降级。PostgreSQL 路径把内存聚合拆成可迁移的关系模型，并由 Drizzle Store 在读写边界重新组装 contracts 对象。

设计优先保证：

- 现有 Zod 契约（`packages/contracts`）不因落库而破坏，由 Repository 负责聚合读写。
- 嵌套 mock 结构拆成可查询、可审计的表，避免把整份 `Opportunity` JSON 塞进单列。
- 列表筛选、每日简报、商机去重等热路径有明确索引。
- 来源类型、模拟标识、评分版本可追溯。
- 为后续 RAG（pgvector）、阶段审计、对话记忆预留表，但不纳入首期实现范围。

本文同时记录库表、约束、索引、Drizzle 代码组织、迁移策略和当前实现，作为数据库设计与代码的一致性基线。

### 1.1 本轮评审结论

- 原设计中的 13 张 V1 表已全部落地，枚举、外键、检查约束、生成列和热路径索引均进入首条迁移。
- API 持久化端口已改为统一异步接口，`MemoryStore` 与 `PostgresStore` 返回相同的 contracts 聚合结构。
- 新增互动、知识和商机均按聚合事务写入；商机指纹由数据库唯一索引兜底，竞态冲突映射为 HTTP 409。
- `DATABASE_URL` 决定运行时 Store；未配置时仍使用内存种子，便于测试和无数据库演示。
- 迁移和种子采用显式命令，API 启动不自动执行 DDL，避免生产启动时隐式改库。

## 2. 现状与落库边界

### 2.1 改造前的内存聚合

| 聚合 | 来源 | 嵌套内容 | 写路径 |
| --- | --- | --- | --- |
| `Product` | 种子 9 条 | `certifications[]` / `scenarios[]` / `highlights[]` | 只读 |
| `Relationship` | 种子 6 条 | `tags[]`、`touchpoints[]`、`opportunityIds[]` | 新增互动、回写健康度与下一步 |
| `KnowledgeItem` | 种子 6 条 | `tags[]`、`relationshipIds[]` | 新增文本 / URL / 文件知识 |
| `Opportunity` | 种子 7 条 + 分析/发现 | `scoreBreakdown[]`、`productMatches[]`、`evidence[]`、`insight`、`tags[]` | 研判创建、发现入库、更新阶段 |

`Dashboard`、`AgentBriefing` 由现有数据现算，不落库。Agent 对话目前只保留浏览器会话，首期也不落库。

### 2.2 需要修正的反范式

1. `Relationship.opportunityIds` 与 `Opportunity.relationshipId` 双向维护，易漂移。落库后**只保留商机侧外键**，关系详情再反向查询。
2. `isDemo` 与 `sourceKind === 'demo-simulated'` 完全等价，应作为生成列或写入约束，禁止两者不一致。
3. `health` 由 `lastContactAt` / `nextActionAt` 计算后回写。落库后仍存储，便于筛选；写入互动时由 Service 重算。
4. 商机去重目前是内存扫描。落库后改为大小写不敏感唯一索引。

### 2.3 首期不落库

| 对象 | 原因 |
| --- | --- |
| Dashboard / Briefing | 聚合查询即可，避免缓存失效 |
| Agent 对话消息 | 需求明确为当前会话；后续再加 `agent_conversations` |
| 用户 / RBAC | V1 固定角色已落地；自定义角色与矩阵见 RBAC 设计文档 |
| 向量切片 | 知识检索仍用关键词；RAG 作为二期 |

## 3. 技术选型

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 数据库 | **PostgreSQL 16+，唯一引擎** | JSONB、`ENUM`、部分索引、`pg_trgm`、后续 pgvector 均依赖 Postgres；本地与生产同一方言，避免双库分叉 |
| ORM | Drizzle ORM（`dialect: 'postgresql'`） | 类型安全、SQL 接近原生、与 Zod/TS monorepo 契合；`drizzle-kit` 管迁移 |
| 驱动 | `postgres`（postgres.js） | Drizzle 官方 PostgreSQL 推荐驱动，ESM 友好 |
| 迁移 | `drizzle-kit generate` / `migrate` | SQL 迁移可审可读，不手写运行时同步 |
| 本地开发 | Docker Compose 启动 PostgreSQL；`DATABASE_URL` 注入 API | 与现有 `.env` 模式一致；不引入 SQLite / libsql |
| 明确不做 | SQLite、MySQL、MongoDB | 枚举、生成列、GIN/trigram、向量检索在这些引擎上无法与本 schema 对齐 |

环境变量新增：

```dotenv
DATABASE_URL=postgres://qingpu:qingpu@localhost:5432/qingpu_agent
```

密钥仍只由后端读取。Web 不接触数据库。

## 4. 设计原则

1. **表名、列名一律 `snake_case`**；TypeScript 侧由 Drizzle 映射回 camelCase 契约。
2. **主键沿用现有字符串 ID**（如 `rel-north-truck`、`opportunity-<uuid>`），类型 `text`。这样种子、外键和现有 API 路径无需翻译层。新建记录继续 `prefix-${crypto.randomUUID()}`。
3. **枚举用 PostgreSQL `ENUM` + Drizzle `pgEnum`**，与 `packages/contracts` 中 Zod enum 一一对应。
4. **时间一律 `timestamptz`**，API 边界再序列化为 ISO 字符串。
5. **一对多拆表**（互动、证据、评分维度、产品匹配）；**短字符串数组**（产品认证/场景/亮点、Agent 列表字段）用 `jsonb`。
6. **多对多用连接表**（知识↔关系、各实体 tags）。
7. **不在数据库做评分计算**。`score` / `grade` / 维度明细是 Domain 函数的快照，换评分版本时旧行保留 `score_version`。
8. **Agent 不直接写库**。所有写入走 Service → Repository，与现有降级策略一致。

## 5. 概念模型

```mermaid
erDiagram
  products ||--o{ opportunity_product_matches : "matched as"
  relationships ||--o{ touchpoints : "has"
  relationships ||--o{ relationship_tags : "tagged"
  relationships ||--o{ knowledge_item_relationships : "linked"
  relationships ||--o{ opportunities : "owns"
  knowledge_items ||--o{ knowledge_item_relationships : "linked"
  knowledge_items ||--o{ knowledge_tags : "tagged"
  opportunities ||--o{ opportunity_tags : "tagged"
  opportunities ||--o{ opportunity_score_dimensions : "scored"
  opportunities ||--o{ opportunity_product_matches : "matched"
  opportunities ||--o{ source_evidences : "supported by"
  opportunities ||--|| agent_insights : "judged as"

  products {
    text id PK
    text model
    text family
    text rated_power
  }
  relationships {
    text id PK
    text name
    enum role
    enum health
    timestamptz next_action_at
  }
  touchpoints {
    text id PK
    text relationship_id FK
    enum channel
    timestamptz occurred_at
  }
  knowledge_items {
    text id PK
    enum type
    enum status
    text content
  }
  opportunities {
    text id PK
    text relationship_id FK
    text company_name
    text title
    enum grade
    enum stage
    int score
  }
  opportunity_score_dimensions {
    text opportunity_id FK
    enum key
    int score
  }
  opportunity_product_matches {
    text opportunity_id FK
    text product_id FK
    int fit_score
  }
  source_evidences {
    text id PK
    text opportunity_id FK
    enum kind
  }
  agent_insights {
    text opportunity_id PK_FK
    enum mode
    text summary
  }
```

关系与知识、商机是三个长期上下文；产品是只读知识基线。商机是最“厚”的聚合，详情读取主表 + 标签、评分、产品匹配、证据和 insight 五类子表即可还原现有 `Opportunity` JSON。

## 6. 枚举

全部用 `pgEnum`，取值必须与 `packages/contracts` 保持一致。新增枚举值走迁移，禁止应用层写入未声明值。

| Drizzle enum | 取值 |
| --- | --- |
| `relationship_role` | `customer` `prospect` `supplier` `partner` |
| `relationship_health` | `healthy` `attention` `at-risk` |
| `opportunity_grade` | `A` `B` `C` `D` |
| `opportunity_stage` | `new` `verifying` `qualified` `engaging` `converted` `closed` |
| `signal_type` | `procurement` `project` `policy` `operation` `partnership` |
| `maturity` | `awareness` `planning` `approved` `tendering` `pilot` `operating` `repeat-purchase` |
| `contactability` | `unknown` `public-channel` `known-contact` `existing-relationship` |
| `source_kind` | `public` `enterprise-provided` `demo-simulated` |
| `knowledge_type` | `enterprise-document` `text` `url` `file` `interaction` |
| `knowledge_status` | `ready` `pending` `review-needed` `failed` |
| `touchpoint_channel` | `meeting` `phone` `email` `wechat` `event` `visit` `other` |
| `score_dimension_key` | `fit` `demand` `recency` `maturity` `contactability` `strategic` |
| `agent_mode` | `intelligent` `rules` `demo` |

`is_demo` 不单独建枚举，见各表生成列约定。

## 7. 表设计

下文 `PK` / `FK` / `UQ` / `IDX` 分别表示主键、外键、唯一、普通索引。未标注可空的列为 `NOT NULL`。

### 7.1 `products`（产品知识基线）

对应 `ProductSchema`。产品参数只做线索预筛，不替代正式选型。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | 如 `product-st-150v` |
| `model` | `text` | UQ | 展示与匹配用型号 |
| `family` | `text` |  | 产品家族，匹配规则依赖此字段 |
| `rated_power` | `text` |  | 额定功率或产氢量，保留原文单位 |
| `peak_power` | `text` | 可空 |  |
| `life_hours` | `integer` | 可空，`> 0` |  |
| `certifications` | `jsonb` | 默认 `[]` | `string[]`，如 `["CCS"]` |
| `scenarios` | `jsonb` | 默认 `[]` | 适用场景 |
| `highlights` | `jsonb` | 默认 `[]` | 卖点 |
| `source` | `text` |  | 资料名称 |
| `source_page` | `integer` | 可空，`> 0` | 页码 |
| `review_note` | `text` | 可空 | 人工复核说明 |
| `created_at` | `timestamptz` | 默认 `now()` |  |
| `updated_at` | `timestamptz` | 默认 `now()` |  |

索引：`family`；`scenarios` 上 GIN（`jsonb_path_ops`）供场景包含查询。

选用 JSONB 而非认证/场景子表：数组短、不独立生命周期、匹配在 Domain 层完成。

### 7.2 `relationships`（关系对象）

对应 `RelationshipSchema`，统一表达客户、潜客、上游厂商、伙伴。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | 如 `rel-north-truck` |
| `name` | `text` |  |  |
| `role` | `relationship_role` |  |  |
| `industry` | `text` |  |  |
| `region` | `text` |  |  |
| `description` | `text` | 默认 `''` |  |
| `health` | `relationship_health` |  | 写入互动后由 `relationshipHealth()` 回写 |
| `health_score` | `integer` | `0–100` | 展示用分数，规则与现 MemoryStore 一致 |
| `last_contact_at` | `timestamptz` | 可空 | 最近一次互动 `occurred_at` |
| `next_action` | `text` | 可空 |  |
| `next_action_at` | `timestamptz` | 可空 | 简报“到期跟进”依赖此列 |
| `source_kind` | `source_kind` |  |  |
| `is_demo` | `boolean` | 生成列 | `source_kind = 'demo-simulated'` |
| `created_at` | `timestamptz` | 默认 `now()` |  |
| `updated_at` | `timestamptz` | 默认 `now()` |  |

索引：

- `role`
- `health`
- `(health_score DESC)`（列表默认排序）
- `next_action_at` 部分索引 `WHERE next_action_at IS NOT NULL`（到期跟进）
- `last_contact_at`（沉默关系：`IS NULL` 或早于 45 天）

不再存储 `opportunity_ids`。查询关联商机：

```sql
SELECT * FROM opportunities WHERE relationship_id = $1 ORDER BY score DESC;
```

### 7.3 `relationship_tags`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `relationship_id` | `text` | PK, FK → `relationships.id` ON DELETE CASCADE |
| `tag` | `text` | PK |

`tag` 存原始展示文案（如 `模拟数据`、`重卡`），不做全局标签字典。知识、商机同此策略。

### 7.4 `touchpoints`（互动记录）

对应 `TouchpointSchema`。从关系对象中拆出，按时间倒序读取。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | `touchpoint-<uuid>` |
| `relationship_id` | `text` | FK CASCADE |  |
| `occurred_at` | `timestamptz` |  | 业务发生时间 |
| `channel` | `touchpoint_channel` |  |  |
| `summary` | `text` |  |  |
| `outcome` | `text` | 默认 `'待复盘'` |  |
| `next_action` | `text` | 可空 | 写入后同步到父关系 |
| `next_action_at` | `timestamptz` | 可空 | 同步到父关系 |
| `created_at` | `timestamptz` | 默认 `now()` | 记录创建时间 |

索引：`(relationship_id, occurred_at DESC)`。

写入事务：插入互动 → 更新父关系的 `last_contact_at` / `next_action` / `next_action_at` / `health` / `health_score` / `updated_at`。失败则整笔回滚。

MVP 不记录操作人；认证开启后写入 `created_by`，见用户与权限设计文档。

### 7.5 `knowledge_items`（知识条目）

对应 `KnowledgeItemSchema`。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | `knowledge-<uuid>` |
| `title` | `text` |  |  |
| `type` | `knowledge_type` |  |  |
| `content` | `text` |  | 正文；大文本由 TOAST 处理 |
| `source_url` | `text` | 可空 | URL 类型必填，应用层校验 |
| `source_path` | `text` | 可空 | 文件路径或企业资料相对路径 |
| `status` | `knowledge_status` |  | 非文本文件登记为 `pending` |
| `source_kind` | `source_kind` |  |  |
| `is_demo` | `boolean` | 生成列 | 同关系表 |
| `created_at` | `timestamptz` | 默认 `now()` |  |
| `updated_at` | `timestamptz` | 默认 `now()` |  |

索引：`status`；`(updated_at DESC)`。

检索：首期用 `pg_trgm` + `ILIKE`（中文无可靠内置分词）。在 `title`、`content` 上建 GIN trigram 索引。Repository 先按拆分后的查询词选取候选，再在应用层按“标题命中 > 标签命中 > 正文命中”排序并 `LIMIT`，与内存模式保持一致。

二期将 `content` 切成 `knowledge_chunks` 并写入 `vector`，不改本表主键。

### 7.6 `knowledge_tags`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `knowledge_item_id` | `text` | PK, FK CASCADE |
| `tag` | `text` | PK |

### 7.7 `knowledge_item_relationships`

知识与关系的多对多，替代 `relationshipIds[]`。

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `knowledge_item_id` | `text` | PK, FK CASCADE → `knowledge_items` |
| `relationship_id` | `text` | PK, FK CASCADE → `relationships` |

两端各建反向索引（PK 已覆盖左侧；另建 `relationship_id` 索引，供关系详情拉关联知识）。

### 7.8 `opportunities`（商机）

对应 `OpportunitySchema` 主字段。子文档拆到 7.9–7.12。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK | `opp-river-vessel` 或 `opportunity-<uuid>` |
| `relationship_id` | `text` | FK SET NULL，可空 | 发现线索可能尚无关系对象 |
| `company_name` | `text` |  | 去重键之一 |
| `industry` | `text` |  | 精确筛选 |
| `region` | `text` |  |  |
| `title` | `text` |  | 去重键之二 |
| `signal` | `text` |  | 信号正文 |
| `signal_type` | `signal_type` |  |  |
| `expected_scale` | `text` | 可空 |  |
| `maturity` | `maturity` |  | 评分输入快照 |
| `contactability` | `contactability` |  | 评分输入快照 |
| `stage` | `opportunity_stage` | 默认 `'new'` | 人工研判创建为 `qualified`，发现为 `verifying` |
| `score` | `integer` | `0–100` | Domain 快照 |
| `grade` | `opportunity_grade` |  |  |
| `score_version` | `text` |  | 如 `1.0.0` |
| `source_kind` | `source_kind` |  | 取自首条证据，便于列表筛选 |
| `is_demo` | `boolean` | 生成列 | 同前 |
| `created_at` | `timestamptz` | 默认 `now()` | 本周新增统计依赖 |
| `updated_at` | `timestamptz` | 默认 `now()` | 改阶段时更新 |

约束与索引：

- **去重唯一索引** `uq_opportunities_fingerprint`：`lower(btrim(company_name)), lower(btrim(title))`。对应 `hasOpportunityFingerprint`，冲突映射 HTTP 409。
- `(grade, score DESC, updated_at DESC)`：看板与默认列表。
- `stage`、`industry`、`relationship_id`。
- `created_at`：本周新增。
- 可选表达式索引：`to_tsvector('simple', company_name || ' ' || title || ' ' || signal || ' ' || region)`，关键词 `q` 走 FTS；若中文效果差，退回 trigram + `ILIKE`。

`strategic` 只存在于分析输入，进入评分维度后不再单独列。需要回溯输入时可从 `score_dimensions.reason` 或证据推断；若后续要重算评分，二期再加 `analyze_inputs` 快照表。

### 7.9 `opportunity_tags`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `opportunity_id` | `text` | PK, FK CASCADE |
| `tag` | `text` | PK |

### 7.10 `opportunity_score_dimensions`

对应 `ScoreDimensionSchema`。每条商机固定 6 行。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `opportunity_id` | `text` | PK, FK CASCADE |  |
| `key` | `score_dimension_key` | PK |  |
| `label` | `text` |  | 如「场景/产品匹配」 |
| `score` | `integer` | `>= 0` |  |
| `max_score` | `integer` | `> 0` |  |
| `reason` | `text` |  | 可解释原因 |

检查：`score <= max_score`。读取时按固定顺序 `fit, demand, recency, maturity, contactability, strategic` 组装数组。

### 7.11 `opportunity_product_matches`

对应 `ProductMatchSchema`。保存研判当时的 Top 3 快照。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK |  |
| `opportunity_id` | `text` | FK CASCADE |  |
| `product_id` | `text` | FK RESTRICT | 产品删除前需确认无引用 |
| `product_model` | `text` |  | 型号快照，避免改名后历史对不上 |
| `fit_score` | `integer` | `0–100` |  |
| `matched_on` | `jsonb` | 默认 `[]` | `string[]` |
| `gaps` | `jsonb` | 默认 `[]` | `string[]` |
| `rationale` | `text` |  |  |
| `rank` | `smallint` | `1–3` | 展示顺序 |

唯一：`(opportunity_id, product_id)`；`(opportunity_id, rank)`。

`matched_on` / `gaps` 用 JSONB：变长短句，不单独查询。

### 7.12 `source_evidences`

对应 `SourceEvidenceSchema`。一条商机可有多条证据；列表页取 `occurred_at` 最新或 `captured_at` 最早一条作为 `sourceType` / `occurredAt`。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `text` | PK |  |
| `opportunity_id` | `text` | FK CASCADE |  |
| `kind` | `source_kind` |  | 契约字段名 `kind` |
| `title` | `text` |  |  |
| `url` | `text` | 可空 | 应用层 URL 校验 |
| `source_path` | `text` | 可空 |  |
| `occurred_at` | `timestamptz` | 可空 | 信号发生时间 |
| `captured_at` | `timestamptz` |  | 入库时间 |
| `excerpt` | `text` |  | 摘录 |
| `confidence` | `numeric(3,2)` | `0–1` | 模拟默认 0.55，公开/企业 0.75 |

索引：`(opportunity_id, captured_at)`。

### 7.13 `agent_insights`

对应 `AgentInsightSchema`。与商机 **1:1**。

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `opportunity_id` | `text` | PK, FK CASCADE |  |
| `mode` | `agent_mode` |  |  |
| `summary` | `text` |  |  |
| `opportunity_type` | `text` |  | 通常等于 `signal_type` |
| `talking_points` | `jsonb` | 默认 `[]` | `string[]` |
| `risks` | `jsonb` | 默认 `[]` |  |
| `recommended_actions` | `jsonb` | 默认 `[]` |  |
| `questions_to_verify` | `jsonb` | 默认 `[]` |  |
| `model` | `text` | 可空 | 如 `openai/gpt-4o-mini` |
| `fallback_reason` | `text` | 可空 | 降级原因，禁止含密钥 |
| `generated_at` | `timestamptz` |  |  |

列表接口若不展示 insight，可用 `leftJoin` 省略；详情必须带上。重新研判时 `UPDATE` 本行，不保留历史（二期可改版本表）。

## 8. 生成列、检查与外键策略

```sql
-- 首条迁移中的等价 SQL，由 drizzle-kit 生成
is_demo boolean GENERATED ALWAYS AS (source_kind = 'demo-simulated') STORED
```

适用于 `relationships`、`knowledge_items`、`opportunities`。应用层不要再手写 `isDemo`。

外键：

| 子表 | 父表 | ON DELETE |
| --- | --- | --- |
| `touchpoints` / `relationship_tags` | `relationships` | CASCADE |
| `knowledge_*` 连接表 | 知识或关系 | CASCADE |
| `opportunities.relationship_id` | `relationships` | **SET NULL**（商机可脱离关系独立存在） |
| 商机子表（标签/维度/匹配/证据/insight） | `opportunities` | CASCADE |
| `opportunity_product_matches.product_id` | `products` | **RESTRICT** |

## 9. 查询与 Repository 映射

Drizzle 实现应继续满足现有接口，返回结构与 Zod 聚合一致（嵌套 `touchpoints`、`tags`、`scoreBreakdown` 等）。推荐 `apps/api/src/db` 内用 `query.xxx.findMany({ with: ... })` 组装，Service 层不感知表拆分。

| `BusinessStore` 方法 | 当前 PostgreSQL / Drizzle 路径 |
| --- | --- |
| `listProducts` | `products` 全表，按 `model` |
| `listRelationships(role)` | `relationships` + tags；`role` 等值；`orderBy health_score DESC`；详情或列表再 `with: { touchpoints }` |
| `addTouchpoint` | 事务：insert touchpoint + update relationship |
| `listKnowledge(q, status)` | `status` 过滤；`q` 走 trigram；`orderBy updated_at DESC` |
| `searchKnowledge` | 查询词拆分后用 trigram/`ILIKE` 选候选；Store 按 6/3/1 权重排序并 `LIMIT` |
| `createKnowledge` | insert item + tags + relationship links |
| `listOpportunities(filters)` | 动态 `where`：`industry`/`grade`/`stage`；`q` ILIKE/FTS；`orderBy score DESC, updated_at DESC` |
| `hasOpportunityFingerprint` | 查唯一索引，或 insert 捕获 `23505` |
| `createOpportunity` | 事务：主表 + 6 维分数 + matches + evidence + insight + tags |
| `updateOpportunityStage` | `update stage, updated_at` |
| Dashboard | 当前由 Store 读取 contracts 聚合后在 Service 汇总；数据量增长后可下推 `count` / `avg` / `groupBy` |
| Briefing | 当前由 Store 读取后在 Service 计算到期、45 天沉默与 A 级商机；数据量增长后下推时间过滤 |

性能目标：普通列表 P95 低于 300ms。结构化列表筛选和文本候选已有索引；Dashboard/Briefing 当前适合 MVP 数据量，规模增长时应按上表把聚合下推数据库后再做压测，不预设已经达到目标。

## 10. Drizzle 工程实现

当前目录（全部位于 API 包，不新增 workspace 包）：

```text
apps/api/
  drizzle.config.ts
  drizzle/
    0000_known_lilith.sql  # V1 首条迁移，包含 pg_trgm
  src/db/
    client.ts          # drizzle(postgres(DATABASE_URL)) 与连接池参数
    migrate.ts         # 显式执行迁移
    seed.ts            # 幂等拆分现有领域种子
    schema/
      enums.ts
      products.ts
      relationships.ts
      knowledge.ts
      opportunities.ts
      relations.ts
      index.ts
  src/store/
    store.ts           # BusinessStore 异步持久化端口
    memory-store.ts    # 无 DATABASE_URL 的内存实现
    postgres-store.ts  # 聚合读取与事务写入
    create-store.ts    # 按环境选择 Store
```

已实现约定：

1. 每个聚合一个 schema 文件，`enums.ts` 共享。
2. `relations()` 声明：relationship → touchpoints/tags；opportunity → dimensions/matches/evidences/insight/tags；knowledge → tags/relationships。
3. `$inferSelect` / `$inferInsert` 只给 Repository 用；对外仍导出 contracts 类型。
4. `updated_at` 由 Store 的写路径显式更新；种子保留原始相对时间，不依赖数据库触发器。
5. JSONB 列在 schema 中标 `.$type<string[]>()`，与 Zod `z.array(z.string())` 对齐。
6. 首条迁移由 Drizzle Kit 生成并纳入版本控制；`src/db/seed.ts` 复用 `apps/api/src/data/seed.ts`，按聚合拆表且可重复执行。
7. 现有 Vitest API 测试使用 `MemoryStore`；PostgreSQL 验证依次执行迁移、种子和 Store/API 契约检查，Domain 单测不碰库。
8. `MemoryStore` 作为无 `DATABASE_URL` 时的降级；配置后生产路径走 Drizzle。健康检查返回 `storage: 'postgres' | 'memory'`。

命令：

```bash
docker compose up -d postgres
pnpm --filter @qingpu/api db:generate
pnpm --filter @qingpu/api db:migrate
pnpm --filter @qingpu/api db:seed
```

`drizzle.config.ts` 要点：`dialect: 'postgresql'`，`schema: './src/db/schema/index.ts'`，`out: './drizzle'`。

## 11. 种子数据映射

现有 `createSeedData()` 可逐表插入，注意顺序：`products` → `relationships` → `relationship_tags` / `touchpoints` → `knowledge_items` 及连接表 → `opportunities` 及子表。

| 种子 ID | 落库要点 |
| --- | --- |
| 9 个产品 | `certifications`/`scenarios`/`highlights` 原样进 JSONB |
| 6 个关系 | `opportunityIds` **丢弃**，由商机外键反查 |
| 6 条知识 | `relationshipIds` 写入 `knowledge_item_relationships` |
| 7 条商机 | `scoreBreakdown` 拆 6 行；`productMatches` 拆最多 3 行；`evidence[0]` 一行；`insight` 一行 |
| 相对时间 | 种子里的 `daysAgo` / `daysFromNow` 在 seed 脚本执行时计算，行为与内存版一致 |

模拟对象继续带 `source_kind = demo-simulated`，由生成列得到 `is_demo = true`。企业资料知识为 `enterprise-provided`。

## 12. 事务与一致性

必须放在同一事务中的操作：

1. 新增互动并回写关系健康度、下一步行动。
2. 研判/发现创建商机：主表 + 维度 + 匹配 + 证据 + insight + 标签。
3. 创建知识：主表 + 标签 + 关系连接。

阶段更新是单表 `UPDATE`，首期不做历史表。唯一索引冲突转为业务错误 `DUPLICATE_OPPORTUNITY`，不要变成 500。

并发：分析接口以唯一索引为最终去重，避免“先查后写”竞态。

## 13. 安全与治理

- 数据库角色最小权限：应用账号 DML；迁移账号 DDL。
- 不存模型密钥；`agent_insights.model` 只存模型名。
- `source_evidences.url` / `knowledge_items.content` 视为不可信外部文本，仅作事实材料。
- `is_demo` 必须可筛选，防止演示数据混入生产统计；后续若有真实客户数据，看板默认 `WHERE is_demo = false`。
- 备份：每日逻辑备份 + WAL；知识正文可能变大，注意 TOAST 与备份窗口。
- 二期若引入自然人联系方式，另表存储并加合法性基础、核验时间、删除机制；**不要**把个人电话塞进 `touchpoints.summary` 而不建模。

## 14. 演进预留（不建于 V1 迁移）

这些表写入本文作为扩展接口，首期迁移**不要创建**，以免空表干扰。

### 14.1 知识切片与 RAG

```text
knowledge_chunks
  id, knowledge_item_id FK,
  chunk_index, content, token_count,
  embedding vector(1536),   -- pgvector
  created_at
```

HNSW 索引 + 结构化过滤（`status`、`source_kind`、关联 `relationship_id`）做混合检索。与设计文档“PostgreSQL + pgvector / `@mastra/pg`”对齐。

### 14.2 对话记忆

```text
agent_conversations (id, relationship_id?, opportunity_id?, created_at)
agent_messages (id, conversation_id, role, content, mode, model, citations jsonb, created_at)
```

仅在需要跨会话记忆时启用。

### 14.3 阶段审计

```text
opportunity_stage_history (id, opportunity_id, from_stage, to_stage, changed_at)
```

对应需求“关键阶段变更保留更新时间”的完整版。

### 14.4 评分输入快照

若评分规则升级后要重放，再增加 `opportunity_analyze_inputs`（`strategic`、原始 `occurred_at` 等）。V1 可从证据与维度理由部分还原，不强制。

## 15. 从内存到 Postgres 的切换步骤

Schema、迁移、种子、`PostgresStore` 和运行时 Store 选择已经完成。环境切换只需：

1. 启动 PostgreSQL 16+，在根目录 `.env` 配置 `DATABASE_URL`。
2. 执行 `db:migrate`，再执行 `db:seed`；两者均不在 API 启动时隐式运行。
3. 启动 API，检查 `/api/health` 的 `storage` 是否为 `postgres`。
4. 部署时使用独立迁移账号执行 DDL，应用账号仅保留 DML 权限。
5. 回退时移除 `DATABASE_URL` 可临时进入内存模式，但新增数据不会与 PostgreSQL 自动双向同步。

## 16. 风险与待确认

| 项 | 说明 | 建议 |
| --- | --- | --- |
| 中文全文检索 | 原生 `tsvector` 对中文弱 | V1 用 `pg_trgm`；RAG 上线后以向量为主 |
| 字符串主键 | 不如 UUID 紧凑 | 换 ID 会破坏种子与书签；维持 text |
| `health` 双写 | 存储值可能与公式漂移 | 写入路径唯一；可加定期校验任务 |
| JSONB 数组 | 不便按元素做强约束 | 仅用于短列表；标签已拆连接表 |
| 双 Store | 内存与库行为可能分叉 | 契约测试绑定同一套 API 测试 |
| 评分重算 | 旧商机保留旧 `score_version` | 换规则时不要 UPDATE 历史维度 |

## 17. 验收口径（设计与实现）

当前实现应持续满足：

1. 现有 `/api` 契约不变，前端无感知。
2. 种子数据条数与关联关系与当前 mock 一致（6 关系、9 产品、6 知识、7 商机及嵌套子项）。
3. 重启 API 后用户新增的互动、知识、商机仍在。
4. 同一 `company_name + title`（忽略大小写与首尾空格）第二次研判返回 409。
5. 每日简报仍能识别到期跟进、45 天沉默和高潜商机。
6. 所有 `demo-simulated` 行 `is_demo = true`，且不能被应用层改成不一致。
7. Schema 由 Drizzle 管理，迁移可在空库从头应用。

## 18. 实施验证记录

2026-08-18 本轮评审与实现已完成以下验证：

- `drizzle-kit generate` 识别 13 张 V1 表，再次生成显示无 Schema 漂移。
- 在空白 PostgreSQL 数据库从头应用 `0000_known_lilith.sql` 成功。
- `db:seed` 连续执行两次，计数均为 9 产品、6 关系、6 知识、7 商机。
- 配置 `DATABASE_URL` 后运行现有 17 项 Hono API 测试全部通过，覆盖列表/详情聚合、知识写入与检索、互动事务、商机创建、阶段更新、409 去重和 Zod contracts 校验。
- 无 `DATABASE_URL` 的全仓 `pnpm check` 通过，验证内存降级、类型检查、20 项测试和生产构建。

## 19. 参考

- 本仓库：`packages/contracts/src/index.ts`、`apps/api/src/store/memory-store.ts`、`apps/api/src/data/seed.ts`
- [Drizzle ORM PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle Kit 迁移](https://orm.drizzle.team/docs/kit-overview)
- [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
- 前后端设计文档第 5.2 节：Drizzle + PostgreSQL 与内存模式实现同一异步 Repository 接口
