import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

function base64URLEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+/g, '');
}

function sha256(input: string): Buffer {
  return crypto.createHash('sha256').update(input).digest();
}

export async function GET() {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.SUPABASE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Supabase OAuth not configured' }, { status: 500 });
  }

  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(sha256(codeVerifier));
  const cookieStore = await cookies();
  cookieStore.set('supabase_pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  const url = `https://api.supabase.com/v1/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(url);
}

