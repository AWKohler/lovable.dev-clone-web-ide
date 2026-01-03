import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const [proj] = await db.select().from(projects).where(eq(projects.id, resolvedParams.id));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(proj);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const [proj] = await db.select().from(projects).where(eq(projects.id, resolvedParams.id));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await req.json();
    const { model, thumbnailUrl, htmlSnapshotUrl } = body as {
      model?: string;
      thumbnailUrl?: string;
      htmlSnapshotUrl?: string;
    };
    if (
      model &&
      model !== 'gpt-4.1' &&
      model !== 'claude-sonnet-4.5' &&
      model !== 'claude-haiku-4.5' &&
      model !== 'claude-opus-4.5' &&
      model !== 'kimi-k2-thinking-turbo'
    ) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }
    const updateData: Partial<typeof proj> = {
      updatedAt: new Date(),
    };
    if (model) updateData.model = model;
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;
    if (htmlSnapshotUrl !== undefined) updateData.htmlSnapshotUrl = htmlSnapshotUrl;

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, resolvedParams.id))
      .returning();
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const [proj] = await db.select().from(projects).where(eq(projects.id, resolvedParams.id));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Delete the project (cascades to chat sessions and messages)
    await db.delete(projects).where(eq(projects.id, resolvedParams.id));

    return NextResponse.json({ success: true, message: 'Project deleted' });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
