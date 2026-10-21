ALTER TABLE "tasks"
  ADD COLUMN "created_by" text REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "workspace_id" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" ("user_id", "read_at");
