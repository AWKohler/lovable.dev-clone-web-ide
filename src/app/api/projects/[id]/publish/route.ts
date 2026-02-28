import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createHash } from 'crypto';

function getCfConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set');
  }
  return {
    accountId,
    apiToken,
    apiBase: `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
  };
}

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

    const cf = getCfConfig();
    const projectName = project.cloudflareProjectName ?? `bf-${projectId.slice(0, 8)}`;

    // Create Pages project if first publish
    if (!project.cloudflareProjectName) {
      const createRes = await fetch(cf.apiBase, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cf.apiToken}`,
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

    // Parse the file map from request body: { files: { "/path": "base64data" } }
    const body = await request.json() as { files: Record<string, string> };
    if (!body.files || Object.keys(body.files).length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Build manifest and form data for Cloudflare Direct Upload
    // Manifest maps "/<path>" to a content hash
    // Each file is appended as a blob with the hash as the form key
    const manifest: Record<string, string> = {};
    const fileEntries: Array<{ hash: string; buffer: Buffer; path: string }> = [];

    for (const [filePath, base64Content] of Object.entries(body.files)) {
      const buffer = Buffer.from(base64Content, 'base64');
      const hash = createHash('sha256').update(buffer).digest('hex');
      // Cloudflare expects paths starting with /
      const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      manifest[normalizedPath] = hash;
      fileEntries.push({ hash, buffer, path: normalizedPath });
    }

    // Build multipart form
    const formData = new FormData();
    formData.append('manifest', JSON.stringify(manifest));

    // Deduplicate by hash — same content only uploaded once
    const seen = new Set<string>();
    for (const entry of fileEntries) {
      if (seen.has(entry.hash)) continue;
      seen.add(entry.hash);
      formData.append(entry.hash, new Blob([new Uint8Array(entry.buffer)]), entry.hash);
    }

    const deployRes = await fetch(`${cf.apiBase}/${projectName}/deployments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cf.apiToken}`,
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

    const cf = getCfConfig();

    // Delete Cloudflare Pages project
    await fetch(`${cf.apiBase}/${project.cloudflareProjectName}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${cf.apiToken}` },
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
