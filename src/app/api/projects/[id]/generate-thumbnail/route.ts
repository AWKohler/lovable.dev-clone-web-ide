import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { UTApi } from 'uploadthing/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
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

    // 3. Generate OG image by fetching from our OG endpoint
    const ogUrl = new URL(`/api/og/project/${projectId}`, request.url);
    console.log(`🖼️  Generating thumbnail from OG endpoint: ${ogUrl.toString()}`);

    const ogResponse = await fetch(ogUrl.toString());

    if (!ogResponse.ok) {
      console.error('Failed to generate OG image:', ogResponse.statusText);
      return NextResponse.json(
        { error: 'Failed to generate thumbnail image' },
        { status: 500 }
      );
    }

    // 4. Get the image data
    const imageBuffer = await ogResponse.arrayBuffer();
    const imageBlob = new Blob([imageBuffer], { type: 'image/png' });
    const imageFile = new File([imageBlob], `${projectId}-thumbnail.png`, { type: 'image/png' });

    console.log(`📦 Image generated: ${imageFile.size} bytes`);

    // 5. Delete old thumbnail if it exists
    if (project.thumbnailKey) {
      try {
        await utapi.deleteFiles([project.thumbnailKey]);
        console.log(`🗑️  Deleted old thumbnail: ${project.thumbnailKey}`);
      } catch (error) {
        console.warn('Failed to delete old thumbnail:', error);
        // Continue anyway
      }
    }

    // 6. Upload to UploadThing
    const uploadResponse = await utapi.uploadFiles(imageFile);

    if (!uploadResponse.data) {
      return NextResponse.json(
        { error: 'Failed to upload thumbnail' },
        { status: 500 }
      );
    }

    const thumbnailUrl = uploadResponse.data.url;
    const thumbnailKey = uploadResponse.data.key;

    console.log(`✅ Thumbnail uploaded: ${thumbnailUrl}`);

    // 7. Update project record
    await db
      .update(projects)
      .set({
        thumbnailUrl,
        thumbnailKey,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({
      success: true,
      thumbnailUrl,
      thumbnailKey,
    });
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to generate thumbnail' },
      { status: 500 }
    );
  }
}
