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

    // 3. Parse request body
    const body = await request.json();
    const { url, html } = body;

    let htmlContent: string;

    // If URL is provided, fetch HTML from it
    if (url && typeof url === 'string') {
      try {
        console.log(`📄 Fetching HTML from URL: ${url}`);
        const htmlResponse = await fetch(url);

        if (!htmlResponse.ok) {
          return NextResponse.json(
            { error: `Failed to fetch HTML: ${htmlResponse.statusText}` },
            { status: 500 }
          );
        }

        htmlContent = await htmlResponse.text();
        console.log(`✅ Fetched ${htmlContent.length} bytes of HTML`);
      } catch (error) {
        console.error('Error fetching HTML:', error);
        return NextResponse.json(
          { error: 'Failed to fetch HTML from URL' },
          { status: 500 }
        );
      }
    } else if (html && typeof html === 'string') {
      // Direct HTML content provided
      htmlContent = html;
    } else {
      return NextResponse.json(
        { error: 'Missing URL or HTML content' },
        { status: 400 }
      );
    }

    if (!htmlContent || htmlContent.length < 100) {
      return NextResponse.json(
        { error: 'HTML content too short or empty' },
        { status: 400 }
      );
    }

    // 4. Delete old HTML snapshot if it exists
    if (project.htmlSnapshotKey) {
      try {
        await utapi.deleteFiles([project.htmlSnapshotKey]);
        console.log(`🗑️ Deleted old HTML snapshot: ${project.htmlSnapshotKey}`);
      } catch (error) {
        console.warn('Failed to delete old HTML snapshot:', error);
        // Continue anyway
      }
    }

    // 5. Upload new HTML to UploadThing as [projectId].html
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    const htmlFile = new File([htmlBlob], `${projectId}.html`, { type: 'text/html' });

    const uploadResponse = await utapi.uploadFiles(htmlFile);

    if (!uploadResponse.data) {
      return NextResponse.json(
        { error: 'Failed to upload HTML snapshot' },
        { status: 500 }
      );
    }

    const htmlSnapshotUrl = uploadResponse.data.url;
    const htmlSnapshotKey = uploadResponse.data.key;

    // 6. Update project record with new HTML snapshot URL
    await db
      .update(projects)
      .set({
        htmlSnapshotUrl,
        htmlSnapshotKey,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    console.log(`✅ HTML snapshot saved for project ${projectId}: ${htmlSnapshotUrl}`);

    return NextResponse.json({
      success: true,
      htmlSnapshotUrl,
      htmlSnapshotKey,
    });
  } catch (error) {
    console.error('Error saving HTML snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to save HTML snapshot' },
      { status: 500 }
    );
  }
}
