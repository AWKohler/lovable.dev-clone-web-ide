import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects, projectFiles, projectAssets, projectSyncManifests } from '@/db/schema';
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

    // 3. Query all text files
    const textFiles = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));

    // 4. Query all binary assets
    const binaryAssets = await db
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.projectId, projectId));

    // 5. Query manifest
    const [manifest] = await db
      .select()
      .from(projectSyncManifests)
      .where(eq(projectSyncManifests.projectId, projectId));

    // 6. Build file list
    const files = [
      ...textFiles.map((f) => ({
        path: f.path,
        content: f.content,
        type: 'file' as const,
        hash: f.hash,
      })),
      ...binaryAssets.map((a) => ({
        path: a.path,
        url: a.uploadThingUrl,
        type: 'asset' as const,
        hash: a.hash,
      })),
    ];

    // 7. Extract folder structure from file paths
    const folders = new Set<string>();
    files.forEach((file) => {
      const parts = file.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        const folder = '/' + parts.slice(1, i + 1).join('/');
        if (folder !== file.path) {
          folders.add(folder);
        }
      }
    });

    return NextResponse.json({
      files,
      folders: Array.from(folders).sort(),
      manifest: manifest?.fileManifest || {},
    });
  } catch (error) {
    console.error('Error restoring project:', error);
    return NextResponse.json(
      { error: 'Failed to restore project' },
      { status: 500 }
    );
  }
}
