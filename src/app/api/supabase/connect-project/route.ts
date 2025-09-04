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

    let anonKey: string | null = null;
    let projectUrl: string | undefined = undefined;
    if (session?.accessToken) {
      try {
        const api = new SupabaseManagementAPI(session.accessToken);
        const [keys, details] = await Promise.all([
          api.getProjectApiKeys(projectRef),
          api.getProject(projectRef),
        ]);
        anonKey = Array.isArray(keys)
          ? (keys.find((k: Record<string, unknown>) => (k as any).name === 'anon')?.api_key as string | undefined) ?? null
          : null;
        projectUrl = (details as unknown as { ref?: string })?.ref
          ? `https://${(details as unknown as { ref?: string }).ref}.supabase.co`
          : undefined;
      } catch (e) {
        console.warn('Supabase Management API unavailable; linking without keys:', e);
      }
    }
    if (!projectUrl) {
      // Fallback compute from given ref
      projectUrl = `https://${projectRef}.supabase.co`;
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
