import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const [proj] = await db.select().from(projects).where(eq(projects.id, params.id));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(proj);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

