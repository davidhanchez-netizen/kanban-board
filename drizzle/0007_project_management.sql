ALTER TABLE "workspaces"
  ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "workspace_members" (
  "workspace_id" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY ("workspace_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
  "workspace_id" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "invited_by" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_invitations_workspace_id_email_pk" PRIMARY KEY ("workspace_id", "email")
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY ("task_id", "user_id")
);
--> statement-breakpoint
INSERT INTO "task_assignees" ("task_id", "user_id")
  SELECT "id", "assignee_id" FROM "tasks" WHERE "assignee_id" IS NOT NULL
  ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE "subtasks" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments"
  ADD COLUMN "is_activity" boolean DEFAULT false NOT NULL;
