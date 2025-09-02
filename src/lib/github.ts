import type { WebContainer } from '@webcontainer/api';

type RepoSpec = { owner: string; repo: string; ref?: string };

export async function downloadRepoToWebContainer(container: WebContainer, { owner, repo, ref = 'main' }: RepoSpec) {
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const treeRes = await fetch(treeUrl);
  if (!treeRes.ok) throw new Error(`Failed to fetch repo tree: ${treeRes.status}`);
  const treeJson = await treeRes.json();
  const files: { path: string; type: string }[] = treeJson?.tree ?? [];

  for (const entry of files) {
    if (entry.type !== 'blob') continue;
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${entry.path}`;
    const res = await fetch(rawUrl);
    if (!res.ok) continue;
    const content = await res.text();
    // Ensure directory exists
    const idx = entry.path.lastIndexOf('/');
    if (idx !== -1) {
      const dir = '/' + entry.path.slice(0, idx);
      await container.fs.mkdir(dir, { recursive: true }).catch(() => {});
    }
    await container.fs.writeFile('/' + entry.path, content);
  }
}

