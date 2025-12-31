import { NextRequest, NextResponse } from 'next/server';
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
      hasOpenAIKey: Boolean(row?.openaiApiKey),
      hasAnthropicKey: Boolean(row?.anthropicApiKey),
      hasMoonshotKey: Boolean(row?.moonshotApiKey),
    });
  } catch (e) {
    console.error('GET /api/user-settings failed:', e);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { openaiApiKey, anthropicApiKey, moonshotApiKey } = body as {
      openaiApiKey?: string | null;
      anthropicApiKey?: string | null;
      moonshotApiKey?: string | null;
    };

    const db = getDb();
    const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));

    if (existing) {
      const [updated] = await db
        .update(userSettings)
        .set({
          openaiApiKey: openaiApiKey === undefined ? existing.openaiApiKey : openaiApiKey || null,
          anthropicApiKey: anthropicApiKey === undefined ? existing.anthropicApiKey : anthropicApiKey || null,
          moonshotApiKey: moonshotApiKey === undefined ? existing.moonshotApiKey : moonshotApiKey || null,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, userId))
        .returning();
      return NextResponse.json({ ok: true, hasOpenAIKey: Boolean(updated.openaiApiKey), hasAnthropicKey: Boolean(updated.anthropicApiKey), hasMoonshotKey: Boolean(updated.moonshotApiKey) });
    } else {
      const [created] = await db
        .insert(userSettings)
        .values({
          userId,
          openaiApiKey: openaiApiKey || null,
          anthropicApiKey: anthropicApiKey || null,
          moonshotApiKey: moonshotApiKey || null,
        })
        .returning();
      return NextResponse.json({ ok: true, hasOpenAIKey: Boolean(created.openaiApiKey), hasAnthropicKey: Boolean(created.anthropicApiKey), hasMoonshotKey: Boolean(created.moonshotApiKey) });
    }
  } catch (e) {
    console.error('POST /api/user-settings failed:', e);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

