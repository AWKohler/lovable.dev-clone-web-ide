import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { UTApi } from 'uploadthing/server';
import { getDb } from '@/db';
import { projects, projectAssets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const utapi = new UTApi();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse('Unauthorized', { status: 401 });
    }

    const { id: projectId } = await params;

    // 2. Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const path = formData.get('path') as string;
    const hash = formData.get('hash') as string;

    if (!file || !path || !hash) {
      return NextResponse.json(
        { error: 'Missing required fields: file, path, hash' },
        { status: 400 }
      );
    }

    // 3. Verify project ownership
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    if (!project) {
      return NextResponse('Project not found', { status: 404 });
    }

    // 4. Check file size (reject if >1MB for cloud backup)
    if (file.size > 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large for cloud backup (>1MB)' },
        { status: 413 }
      );
    }

    // 5. Check if asset already exists with same hash (optimization)
    const [existing] = await db
      .select()
      .from(projectAssets)
      .where(
        and(
          eq(projectAssets.projectId, projectId),
          eq(projectAssets.path, path)
        )
      );

    if (existing && existing.hash === hash) {
      // Asset unchanged, return existing URL
      return NextResponse.json({
        url: existing.uploadThingUrl,
        key: existing.uploadThingKey,
        path: existing.path,
        cached: true,
      });
    }

    // 6. Delete old file from UploadThing if it exists
    if (existing && existing.uploadThingKey) {
      try {
        await utapi.deleteFiles([existing.uploadThingKey]);
      } catch (error) {
        console.warn('Failed to delete old asset (continuing anyway):', error);
      }
    }

    // 7. Upload to UploadThing
    const response = await utapi.uploadFiles(file);

    if (!response.data) {
      return NextResponse.json(
        { error: 'Failed to upload asset' },
        { status: 500 }
      );
    }

    const uploadThingUrl = response.data.url;
    const uploadThingKey = response.data.key;

    // 8. Store in database
    await db
      .insert(projectAssets)
      .values({
        projectId,
        path,
        uploadThingUrl,
        uploadThingKey,
        hash,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [projectAssets.projectId, projectAssets.path],
        set: {
          uploadThingUrl,
          uploadThingKey,
          hash,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          updatedAt: new Date(),
        },
      });

    console.log(`✅ Uploaded asset: ${path} (${file.size} bytes) to UploadThing`);

    return NextResponse.json({
      url: uploadThingUrl,
      key: uploadThingKey,
      path,
      cached: false,
    });
  } catch (error) {
    console.error('Error uploading asset:', error);
    return NextResponse.json(
      { error: 'Failed to upload asset' },
      { status: 500 }
    );
  }
}
