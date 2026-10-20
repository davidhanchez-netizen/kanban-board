ALTER TABLE "workspaces"
  ADD COLUMN "description" text DEFAULT '' NOT NULL,
  ADD COLUMN "icon" text DEFAULT 'briefcase' NOT NULL,
  ADD COLUMN "color" text DEFAULT '#4f46e5' NOT NULL;
