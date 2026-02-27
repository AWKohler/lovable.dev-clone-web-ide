import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const REDIRECT_URI = `${APP_URL}/api/oauth/github/callback`;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(`${APP_URL}/sign-in`);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  // Decode returnTo from state if present
  let returnTo = '/projects';
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8')) as { returnTo?: string };
      if (decoded.returnTo) returnTo = decoded.returnTo;
    } catch { /* use default */ }
  }

  if (!code) {
    return NextResponse.redirect(`${APP_URL}${returnTo}?github_error=no_code`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
      console.error('GitHub token exchange failed:', tokenData);
      return NextResponse.redirect(`${APP_URL}${returnTo}?github_error=token_exchange`);
    }

    // Fetch GitHub user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    const ghUser = await userRes.json() as { login: string; avatar_url: string };

    // Upsert into userSettings
    const db = getDb();
    const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));

    if (existing) {
      await db
        .update(userSettings)
        .set({
          githubAccessToken: tokenData.access_token,
          githubUsername: ghUser.login,
          githubAvatarUrl: ghUser.avatar_url,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values({
        userId,
        githubAccessToken: tokenData.access_token,
        githubUsername: ghUser.login,
        githubAvatarUrl: ghUser.avatar_url,
      });
    }

    return NextResponse.redirect(`${APP_URL}${returnTo}?github_connected=1`);
  } catch (e) {
    console.error('GitHub OAuth callback failed:', e);
    return NextResponse.redirect(`${APP_URL}${returnTo}?github_error=server`);
  }
}
