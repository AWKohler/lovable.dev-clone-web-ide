import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { supabaseLinks } from '@/db/schema';
import { getSupabaseSession } from '@/lib/supabase-session';
import { SupabaseManagementAPI } from '@/lib/supabase-management-client';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await getSupabaseSession();
    if (!session?.accessToken) return NextResponse.json({ error: 'Not connected to Supabase' }, { status: 400 });

    const body = await req.json();
    const { projectId, projectRef, organizationId, organizationName } = body as {
      projectId: string;
      projectRef: string;
      organizationId?: string;
      organizationName?: string;
    };
    if (!projectId || !projectRef) {
      return NextResponse.json({ error: 'Missing projectId or projectRef' }, { status: 400 });
    }

    const api = new SupabaseManagementAPI(session.accessToken);
    const [keys, details] = await Promise.all([
      api.getProjectApiKeys(projectRef),
      api.getProject(projectRef),
    ]);

    const anonKey = Array.isArray(keys) ? keys.find((k: Record<string, unknown>) => k.name === 'anon')?.api_key as string : undefined;
    const projectUrl = details?.ref ? `https://${details.ref}.supabase.co` : undefined;
    if (!anonKey || !projectUrl) {
      return NextResponse.json({ error: 'Failed to retrieve project credentials' }, { status: 500 });
    }

    const db = getDb();
    // Upsert by projectId
    const existing = await db.select().from(supabaseLinks).where(eq(supabaseLinks.projectId, projectId));
    if (existing.length > 0) {
      await db
        .update(supabaseLinks)
        .set({
          userId,
          organizationId: organizationId ?? null,
          organizationName: organizationName ?? null,
          supabaseProjectRef: projectRef,
          supabaseProjectUrl: projectUrl,
          supabaseAnonKey: anonKey,
        })
        .where(eq(supabaseLinks.projectId, projectId));
    } else {
      await db.insert(supabaseLinks).values({
        projectId,
        userId,
        organizationId: organizationId ?? null,
        organizationName: organizationName ?? null,
        supabaseProjectRef: projectRef,
        supabaseProjectUrl: projectUrl,
        supabaseAnonKey: anonKey,
      });
    }

    return NextResponse.json({ ok: true, projectUrl });
  } catch (err) {
    console.error('Connect Supabase project failed:', err);
    return NextResponse.json({ error: 'Failed to connect Supabase project' }, { status: 500 });
  }
}

