import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

async function run() {
  let urlFromEnv = process.env.DATABASE_URL;
  let urlFromFile = undefined;
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/);
      if (m) { urlFromFile = m[1]; break; }
    }
  } catch {}
  let url = (urlFromFile && urlFromFile.startsWith('postgres')) ? urlFromFile : urlFromEnv;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  // Normalize URL for neon driver
  url = url.trim().replace(/^postgresql:\/\//, 'postgres://');
  console.log('Using DATABASE_URL:', url.replace(/:(.*?)@/, ':***@'));
  const sql = neon(url);
  try {
    console.log('Connecting to database...');
    // Ensure UUID generator is available
    await sql`create extension if not exists pgcrypto;`;

    console.log('Dropping existing tables (if any)...');
    // Drop in dependency order where possible
    await sql`drop table if exists chat_messages cascade;`;
    await sql`drop table if exists chat_sessions cascade;`;
    await sql`drop table if exists projects cascade;`;

    console.log('Creating tables...');
    await sql`create table projects (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      user_id text not null,
      platform text not null default 'web',
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    );`;

    await sql`create table chat_sessions (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    );`;

    await sql`create table chat_messages (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references chat_sessions(id) on delete cascade,
      message_id text not null,
      role text not null,
      content jsonb not null,
      created_at timestamp default now() not null
    );`;
    await sql`create unique index chat_messages_session_message_unique on chat_messages(session_id, message_id);`;

    console.log('✅ Database reset complete.');
  } catch (err) {
    console.error('❌ Database reset failed:', err);
    process.exit(1);
  }
}

run();
