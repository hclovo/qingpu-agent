CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."agent_mode" AS ENUM('intelligent', 'rules', 'demo');--> statement-breakpoint
CREATE TYPE "public"."contactability" AS ENUM('unknown', 'public-channel', 'known-contact', 'existing-relationship');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('ready', 'pending', 'review-needed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_type" AS ENUM('enterprise-document', 'text', 'url', 'file', 'interaction');--> statement-breakpoint
CREATE TYPE "public"."maturity" AS ENUM('awareness', 'planning', 'approved', 'tendering', 'pilot', 'operating', 'repeat-purchase');--> statement-breakpoint
CREATE TYPE "public"."opportunity_grade" AS ENUM('A', 'B', 'C', 'D');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('new', 'verifying', 'qualified', 'engaging', 'converted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."relationship_health" AS ENUM('healthy', 'attention', 'at-risk');--> statement-breakpoint
CREATE TYPE "public"."relationship_role" AS ENUM('customer', 'prospect', 'supplier', 'partner');--> statement-breakpoint
CREATE TYPE "public"."score_dimension_key" AS ENUM('fit', 'demand', 'recency', 'maturity', 'contactability', 'strategic');--> statement-breakpoint
CREATE TYPE "public"."signal_type" AS ENUM('procurement', 'project', 'policy', 'operation', 'partnership');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('public', 'enterprise-provided', 'demo-simulated');--> statement-breakpoint
CREATE TYPE "public"."touchpoint_channel" AS ENUM('meeting', 'phone', 'email', 'wechat', 'event', 'visit', 'other');--> statement-breakpoint
CREATE TABLE "knowledge_item_relationships" (
	"knowledge_item_id" text NOT NULL,
	"relationship_id" text NOT NULL,
	CONSTRAINT "knowledge_item_relationships_knowledge_item_id_relationship_id_pk" PRIMARY KEY("knowledge_item_id","relationship_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" "knowledge_type" NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"source_path" text,
	"status" "knowledge_status" NOT NULL,
	"source_kind" "source_kind" NOT NULL,
	"is_demo" boolean GENERATED ALWAYS AS (source_kind = 'demo-simulated') STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_tags" (
	"knowledge_item_id" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "knowledge_tags_knowledge_item_id_tag_pk" PRIMARY KEY("knowledge_item_id","tag")
);
--> statement-breakpoint
CREATE TABLE "agent_insights" (
	"opportunity_id" text PRIMARY KEY NOT NULL,
	"mode" "agent_mode" NOT NULL,
	"summary" text NOT NULL,
	"opportunity_type" text NOT NULL,
	"talking_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions_to_verify" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"fallback_reason" text,
	"generated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"relationship_id" text,
	"company_name" text NOT NULL,
	"industry" text NOT NULL,
	"region" text NOT NULL,
	"title" text NOT NULL,
	"signal" text NOT NULL,
	"signal_type" "signal_type" NOT NULL,
	"expected_scale" text,
	"maturity" "maturity" NOT NULL,
	"contactability" "contactability" NOT NULL,
	"stage" "opportunity_stage" DEFAULT 'new' NOT NULL,
	"score" integer NOT NULL,
	"grade" "opportunity_grade" NOT NULL,
	"score_version" text NOT NULL,
	"source_kind" "source_kind" NOT NULL,
	"is_demo" boolean GENERATED ALWAYS AS (source_kind = 'demo-simulated') STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_opportunities_score" CHECK ("opportunities"."score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "opportunity_product_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_model" text NOT NULL,
	"fit_score" integer NOT NULL,
	"matched_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text NOT NULL,
	"rank" smallint NOT NULL,
	CONSTRAINT "ck_opportunity_matches_fit_score" CHECK ("opportunity_product_matches"."fit_score" BETWEEN 0 AND 100),
	CONSTRAINT "ck_opportunity_matches_rank" CHECK ("opportunity_product_matches"."rank" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "opportunity_score_dimensions" (
	"opportunity_id" text NOT NULL,
	"key" "score_dimension_key" NOT NULL,
	"label" text NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "opportunity_score_dimensions_opportunity_id_key_pk" PRIMARY KEY("opportunity_id","key"),
	CONSTRAINT "ck_score_dimensions_score" CHECK ("opportunity_score_dimensions"."score" >= 0 AND "opportunity_score_dimensions"."max_score" > 0 AND "opportunity_score_dimensions"."score" <= "opportunity_score_dimensions"."max_score")
);
--> statement-breakpoint
CREATE TABLE "opportunity_tags" (
	"opportunity_id" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "opportunity_tags_opportunity_id_tag_pk" PRIMARY KEY("opportunity_id","tag")
);
--> statement-breakpoint
CREATE TABLE "source_evidences" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"source_path" text,
	"occurred_at" timestamp with time zone,
	"captured_at" timestamp with time zone NOT NULL,
	"excerpt" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	CONSTRAINT "ck_source_evidences_confidence" CHECK ("source_evidences"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"family" text NOT NULL,
	"rated_power" text NOT NULL,
	"peak_power" text,
	"life_hours" integer,
	"certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"source_page" integer,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_products_life_hours" CHECK ("products"."life_hours" IS NULL OR "products"."life_hours" > 0),
	CONSTRAINT "ck_products_source_page" CHECK ("products"."source_page" IS NULL OR "products"."source_page" > 0)
);
--> statement-breakpoint
CREATE TABLE "relationship_tags" (
	"relationship_id" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "relationship_tags_relationship_id_tag_pk" PRIMARY KEY("relationship_id","tag")
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" "relationship_role" NOT NULL,
	"industry" text NOT NULL,
	"region" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"health" "relationship_health" NOT NULL,
	"health_score" integer NOT NULL,
	"last_contact_at" timestamp with time zone,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"source_kind" "source_kind" NOT NULL,
	"is_demo" boolean GENERATED ALWAYS AS (source_kind = 'demo-simulated') STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_relationships_health_score" CHECK ("relationships"."health_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "touchpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"relationship_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"channel" "touchpoint_channel" NOT NULL,
	"summary" text NOT NULL,
	"outcome" text DEFAULT '待复盘' NOT NULL,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_item_relationships" ADD CONSTRAINT "knowledge_item_relationships_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_item_relationships" ADD CONSTRAINT "knowledge_item_relationships_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_tags" ADD CONSTRAINT "knowledge_tags_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insights" ADD CONSTRAINT "agent_insights_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_product_matches" ADD CONSTRAINT "opportunity_product_matches_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_product_matches" ADD CONSTRAINT "opportunity_product_matches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_score_dimensions" ADD CONSTRAINT "opportunity_score_dimensions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_tags" ADD CONSTRAINT "opportunity_tags_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_evidences" ADD CONSTRAINT "source_evidences_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tags" ADD CONSTRAINT "relationship_tags_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_knowledge_relationships_relationship" ON "knowledge_item_relationships" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_status" ON "knowledge_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_knowledge_updated" ON "knowledge_items" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_knowledge_title_trgm" ON "knowledge_items" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_knowledge_content_trgm" ON "knowledge_items" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_opportunities_fingerprint" ON "opportunities" USING btree (lower(btrim("company_name")),lower(btrim("title")));--> statement-breakpoint
CREATE INDEX "idx_opportunities_grade_score_updated" ON "opportunities" USING btree ("grade","score" DESC NULLS LAST,"updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_opportunities_stage" ON "opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_opportunities_industry" ON "opportunities" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "idx_opportunities_relationship" ON "opportunities" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "idx_opportunities_created" ON "opportunities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_opportunities_search_trgm" ON "opportunities" USING gin (("company_name" || ' ' || "title" || ' ' || "signal" || ' ' || "region") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_opportunity_matches_product" ON "opportunity_product_matches" USING btree ("opportunity_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_opportunity_matches_rank" ON "opportunity_product_matches" USING btree ("opportunity_id","rank");--> statement-breakpoint
CREATE INDEX "idx_source_evidences_opportunity_captured" ON "source_evidences" USING btree ("opportunity_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_products_model" ON "products" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_products_family" ON "products" USING btree ("family");--> statement-breakpoint
CREATE INDEX "idx_products_scenarios_gin" ON "products" USING gin ("scenarios");--> statement-breakpoint
CREATE INDEX "idx_relationships_role" ON "relationships" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_relationships_health" ON "relationships" USING btree ("health");--> statement-breakpoint
CREATE INDEX "idx_relationships_health_score" ON "relationships" USING btree ("health_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_relationships_next_action" ON "relationships" USING btree ("next_action_at") WHERE "relationships"."next_action_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_relationships_last_contact" ON "relationships" USING btree ("last_contact_at");--> statement-breakpoint
CREATE INDEX "idx_touchpoints_relationship_occurred" ON "touchpoints" USING btree ("relationship_id","occurred_at" DESC NULLS LAST);
