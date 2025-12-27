-- Text files stored directly in Postgres
CREATE TABLE "project_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "content" text NOT NULL,
  "hash" text NOT NULL,
  "size" integer NOT NULL,
  "mime_type" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_files_project_path_unique" UNIQUE("project_id", "path")
);

CREATE INDEX "project_files_project_id_idx" ON "project_files"("project_id");
CREATE INDEX "project_files_hash_idx" ON "project_files"("hash");

-- Binary assets stored in UploadThing
CREATE TABLE "project_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "upload_thing_url" text NOT NULL,
  "upload_thing_key" text NOT NULL,
  "hash" text NOT NULL,
  "size" integer NOT NULL,
  "mime_type" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_assets_project_path_unique" UNIQUE("project_id", "path")
);

CREATE INDEX "project_assets_project_id_idx" ON "project_assets"("project_id");

-- Sync manifest for quick comparison
CREATE TABLE "project_sync_manifests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "file_manifest" jsonb NOT NULL,
  "total_files" integer NOT NULL DEFAULT 0,
  "total_size" bigint NOT NULL DEFAULT 0,
  "last_sync_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_sync_manifests_project_unique" UNIQUE("project_id")
);

CREATE INDEX "project_sync_manifests_project_id_idx" ON "project_sync_manifests"("project_id");
