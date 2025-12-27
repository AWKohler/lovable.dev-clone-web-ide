import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects, projectSyncManifests } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    // 2. Verify project ownership
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 3. Query sync manifest
    const [manifest] = await db
      .select()
      .from(projectSyncManifests)
      .where(eq(projectSyncManifests.projectId, projectId));

    // 4. Return manifest or empty state if none exists
    if (!manifest) {
      return NextResponse.json({
        manifest: {},
        lastSyncAt: null,
        totalFiles: 0,
        totalSize: 0,
      });
    }

    return NextResponse.json({
      manifest: manifest.fileManifest,
      lastSyncAt: manifest.lastSyncAt.toISOString(),
      totalFiles: manifest.totalFiles,
      totalSize: manifest.totalSize,
    });
  } catch (error) {
    console.error('Error fetching manifest:', error);
    return NextResponse.json(
      { error: 'Failed to fetch manifest' },
      { status: 500 }
    );
  }
}
