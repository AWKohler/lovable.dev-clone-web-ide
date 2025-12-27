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

    // 3. Parse request body
    const body: SyncRequest = await request.json();
    const { files, deletedPaths, manifest } = body;

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    // 4. Process files in a transaction
    await db.transaction(async (tx) => {
      // Get existing files to check if hash matches (optimization)
      const existingFiles = await tx
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId));

      const existingHashes = new Map(
        existingFiles.map((f) => [f.path, f.hash])
      );

      // Upsert changed files
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
          await tx
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

      // Delete removed files
      if (deletedPaths.length > 0) {
        await tx
          .delete(projectFiles)
          .where(
            and(
              eq(projectFiles.projectId, projectId),
              inArray(projectFiles.path, deletedPaths)
            )
          );
      }

      // Update manifest
      await tx
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
    });

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
    return NextResponse.json(
      { error: 'Failed to sync files' },
      { status: 500 }
    );
  }
}
