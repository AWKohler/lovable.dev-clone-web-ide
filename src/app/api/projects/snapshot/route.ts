import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { UTApi } from 'uploadthing/server';

const utapi = new UTApi();

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const formData = await request.formData();
    const projectId = formData.get('projectId') as string;
    const thumbnailFile = formData.get('thumbnail') as File | null;
    const htmlContent = formData.get('html') as string | null;

    console.log('📥 Snapshot upload request:', {
      projectId,
      hasThumbnail: !!thumbnailFile,
      hasHtml: !!htmlContent
    });

    if (!projectId) {
      return new NextResponse('Project ID is required', { status: 400 });
    }

    // Verify the project belongs to the user
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    if (!project) {
      console.error('Project not found:', projectId);
      return new NextResponse('Project not found', { status: 404 });
    }

    // Delete old files from UploadThing if they exist
    const filesToDelete: string[] = [];
    if (project.thumbnailKey) {
      filesToDelete.push(project.thumbnailKey);
      console.log('🗑️ Will delete old thumbnail:', project.thumbnailKey);
    }
    if (project.htmlSnapshotKey) {
      filesToDelete.push(project.htmlSnapshotKey);
      console.log('🗑️ Will delete old HTML:', project.htmlSnapshotKey);
    }

    if (filesToDelete.length > 0) {
      try {
        await utapi.deleteFiles(filesToDelete);
        console.log('✅ Old files deleted from UploadThing');
      } catch (error) {
        console.warn('⚠️ Failed to delete old files (continuing anyway):', error);
      }
    }

    let thumbnailUrl: string | undefined;
    let thumbnailKey: string | undefined;
    let htmlSnapshotUrl: string | undefined;
    let htmlSnapshotKey: string | undefined;

    // Upload thumbnail if provided
    if (thumbnailFile && thumbnailFile.size > 0) {
      try {
        console.log('📤 Uploading thumbnail, size:', thumbnailFile.size, 'bytes');
        const response = await utapi.uploadFiles(thumbnailFile);
        console.log('📦 Thumbnail UTApi response:', JSON.stringify(response, null, 2));

        if (response.data) {
          thumbnailUrl = response.data.url;
          thumbnailKey = response.data.key;
          console.log('✅ Thumbnail uploaded:', thumbnailUrl);
        }
        if (response.error) {
          console.error('❌ Thumbnail UTApi error:', response.error);
          return new NextResponse(`Thumbnail upload failed: ${response.error.message}`, { status: 500 });
        }
      } catch (error) {
        console.error('❌ Failed to upload thumbnail:', error);
        return new NextResponse(`Thumbnail upload error: ${String(error)}`, { status: 500 });
      }
    }

    // Upload HTML if provided
    if (htmlContent) {
      try {
        console.log('📤 Uploading HTML, length:', htmlContent.length, 'chars');

        // Convert HTML string to a File object
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const htmlFile = new File([htmlBlob], `snapshot-${Date.now()}.html`, { type: 'text/html' });

        const response = await utapi.uploadFiles(htmlFile);
        console.log('📦 HTML UTApi response:', JSON.stringify(response, null, 2));

        if (response.data) {
          htmlSnapshotUrl = response.data.url;
          htmlSnapshotKey = response.data.key;
          console.log('✅ HTML uploaded:', htmlSnapshotUrl);
        }
        if (response.error) {
          console.error('❌ HTML UTApi error:', response.error);
          // Don't fail the whole request if just HTML fails
          console.warn('⚠️ Continuing without HTML upload');
        }
      } catch (error) {
        console.error('❌ Failed to upload HTML:', error);
        // Don't fail the whole request if just HTML fails
        console.warn('⚠️ Continuing without HTML upload');
      }
    }

    // Update the project with the new URLs and keys
    const updateData: {
      thumbnailUrl?: string;
      thumbnailKey?: string;
      htmlSnapshotUrl?: string;
      htmlSnapshotKey?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (thumbnailUrl) updateData.thumbnailUrl = thumbnailUrl;
    if (thumbnailKey) updateData.thumbnailKey = thumbnailKey;
    if (htmlSnapshotUrl) updateData.htmlSnapshotUrl = htmlSnapshotUrl;
    if (htmlSnapshotKey) updateData.htmlSnapshotKey = htmlSnapshotKey;

    if (thumbnailUrl || htmlSnapshotUrl) {
      console.log('💾 Updating project with new URLs and keys');
      await db
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, projectId));
      console.log('✅ Project updated');
    }

    return NextResponse.json({
      thumbnailUrl,
      htmlSnapshotUrl,
      message: 'Snapshot saved successfully',
    });
  } catch (error) {
    console.error('❌ Error saving snapshot:', error);
    return new NextResponse(`Internal server error: ${String(error)}`, { status: 500 });
  }
}
