-- Add snapshot fields to projects table for thumbnails and HTML captures
ALTER TABLE "projects" ADD COLUMN "thumbnail_url" text;
ALTER TABLE "projects" ADD COLUMN "html_snapshot_url" text;
