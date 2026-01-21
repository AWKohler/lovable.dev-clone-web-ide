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

    // 5. Parse JSON response from fly.io
    const result = await response.json();

    if (!response.ok || !result.success) {
      return NextResponse.json(
        {
          ok: false,
          output: result.logs || '',
          error: result.error || `Deployment failed with status ${response.status}`,
          generatedFiles: [],
        },
        { status: response.status }
      );
    }

    // 6. Return success with logs and generated files
    return NextResponse.json({
      ok: true,
      output: result.logs || '',
      generatedFiles: result.generatedFiles || [],
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
