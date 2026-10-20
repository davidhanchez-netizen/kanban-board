CREATE TABLE "workspace_agents" (
  "workspace_id" integer NOT NULL,
  "agent_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_agents_pk" PRIMARY KEY ("workspace_id", "agent_key"),
  CONSTRAINT "workspace_agents_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "workspace_agents_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint

CREATE TABLE "agent_activity" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "agent_key" text NOT NULL,
  "action" text NOT NULL,
  "details" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_activity_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint

CREATE INDEX "agent_activity_workspace_created_idx"
  ON "agent_activity" ("workspace_id", "created_at");
--> statement-breakpoint

CREATE TABLE "strategy_goals" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "created_by" text,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "current" integer DEFAULT 0 NOT NULL,
  "target" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "strategy_goals_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "strategy_goals_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint

CREATE INDEX "strategy_goals_workspace_updated_idx"
  ON "strategy_goals" ("workspace_id", "updated_at");
--> statement-breakpoint

CREATE TABLE "knowledge_articles" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspace_id" integer NOT NULL,
  "author_id" text,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "category" text DEFAULT 'Procesos' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_articles_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "knowledge_articles_author_id_users_id_fk"
    FOREIGN KEY ("author_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint

CREATE INDEX "knowledge_articles_workspace_updated_idx"
  ON "knowledge_articles" ("workspace_id", "updated_at");
