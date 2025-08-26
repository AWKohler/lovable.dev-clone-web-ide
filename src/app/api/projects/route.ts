import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';

export async function GET() {
  try {
    const db = getDb();
    const allProjects = await db.select().from(projects);
    return NextResponse.json(allProjects);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const db = getDb();
    const [newProject] = await db.insert(projects).values({
      name,
      description: description || null,
    }).returning();

    return NextResponse.json(newProject, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
