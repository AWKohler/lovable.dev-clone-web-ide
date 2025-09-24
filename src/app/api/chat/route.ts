import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { chatMessages, chatSessions, projects } from '@/db/schema';
import { auth } from '@clerk/nextjs/server';

// Chat endpoints are IO-bound and may stream/persist large payloads; extend limits
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Helper: find or create a chat session for a project
async function getOrCreateSession(db: ReturnType<typeof getDb>, projectId: string) {
  const existing = await db.select().from(chatSessions).where(eq(chatSessions.projectId, projectId)).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(chatSessions).values({ projectId }).returning();
  return created;
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

    const db = getDb();
    // Ensure user owns the project
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const session = await getOrCreateSession(db, projectId);

    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id))
      .orderBy(desc(chatMessages.createdAt));

    // Return in chronological order
    const messages = [...rows].reverse().map((r) => ({ id: r.messageId, role: r.role, content: r.content as unknown }));
    return NextResponse.json({ sessionId: session.id, messages });
  } catch (err) {
    console.error('GET /api/chat failed:', err);
    return NextResponse.json({ error: 'Failed to fetch chat' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { projectId, message } = body as { projectId?: string; message?: { id: string; role: string; content: unknown } };
    if (!projectId || !message?.id || !message?.role) {
      return NextResponse.json({ error: 'projectId and full message are required' }, { status: 400 });
    }
    const db = getDb();
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const session = await getOrCreateSession(db, projectId);

    // Upsert by (sessionId, messageId) so we can update the assistant
    // message multiple times during streaming without creating duplicates.
    await db
      .insert(chatMessages)
      .values({
        sessionId: session.id,
        messageId: message.id,
        role: message.role,
        content: message.content as object,
      })
      .onConflictDoUpdate({
        target: [chatMessages.sessionId, chatMessages.messageId],
        set: {
          role: message.role,
          content: message.content as object,
        },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/chat failed:', err);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const db = getDb();
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const session = await getOrCreateSession(db, projectId);
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, session.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/chat failed:', err);
    return NextResponse.json({ error: 'Failed to reset chat' }, { status: 500 });
  }
}
