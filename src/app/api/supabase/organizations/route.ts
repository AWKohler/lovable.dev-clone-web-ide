import { NextResponse } from 'next/server';
import { getSupabaseSession } from '@/lib/supabase-session';
import { SupabaseManagementAPI } from '@/lib/supabase-management-client';

export async function GET() {
  try {
    const session = await getSupabaseSession();
    if (!session?.accessToken) return NextResponse.json([], { status: 200 });
    const api = new SupabaseManagementAPI(session.accessToken);
    const orgs = await api.getOrganizations();
    return NextResponse.json(orgs);
  } catch (err) {
    console.error('Organizations fetch failed', err);
    return NextResponse.json({ error: 'Failed to load organizations' }, { status: 500 });
  }
}

