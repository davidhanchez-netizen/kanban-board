CREATE TABLE "user_preferences" (
  "user_id" text PRIMARY KEY NOT NULL,
  "pronouns" text,
  "pronunciation" text,
  "pronunciation_audio" text,
  "job_title" text,
  "department" text,
  "about" text,
  "out_of_office" boolean DEFAULT false NOT NULL,
  "settings" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_preferences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action
);
