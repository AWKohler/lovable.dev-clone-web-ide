import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

  if (!proj.convexDeployUrl || !proj.convexDeployKey) {
    return NextResponse.json({ error: 'No Convex backend for this project' }, { status: 404 });
  }

  // The deploy key returned by Convex's create_deploy_key endpoint is an admin key —
  // it's already stored on the project at provisioning time.
  return NextResponse.json({
    deploymentUrl: proj.convexDeployUrl,
    deploymentName: proj.convexDeploymentId,
    adminKey: proj.convexDeployKey,
  });
}
