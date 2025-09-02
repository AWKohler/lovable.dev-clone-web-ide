import { cookies } from 'next/headers';
import { decryptCookie, type SupabaseSession } from '@/lib/secure-cookies';

export async function getSupabaseSession(): Promise<SupabaseSession | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get('supabase-session')?.value;
  return decryptCookie<SupabaseSession>(val);
}

