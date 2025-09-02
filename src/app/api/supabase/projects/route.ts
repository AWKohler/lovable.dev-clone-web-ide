import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseSession } from '@/lib/supabase-session';
import { SupabaseManagementAPI } from '@/lib/supabase-management-client';

export async function GET(req: NextRequest) {
  try {
    const session = await getSupabaseSession();
    if (!session?.accessToken) return NextResponse.json([]);
    const api = new SupabaseManagementAPI(session.accessToken);
    const all = await api.getProjects();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    const filtered = orgId ? (Array.isArray(all) ? all.filter((p: Record<string, unknown>) => p.organization_id === orgId) : all) : all;
    return NextResponse.json(filtered);
  } catch (err) {
    console.error('Projects fetch failed', err);
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
  }
}

