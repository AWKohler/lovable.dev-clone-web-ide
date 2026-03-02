-- Migrate gpt-4.1 default to gpt-5.2
ALTER TABLE "projects" ALTER COLUMN "model" SET DEFAULT 'gpt-5.2';
UPDATE "projects" SET "model" = 'gpt-5.2' WHERE "model" = 'gpt-4.1';
