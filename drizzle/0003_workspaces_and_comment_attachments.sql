CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "workspaces" ("name") VALUES ('Producto'), ('Marketing'), ('Operaciones') ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "workspaces" ("name") SELECT DISTINCT "workspace" FROM "board_columns" ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "board_columns" ADD COLUMN "workspace_id" integer;
--> statement-breakpoint
UPDATE "board_columns" AS "board_column" SET "workspace_id" = "workspace_record"."id" FROM "workspaces" AS "workspace_record" WHERE "workspace_record"."name" = "board_column"."workspace";
--> statement-breakpoint
ALTER TABLE "board_columns" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "comment_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"comment_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_attachments" ADD CONSTRAINT "comment_attachments_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
