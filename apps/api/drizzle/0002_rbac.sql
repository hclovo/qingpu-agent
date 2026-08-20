CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" text,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_roles_code" ON "roles" USING btree ("code");--> statement-breakpoint
INSERT INTO "roles" ("id", "code", "name", "description", "is_system", "sort_order") VALUES
	('role-sales', 'sales', '市场/销售', '发现线索、维护客户、研判与跟进', true, 10),
	('role-supply', 'supply', '采购/供应链', '维护上游与伙伴，补供应侧知识', true, 20),
	('role-sales-lead', 'sales_lead', '销售负责人', '看全量结构并校准跟进优先级', true, 30),
	('role-presales', 'presales', '产品/售前', '维护产品边界与知识，复核匹配', true, 40),
	('role-admin', 'admin', '系统管理员', '管理账号与角色，默认不写业务对象', true, 50),
	('role-viewer', 'viewer', '演示观察者', '会议室只读，不能改数据或触发发现', true, 60)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission") VALUES
	('role-sales', 'agent.chat'), ('role-sales', 'agent.briefing'), ('role-sales', 'dashboard.read'),
	('role-sales', 'relationships.read'), ('role-sales', 'relationships.touch'),
	('role-sales', 'knowledge.read'), ('role-sales', 'knowledge.write'),
	('role-sales', 'opportunities.read'), ('role-sales', 'opportunities.analyze'),
	('role-sales', 'opportunities.discover'), ('role-sales', 'opportunities.stage'),
	('role-sales', 'products.read'),
	('role-supply', 'agent.chat'), ('role-supply', 'agent.briefing'), ('role-supply', 'dashboard.read'),
	('role-supply', 'relationships.read'), ('role-supply', 'relationships.touch'),
	('role-supply', 'knowledge.read'), ('role-supply', 'knowledge.write'),
	('role-supply', 'opportunities.read'), ('role-supply', 'products.read'),
	('role-sales-lead', 'agent.chat'), ('role-sales-lead', 'agent.briefing'), ('role-sales-lead', 'dashboard.read'),
	('role-sales-lead', 'relationships.read'), ('role-sales-lead', 'relationships.touch'),
	('role-sales-lead', 'knowledge.read'), ('role-sales-lead', 'knowledge.write'),
	('role-sales-lead', 'opportunities.read'), ('role-sales-lead', 'opportunities.analyze'),
	('role-sales-lead', 'opportunities.discover'), ('role-sales-lead', 'opportunities.stage'),
	('role-sales-lead', 'products.read'),
	('role-presales', 'agent.chat'), ('role-presales', 'agent.briefing'), ('role-presales', 'dashboard.read'),
	('role-presales', 'relationships.read'),
	('role-presales', 'knowledge.read'), ('role-presales', 'knowledge.write'),
	('role-presales', 'opportunities.read'), ('role-presales', 'products.read'), ('role-presales', 'products.review'),
	('role-admin', 'agent.chat'), ('role-admin', 'agent.briefing'), ('role-admin', 'dashboard.read'),
	('role-admin', 'relationships.read'), ('role-admin', 'knowledge.read'),
	('role-admin', 'opportunities.read'), ('role-admin', 'products.read'), ('role-admin', 'products.review'),
	('role-admin', 'users.read'), ('role-admin', 'users.manage'),
	('role-admin', 'roles.read'), ('role-admin', 'roles.manage'),
	('role-viewer', 'dashboard.read'), ('role-viewer', 'relationships.read'),
	('role-viewer', 'knowledge.read'), ('role-viewer', 'opportunities.read'), ('role-viewer', 'products.read')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_roles" ("user_id", "role_id")
SELECT "id", CASE "role"
	WHEN 'sales' THEN 'role-sales'
	WHEN 'supply' THEN 'role-supply'
	WHEN 'sales_lead' THEN 'role-sales-lead'
	WHEN 'presales' THEN 'role-presales'
	WHEN 'admin' THEN 'role-admin'
	WHEN 'viewer' THEN 'role-viewer'
END
FROM "users"
WHERE "role" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_users_role_status";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."user_role";--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");
