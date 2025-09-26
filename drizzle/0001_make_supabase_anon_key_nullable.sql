-- Align DB with app schema: allow NULL anon key
alter table "supabase_links"
  alter column "supabase_anon_key" drop not null;

