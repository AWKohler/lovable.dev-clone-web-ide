CREATE TABLE "supabase_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"organization_name" text,
	"supabase_project_ref" text NOT NULL,
	"supabase_project_url" text NOT NULL,
	"supabase_anon_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supabase_links" ADD CONSTRAINT "supabase_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supabase_links_project_unique" ON "supabase_links" USING btree ("project_id");
