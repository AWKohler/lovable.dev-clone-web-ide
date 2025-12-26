-- Create user_settings table for BYOK
CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "openai_api_key" text,
  "anthropic_api_key" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Unique per user
CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_user_unique" ON "user_settings" ("user_id");
