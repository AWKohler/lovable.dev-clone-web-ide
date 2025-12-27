import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects, projectFiles, projectSyncManifests } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

interface SyncFile {
  path: string;
  content: string;
  hash: string;
  size: number;
  mimeType?: string;
}

interface SyncRequest {
  files: SyncFile[];
  deletedPaths: string[];
  manifest: Record<string, string>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verify authentication
    const { userId } = await auth();
    if (!userId) {
      console.error('Sync error: Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    console.log(`☁️  Sync request for project ${projectId} from user ${userId}`);

    // 2. Verify project ownership
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    if (!project) {
      console.error(`Sync error: Project ${projectId} not found for user ${userId}`);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 3. Parse request body
    const body: SyncRequest = await request.json();
    console.log(`📦 Sync payload: ${body.files.length} files, ${body.deletedPaths.length} deleted`);
    const { files, deletedPaths, manifest } = body;

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    // 4. Get existing files to check if hash matches (optimization)
    const existingFiles = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId));

    const existingHashes = new Map(
      existingFiles.map((f) => [f.path, f.hash])
    );

    // 5. Upsert changed files (each operation is atomic)
    for (const file of files) {
      try {
        // Skip if hash matches (no change)
        if (existingHashes.get(file.path) === file.hash) {
          skipped++;
          continue;
        }

        // Only sync text files ≤1MB to Postgres
        // Larger files or binary assets should go through /backup/assets endpoint
        if (file.size > 1024 * 1024) {
          errors.push(`${file.path}: File too large (${file.size} bytes)`);
          continue;
        }

        // Upsert to project_files
        await db
          .insert(projectFiles)
          .values({
            projectId,
            path: file.path,
            content: file.content,
            hash: file.hash,
            size: file.size,
            mimeType: file.mimeType || 'text/plain',
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [projectFiles.projectId, projectFiles.path],
            set: {
              content: file.content,
              hash: file.hash,
              size: file.size,
              mimeType: file.mimeType || 'text/plain',
              updatedAt: new Date(),
            },
          });

        synced++;
      } catch (error) {
        errors.push(
          `${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // 6. Delete removed files
    if (deletedPaths.length > 0) {
      try {
        await db
          .delete(projectFiles)
          .where(
            and(
              eq(projectFiles.projectId, projectId),
              inArray(projectFiles.path, deletedPaths)
            )
          );
      } catch (error) {
        console.error('Error deleting files:', error);
        errors.push(`Failed to delete ${deletedPaths.length} files`);
      }
    }

    // 7. Update manifest
    try {
      await db
        .insert(projectSyncManifests)
        .values({
          projectId,
          fileManifest: manifest,
          totalFiles: Object.keys(manifest).length,
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
          lastSyncAt: new Date(),
        })
        .onConflictDoUpdate({
          target: projectSyncManifests.projectId,
          set: {
            fileManifest: manifest,
            totalFiles: Object.keys(manifest).length,
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            lastSyncAt: new Date(),
          },
        });
    } catch (error) {
      console.error('Error updating manifest:', error);
      errors.push('Failed to update manifest');
    }

    console.log(
      `✅ Cloud sync for project ${projectId}: synced=${synced}, skipped=${skipped}, errors=${errors.length}`
    );

    return NextResponse.json({
      synced,
      skipped,
      errors,
      lastSyncAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error syncing files:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Stack:', errorStack);
    return NextResponse.json(
      { error: 'Failed to sync files', details: errorMessage },
      { status: 500 }
    );
  }
}
