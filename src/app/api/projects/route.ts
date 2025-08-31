import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getDb();
    const allProjects = await db.select().from(projects).where(eq(projects.userId, userId));
    return NextResponse.json(allProjects);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { name } = body as { name?: string };

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const db = getDb();
    const [newProject] = await db
      .insert(projects)
      .values({
        name,
        userId,
      })
      .returning();

    return NextResponse.json(newProject, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
