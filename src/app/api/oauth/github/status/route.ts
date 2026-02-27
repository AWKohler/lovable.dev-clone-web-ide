import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));

    return NextResponse.json({
      connected: Boolean(row?.githubAccessToken),
      username: row?.githubUsername ?? null,
      avatarUrl: row?.githubAvatarUrl ?? null,
    });
  } catch (e) {
    console.error('GitHub status check failed:', e);
    return NextResponse.json({ error: 'Failed to check GitHub status' }, { status: 500 });
  }
}
