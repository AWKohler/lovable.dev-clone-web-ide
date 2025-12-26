-- Add UploadThing file keys for snapshot cleanup
ALTER TABLE "projects" ADD COLUMN "thumbnail_key" text;
ALTER TABLE "projects" ADD COLUMN "html_snapshot_key" text;
