import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';

export async function GET(request: Request) {
  const { userId, redirectToSignIn } = await auth();
  const url = new URL(request.url);
  const prompt = url.searchParams.get('prompt')?.slice(0, 4000) ?? '';
  const visibility = url.searchParams.get('visibility') ?? 'public';
  const platform = (url.searchParams.get('platform') === 'mobile' ? 'mobile' : 'web') as 'web' | 'mobile';
  const supabaseRef = url.searchParams.get('supabaseRef');

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }

  try {
    const db = getDb();
    const name = prompt?.trim() ? prompt.slice(0, 48) : 'New Project';
    const [project] = await db
      .insert(projects)
      .values({ name, userId, platform })
      .returning();

    // Optionally link Supabase project if provided and user has a Supabase session
    if (supabaseRef) {
      try {
        await fetch(`${url.origin}/api/supabase/connect-project`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Pass through cookies for Supabase session
          credentials: 'include' as RequestCredentials,
          body: JSON.stringify({ projectId: project.id, projectRef: supabaseRef }),
        });
      } catch (e) {
        console.warn('Failed to link Supabase during start:', e);
      }
    }

    // Redirect to workspace and pass starter prompt for auto-run
    const workspaceUrl = new URL(`${url.origin}/workspace/${project.id}`);
    if (prompt) workspaceUrl.searchParams.set('prompt', prompt);
    workspaceUrl.searchParams.set('platform', platform);
    if (visibility) workspaceUrl.searchParams.set('visibility', visibility);
    return NextResponse.redirect(workspaceUrl);
  } catch (err) {
    console.error('Failed to start project:', err);
    return NextResponse.redirect(new URL('/', request.url));
  }
}
