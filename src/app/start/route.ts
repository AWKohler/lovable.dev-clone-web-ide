import { NextResponse } from 'next/server';
import { auth, redirectToSignIn } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';

export async function GET(request: Request) {
  const { userId } = await auth();
  const url = new URL(request.url);
  const prompt = url.searchParams.get('prompt')?.slice(0, 4000) ?? '';
  const visibility = url.searchParams.get('visibility') ?? 'public';

  if (!userId) {
    return redirectToSignIn({ returnBackUrl: request.url, signInUrl: '/sign-in' });
  }

  try {
    const db = getDb();
    const name = prompt?.trim() ? prompt.slice(0, 48) : 'New Project';
    const [project] = await db
      .insert(projects)
      .values({ name, userId })
      .returning();

    // Redirect to workspace and pass starter prompt for auto-run
    const workspaceUrl = new URL(`${url.origin}/workspace/${project.id}`);
    if (prompt) workspaceUrl.searchParams.set('prompt', prompt);
    if (visibility) workspaceUrl.searchParams.set('visibility', visibility);
    return NextResponse.redirect(workspaceUrl);
  } catch (err) {
    console.error('Failed to start project:', err);
    return NextResponse.redirect(new URL('/', request.url));
  }
}
