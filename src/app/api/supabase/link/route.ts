import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { supabaseLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSupabaseSession } from '@/lib/supabase-session';
import { SupabaseManagementAPI } from '@/lib/supabase-management-client';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ connected: false }, { status: 200 });
    const projectId = new URL(req.url).searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ connected: false }, { status: 200 });
    const db = getDb();
    const rows = await db.select().from(supabaseLinks).where(eq(supabaseLinks.projectId, projectId));
    const link = rows[0];
    if (!link) return NextResponse.json({ connected: false }, { status: 200 });

    let name: string | undefined;
    try {
      const session = await getSupabaseSession();
      if (session?.accessToken) {
        const api = new SupabaseManagementAPI(session.accessToken);
        const project = await api.getProject(link.supabaseProjectRef);
        name = project?.name;
      }
    } catch {}
    return NextResponse.json({ connected: true, ref: link.supabaseProjectRef, url: link.supabaseProjectUrl, name });
  } catch (e) {
    console.error('Get Supabase link failed', e);
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}

