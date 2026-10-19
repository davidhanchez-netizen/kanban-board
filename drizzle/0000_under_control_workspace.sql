CREATE TYPE "public"."task_priority" AS ENUM ('high', 'medium', 'low');
--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"workspace" text DEFAULT 'Producto' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"column_id" integer NOT NULL,
	"assignee" text DEFAULT 'You' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."board_columns"("id") ON DELETE restrict ON UPDATE no action;
