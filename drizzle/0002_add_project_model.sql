-- Add model column to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "model" text NOT NULL DEFAULT 'gpt-4.1';
