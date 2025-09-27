import { WebContainer } from '@webcontainer/api';
import { WebContainerManager } from '@/lib/webcontainer';
import { parseSearchReplaceBlocks, applyBlocksToContent } from './diff';
import { DevServerManager } from '@/lib/dev-server';

export type GrepResult = { filePath: string; lineNumber: number; lineContent: string };

export const WebContainerAgent = {
  async getContainer(): Promise<WebContainer> {
    return WebContainerManager.getInstance();
  },

  async listFiles(path: string, recursive = false): Promise<string> {
    const container = await this.getContainer();
    const lines: string[] = [];

    async function walk(dir: string, prefix = ''): Promise<void> {
      const entries = await container.fs.readdir(dir, { withFileTypes: true });
      type MinimalDirent = { name: string; isDirectory(): boolean };
      const sorted = (entries as unknown as MinimalDirent[]).slice().sort((a, b) => {
        const aDir = a.isDirectory();
        const bDir = b.isDirectory();
        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;
        return a.name.localeCompare(b.name);
      });
      for (const entry of sorted) {
        const full = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
        lines.push(`${prefix}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
        if (recursive && entry.isDirectory()) {
          await walk(full, prefix + '  ');
        }
      }
    }

    await walk(path);
    return lines.join('\n');
  },

  async readFile(path: string): Promise<string> {
    const container = await this.getContainer();
    return container.fs.readFile(path, 'utf8');
  },

  async createFile(filePath: string): Promise<
    | { ok: true; message: string; path: string }
    | { ok: false; message: string; path?: string }
  > {
    const container = await this.getContainer();
    try {
      let path = String(filePath || '').trim();
      if (!path) return { ok: false, message: 'Path is required' };
      // Normalize to absolute path, collapse duplicate slashes, remove trailing slash
      if (!path.startsWith('/')) path = '/' + path;
      path = path.replace(/\/+/g, '/');
      if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
      if (path === '/' || path.endsWith('/')) {
        return { ok: false, message: 'Invalid file path', path };
      }

      // Refuse to overwrite existing files/directories
      // Check if a directory exists at this path
      try {
        await container.fs.readdir(path);
        return { ok: false, message: 'A directory with this name already exists', path };
      } catch (err) {
        const msg = String(err ?? '');
        // If error is not ENOENT or ENOTDIR, proceed to file check
      }
      // Check if a file exists at this path
      try {
        await container.fs.readFile(path, 'utf8');
        return { ok: false, message: 'File already exists', path };
      } catch (err) {
        const msg = String(err ?? '');
        if (!/ENOENT/.test(msg)) {
          // Unknown error (e.g., permission), surface it
          throw err;
        }
      }

      // Ensure parent directory exists
      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash > 0 ? path.slice(0, lastSlash) || '/' : '/';
      if (dir && dir !== '/') {
        try {
          await container.fs.mkdir(dir, { recursive: true });
        } catch {}
      }

      // Create an empty file
      await container.fs.writeFile(path, '');
      await WebContainerManager.saveProjectState('default');
      return { ok: true, message: `Created file ${path}`, path };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }
  },

  async applyDiff(filePath: string, diff: string): Promise<{ applied: number; failures: number } & (
    | { ok: true; message: string }
    | { ok: false; message: string }
  )> {
    const container = await this.getContainer();
    // Read existing content; if file doesn't exist, treat as empty so we can create it
    let original = '';
    try {
      original = await container.fs.readFile(filePath, 'utf8');
    } catch (err) {
      const message = String(err ?? '');
      if (!/ENOENT/.test(message)) {
        throw err;
      }
      // ENOENT -> new file creation path; proceed with empty original
      original = '';
    }
    const blocks = parseSearchReplaceBlocks(diff);
    if (blocks.length === 0) {
      return { ok: false, applied: 0, failures: 0, message: 'No SEARCH/REPLACE blocks found in diff.' };
    }
    const result = applyBlocksToContent(original, blocks);
    if (result.applied === 0) {
      // return preview of first failure to help LLM self-correct
      const preview = result.failures[0]?.preview ?? 'No preview';
      return {
        ok: false,
        applied: 0,
        failures: blocks.length,
        message: `No blocks applied. Ensure SEARCH matches exact current file. Preview near likely location:\n${preview}`,
      };
    }
    // Ensure parent directory exists for new files
    const lastSlash = filePath.lastIndexOf('/');
    const dir = lastSlash > 0 ? filePath.slice(0, lastSlash) || '/' : '/';
    try {
      if (dir && dir !== '/') {
        await container.fs.mkdir(dir, { recursive: true });
      }
    } catch {}

    await container.fs.writeFile(filePath, result.content);
    await WebContainerManager.saveProjectState('default');
    return {
      ok: true,
      applied: result.applied,
      failures: result.failures.length,
      message: `Applied ${result.applied} change(s), ${result.failures.length} failed.`,
    };
  },

  async *searchFiles(startPath: string, query: string): AsyncGenerator<GrepResult> {
    const container = await this.getContainer();
    const queue: string[] = [startPath];
    const regex = new RegExp(query);

    while (queue.length) {
      const dir = queue.shift()!;
      const entries = await container.fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (full.includes('/node_modules') || full.includes('/.git')) continue;
          queue.push(full);
        } else {
          try {
            const content = await container.fs.readFile(full, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                yield { filePath: full, lineNumber: i + 1, lineContent: lines[i] };
              }
            }
          } catch {
            // ignore unreadable files
          }
        }
      }
    }
  },

  async *executeCommand(command: string, args: string[]): AsyncGenerator<string> {
    // Prevent starting the dev server directly via commands; require dedicated tool
    const joined = [command, ...(args || [])].join(' ').toLowerCase();
    const forbidden = [
      'pnpm dev',
      'npm run dev',
      'vite',
      'expo start',
      'pnpm exec expo start',
      'npx expo start',
    ];
    for (const pat of forbidden) {
      if (joined.includes(pat)) {
        yield 'Starting the dev server via shell is disabled. Use the startDevServer tool instead.';
        return;
      }
    }
    // Ensure completion even for commands that produce no output (e.g., rmdir),
    // and guard against hanging streams by using a timeout and cancel.
    const container = await this.getContainer();
    const proc = await container.spawn(command, args);

    const reader = proc.output.getReader();
    let combined = '';
    let reading = true;

    // Drain output concurrently while we wait for process exit
    const drain = (async () => {
      try {
        while (reading) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) combined += value;
        }
      } catch {
        // ignore
      } finally {
        try { reader.releaseLock(); } catch {}
      }
    })();

    // Add a max timeout in case a command never exits cleanly (e.g., spinner processes)
    const MAX_MS = 120_000; // 2 minutes default safety
    const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(-1), MAX_MS));

    const exitCode = await Promise.race([proc.exit, timeout]);
    if (exitCode === -1) {
      // Timed out; try to stop the process and finish draining
      try { proc.kill(); } catch {}
    }

    // Give a short grace period for any final buffered output, then cancel reader
    await new Promise((r) => setTimeout(r, 150));
    reading = false;
    try { await reader.cancel(); } catch {}
    await drain; // Ensure the drain task finishes

    // Yield once with the full output so tool call can complete
    const final = combined.trim().length > 0 ? combined : `Command exited with code ${exitCode}`;
    yield final;
  },

  async startDevServer(): Promise<{ ok: boolean; message: string; alreadyRunning?: boolean }> {
    try {
      return await DevServerManager.start();
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async getDevServerLog(linesBack: number): Promise<{ ok: boolean; message: string; log?: string }> {
    // If server not running, return message instructing to start
    if (!(await DevServerManager.isRunning())) {
      return {
        ok: false,
        message: 'Dev server is not running. Use startDevServer tool to start it.',
      };
    }
    return DevServerManager.getLog(linesBack);
  },

  async stopDevServer(): Promise<{ ok: boolean; message: string; alreadyStopped?: boolean }> {
    try {
      return await DevServerManager.stop();
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  async isDevServerRunning(): Promise<boolean> {
    try {
      return await DevServerManager.isRunning();
    } catch {
      return false;
    }
  },
};
