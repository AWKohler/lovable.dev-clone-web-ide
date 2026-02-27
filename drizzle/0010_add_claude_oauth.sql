-- Add Claude Code OAuth token storage to user_settings
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "claude_oauth_access_token" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "claude_oauth_refresh_token" text;
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "claude_oauth_expires_at" bigint;

-- Temporary PKCE state table for Claude Code OAuth flow
CREATE TABLE IF NOT EXISTS "oauth_pkce" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "code_verifier" text NOT NULL,
  "expires_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_pkce_user_unique" ON "oauth_pkce" ("user_id");
