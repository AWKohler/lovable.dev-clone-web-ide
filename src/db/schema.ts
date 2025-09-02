import { pgTable, uuid, timestamp, text, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  userId: text('user_id').notNull(), // Clerk user id
  platform: text('platform').notNull().default('web'), // 'web' | 'mobile'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// Chat session per project (one active session per project)
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Store all messages as JSON to preserve all parts (tool-calls, data, etc.)
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
    // Original message id from the client/useChat to dedupe
    messageId: text('message_id').notNull(),
    role: text('role').notNull(),
    content: jsonb('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    sessionMessageUnique: uniqueIndex('chat_messages_session_message_unique').on(t.sessionId, t.messageId),
  })
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

// Supabase linkage between a platform project and a Supabase project
export const supabaseLinks = pgTable('supabase_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id'),
  organizationName: text('organization_name'),
  supabaseProjectRef: text('supabase_project_ref').notNull(),
  supabaseProjectUrl: text('supabase_project_url').notNull(),
  // Note: store anon key server-side only. In production, encrypt-at-rest.
  supabaseAnonKey: text('supabase_anon_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  linkPerProjectUnique: uniqueIndex('supabase_links_project_unique').on(t.projectId),
}));

export type SupabaseLink = typeof supabaseLinks.$inferSelect;
export type NewSupabaseLink = typeof supabaseLinks.$inferInsert;
