-- Add moonshot_api_key column to user_settings table
ALTER TABLE "user_settings" ADD COLUMN "moonshot_api_key" text;
