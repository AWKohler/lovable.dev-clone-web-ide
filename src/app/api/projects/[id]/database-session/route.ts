import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getConvexPlatformClient } from '@/lib/convex-platform';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const [proj] = await db.select().from(projects).where(eq(projects.id, id));

  if (!proj || proj.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!proj.convexDeploymentId || !proj.convexDeployUrl) {
    return NextResponse.json({ error: 'No Convex backend for this project' }, { status: 404 });
  }

  try {
    const client = getConvexPlatformClient();
    const adminKey = await client.createAdminKey(proj.convexDeploymentId);

    return NextResponse.json({
      deploymentUrl: proj.convexDeployUrl,
      adminKey,
    });
  } catch (err) {
    console.error('Failed to generate Convex admin key:', err);
    return NextResponse.json({ error: 'Failed to generate database session' }, { status: 500 });
  }
}
