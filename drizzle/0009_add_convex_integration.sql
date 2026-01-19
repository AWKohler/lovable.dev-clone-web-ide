-- Add Convex backend integration columns to projects table
ALTER TABLE "projects" ADD COLUMN "convex_project_id" text;
ALTER TABLE "projects" ADD COLUMN "convex_deployment_id" text;
ALTER TABLE "projects" ADD COLUMN "convex_deploy_url" text;
ALTER TABLE "projects" ADD COLUMN "convex_deploy_key" text;

-- Create environment variables table for user-defined env vars
CREATE TABLE "project_env_vars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "is_secret" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "project_env_vars" ADD CONSTRAINT "project_env_vars_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

-- Add indexes
CREATE UNIQUE INDEX "project_env_vars_project_key_unique" ON "project_env_vars" USING btree ("project_id","key");
CREATE INDEX "project_env_vars_project_id_idx" ON "project_env_vars" USING btree ("project_id");
