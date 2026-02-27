import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/db';
import { projects, userSettings, pendingGitCommits } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface GitHubBlob {
  sha: string;
  url: string;
}

interface GitHubTree {
  sha: string;
  url: string;
}

interface GitHubCommit {
  sha: string;
  html_url: string;
}

async function ghFetch(
  path: string,
  token: string,
  method = 'GET',
  body?: unknown
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const [proj] = await db.select().from(projects).where(eq(projects.id, id));
    if (!proj || proj.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!proj.githubRepoOwner || !proj.githubRepoName) {
      return NextResponse.json({ error: 'No GitHub repo connected' }, { status: 400 });
    }

    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    if (!settings?.githubAccessToken) {
      return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 });
    }

    const token = settings.githubAccessToken;
    const repoPath = `/repos/${proj.githubRepoOwner}/${proj.githubRepoName}`;
    const branch = proj.githubDefaultBranch ?? 'main';

    // Get all pending commits in order
    const pending = await db
      .select()
      .from(pendingGitCommits)
      .where(eq(pendingGitCommits.projectId, id))
      .orderBy(asc(pendingGitCommits.createdAt));

    if (pending.length === 0) {
      return NextResponse.json({ error: 'No pending commits to push' }, { status: 400 });
    }

    // Get current HEAD SHA
    const refRes = await ghFetch(`${repoPath}/git/ref/heads/${branch}`, token);
    let currentSha: string;

    if (refRes.ok) {
      const refData = await refRes.json() as { object: { sha: string } };
      currentSha = refData.object.sha;
    } else if (refRes.status === 404) {
      // Branch doesn't exist yet — check if repo is empty
      // Try to get default branch from repo info
      const repoRes = await ghFetch(repoPath, token);
      if (!repoRes.ok) {
        return NextResponse.json({ error: 'Failed to access repository' }, { status: 500 });
      }
      // Repo might be empty; we'll create the first commit without a parent
      currentSha = '';
    } else {
      return NextResponse.json({ error: 'Failed to get branch ref' }, { status: 500 });
    }

    let latestSha = currentSha;

    // Apply each pending commit sequentially
    for (const commit of pending) {
      const snapshot = commit.filesSnapshot as Record<string, string | null>;

      // Build tree entries: create blobs for each file
      const treeEntries: Array<{
        path: string;
        mode: string;
        type: string;
        sha?: string | null;
      }> = [];

      for (const [filePath, content] of Object.entries(snapshot)) {
        const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

        if (content === null) {
          // Deleted file
          treeEntries.push({
            path: cleanPath,
            mode: '100644',
            type: 'blob',
            sha: null,
          });
        } else {
          // Create blob
          const blobRes = await ghFetch(`${repoPath}/git/blobs`, token, 'POST', {
            content: Buffer.from(content, 'utf-8').toString('base64'),
            encoding: 'base64',
          });

          if (!blobRes.ok) {
            console.error('Failed to create blob for', cleanPath);
            continue;
          }

          const blob = await blobRes.json() as GitHubBlob;
          treeEntries.push({
            path: cleanPath,
            mode: '100644',
            type: 'blob',
            sha: blob.sha,
          });
        }
      }

      if (treeEntries.length === 0) continue;

      // Create tree
      const treeBody: { base_tree?: string; tree: typeof treeEntries } = {
        tree: treeEntries,
      };
      if (latestSha) treeBody.base_tree = latestSha;

      const treeRes = await ghFetch(`${repoPath}/git/trees`, token, 'POST', treeBody);
      if (!treeRes.ok) {
        const err = await treeRes.text();
        console.error('Failed to create tree:', err);
        return NextResponse.json({ error: 'Failed to create git tree' }, { status: 500 });
      }

      const tree = await treeRes.json() as GitHubTree;

      // Create commit
      const commitBody: {
        message: string;
        tree: string;
        parents?: string[];
      } = {
        message: commit.message,
        tree: tree.sha,
      };
      if (latestSha) commitBody.parents = [latestSha];

      const commitRes = await ghFetch(`${repoPath}/git/commits`, token, 'POST', commitBody);
      if (!commitRes.ok) {
        const err = await commitRes.text();
        console.error('Failed to create commit:', err);
        return NextResponse.json({ error: 'Failed to create git commit' }, { status: 500 });
      }

      const newCommit = await commitRes.json() as GitHubCommit;
      latestSha = newCommit.sha;
    }

    // Update the branch ref
    if (latestSha && latestSha !== currentSha) {
      const updateRefRes = await ghFetch(
        `${repoPath}/git/refs/heads/${branch}`,
        token,
        'PATCH',
        { sha: latestSha, force: false }
      );

      if (!updateRefRes.ok && updateRefRes.status !== 422) {
        // Try to create the ref if it doesn't exist
        const createRefRes = await ghFetch(`${repoPath}/git/refs`, token, 'POST', {
          ref: `refs/heads/${branch}`,
          sha: latestSha,
        });
        if (!createRefRes.ok) {
          return NextResponse.json({ error: 'Failed to update branch ref' }, { status: 500 });
        }
      }
    }

    // Update project with new SHA and clear pending commits
    await db
      .update(projects)
      .set({ githubLastPushedSha: latestSha, updatedAt: new Date() })
      .where(eq(projects.id, id));

    await db.delete(pendingGitCommits).where(eq(pendingGitCommits.projectId, id));

    return NextResponse.json({
      ok: true,
      pushedCommits: pending.length,
      newSha: latestSha,
      repoUrl: `https://github.com/${proj.githubRepoOwner}/${proj.githubRepoName}`,
    });
  } catch (e) {
    console.error('Git push failed:', e);
    return NextResponse.json({ error: 'Failed to push to GitHub' }, { status: 500 });
  }
}
