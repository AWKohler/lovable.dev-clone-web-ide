import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CF_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`;

async function getProjectWithAuth(userId: string, projectId: string) {
  const db = getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return project ?? null;
}

// POST — Publish / update deployment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = await params;
    const project = await getProjectWithAuth(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const projectName = project.cloudflareProjectName ?? `bf-${projectId.slice(0, 8)}`;

    // Create Pages project if first publish
    if (!project.cloudflareProjectName) {
      const createRes = await fetch(CF_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          production_branch: 'main',
        }),
      });

      // 409 = already exists, that's fine
      if (!createRes.ok && createRes.status !== 409) {
        const err = await createRes.json();
        return NextResponse.json(
          { error: `Failed to create Cloudflare project: ${JSON.stringify(err)}` },
          { status: 500 }
        );
      }
    }

    // Upload deployment as zip
    const zipBlob = await request.blob();
    if (zipBlob.size === 0) {
      return NextResponse.json({ error: 'No deployment package provided' }, { status: 400 });
    }

    const formData = new FormData();
    formData.append('manifest', JSON.stringify({}));
    formData.append('file', zipBlob, 'dist.zip');

    const deployRes = await fetch(`${CF_API}/${projectName}/deployments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
      body: formData,
    });

    if (!deployRes.ok) {
      const err = await deployRes.json();
      return NextResponse.json(
        { error: `Deployment failed: ${JSON.stringify(err)}` },
        { status: 500 }
      );
    }

    const deployData = await deployRes.json() as {
      result?: { url?: string; subdomain?: string };
    };

    const deploymentUrl = `https://${projectName}.pages.dev`;

    // Update DB
    const db = getDb();
    await db.update(projects)
      .set({
        cloudflareProjectName: projectName,
        cloudflareDeploymentUrl: deploymentUrl,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({
      ok: true,
      url: deploymentUrl,
      projectName,
      deploymentUrl: deployData.result?.url,
    });
  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json(
      { error: `Publish failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// DELETE — Unpublish
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = await params;
    const project = await getProjectWithAuth(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    if (!project.cloudflareProjectName) {
      return NextResponse.json({ error: 'Not published' }, { status: 400 });
    }

    // Delete Cloudflare Pages project
    await fetch(`${CF_API}/${project.cloudflareProjectName}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` },
    });

    // Clear DB columns
    const db = getDb();
    await db.update(projects)
      .set({
        cloudflareProjectName: null,
        cloudflareDeploymentUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Unpublish error:', error);
    return NextResponse.json(
      { error: `Unpublish failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

// GET — Status check
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = await params;
    const project = await getProjectWithAuth(userId, projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    return NextResponse.json({
      published: Boolean(project.cloudflareProjectName),
      url: project.cloudflareDeploymentUrl,
      projectName: project.cloudflareProjectName,
    });
  } catch (error) {
    console.error('Publish status error:', error);
    return NextResponse.json(
      { error: 'Failed to check publish status' },
      { status: 500 }
    );
  }
}
