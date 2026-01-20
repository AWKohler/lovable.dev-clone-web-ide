import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const FLY_WORKER_URL = "https://fly-shy-feather-7138.fly.dev";
const WORKER_AUTH_TOKEN = "dev-secret";

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

    // 2. Verify project ownership and get deploy key
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.convexDeployKey) {
      return NextResponse.json(
        {
          error: 'Project does not have a Convex deploy key - ensure Convex backend was provisioned'
        },
        { status: 400 }
      );
    }

    // 3. Get the zip blob from request body
    const zipBlob = await request.blob();

    if (zipBlob.size === 0) {
      return NextResponse.json(
        { error: 'No deployment package provided' },
        { status: 400 }
      );
    }

    // 4. Send to fly.io worker
    const response = await fetch(FLY_WORKER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WORKER_AUTH_TOKEN}`,
        'X-Convex-Deploy-Key': project.convexDeployKey,
      },
      body: zipBlob,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          ok: false,
          output: errorText,
          error: `Deployment failed with status ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    // 5. Stream the output
    const output = await response.text();

    // 6. Check if deployment was successful
    const success = output.includes('✅ Convex deploy completed successfully');

    return NextResponse.json({
      ok: success,
      output,
      error: success ? undefined : 'Deployment completed but did not report success',
    });
  } catch (error) {
    console.error('Convex deployment error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        output: '',
        error: `Deployment error: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
