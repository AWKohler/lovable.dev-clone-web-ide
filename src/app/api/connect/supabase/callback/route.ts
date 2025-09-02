import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { encryptCookie, type SupabaseSession } from '@/lib/secure-cookies';

export async function GET(request: NextRequest) {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.SUPABASE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Supabase OAuth not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const cookieStore = await cookies();
  const verifier = cookieStore.get('supabase_pkce_verifier')?.value;
  if (!code || !verifier) {
    return NextResponse.redirect(new URL('/?supabase=error', request.url));
  }
  cookieStore.delete('supabase_pkce_verifier');

  const tokenUrl = 'https://api.supabase.com/v1/oauth/token';
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });

  try {
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!resp.ok) {
      return NextResponse.redirect(new URL('/?supabase=error', request.url));
    }
    const tokens = await resp.json();
    const session: SupabaseSession = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    };
    const sealed = await encryptCookie(session);
    const res = NextResponse.redirect(new URL('/?supabase=connected', request.url));
    res.cookies.set('supabase-session', sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  } catch (err) {
    console.error('Supabase callback error', err);
    return NextResponse.redirect(new URL('/?supabase=error', request.url));
  }
}

