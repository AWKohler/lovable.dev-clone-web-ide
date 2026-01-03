import { WebContainer } from '@webcontainer/api';
import { WebContainerManager } from '@/lib/webcontainer';
import { applyDiff, type DiffResult, type FailedBlock } from './diff';
import { DevServerManager } from '@/lib/dev-server';

export type GrepResult = { filePath: string; lineNumber: number; lineContent: string };

// ============================================================================
// Diff Result Types for Agent Communication
// ============================================================================

export type ApplyDiffResult = {
  ok: boolean;
  applied: number;
  failed: number;
  message: string;
  // Detailed error info for failed blocks
  failedBlocks?: FailedBlock[];
  // Hint for the agent on what to do next
  suggestion?: string;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a comprehensive error message from a DiffResult.
 * This message is designed to help the LLM understand what went wrong
 * and how to fix it.
 */
function buildDiffErrorMessage(diffResult: DiffResult, filePath: string): string {
  const parts: string[] = [];

  if (diffResult.error) {
    parts.push(diffResult.error);
  } else if (diffResult.failedBlocks.length > 0) {
    parts.push(`Failed to apply ${diffResult.failedBlocks.length} diff block(s) to ${filePath}.`);

    for (const failed of diffResult.failedBlocks) {
      parts.push(`\n[Block ${failed.index + 1}] ${failed.reason}`);

      if (failed.bestMatch) {
        parts.push(`  Best match found at line ${failed.bestMatch.lineNumber} (${Math.floor(failed.bestMatch.similarity * 100)}% similar):`);
        parts.push(`  File content: "${failed.bestMatch.content.slice(0, 80).replace(/\n/g, '\\n')}..."`);
      }

      parts.push(`  Searched for: "${failed.searchPreview.slice(0, 80).replace(/\n/g, '\\n')}..."`);
    }
  }

  return parts.join('\n');
}

/**
 * Build a suggestion for the agent based on the diff result.
 */
function buildDiffSuggestion(diffResult: DiffResult): string {
  if (diffResult.success && diffResult.failedBlocks.length === 0) {
    return '';
  }

  const suggestions: string[] = [];

  // Check if there were partial matches
  const hasPartialMatches = diffResult.failedBlocks.some(
    fb => fb.bestMatch && fb.bestMatch.similarity > 0.5
  );

  if (hasPartialMatches) {
    suggestions.push('The file content has changed since you last read it. Use readFile to get the current content.');
  } else {
    suggestions.push('No similar content was found. Double-check the file path and use readFile to verify the file content.');
  }

  if (diffResult.failedBlocks.some(fb => fb.searchPreview.includes('  '))) {
    suggestions.push('Watch for indentation differences - tabs vs spaces or extra/missing spaces.');
  }

  return suggestions.join(' ');
}

// ============================================================================
// WebContainer Agent
// ============================================================================

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
      } catch {
        // Expected - directory doesn't exist
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
        } catch {
          // Ignore mkdir errors
        }
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

  async applyDiff(filePath: string, diff: string): Promise<ApplyDiffResult> {
    const container = await this.getContainer();

    // Read existing content; if file doesn't exist, treat as empty so we can create it
    let original = '';
    let isNewFile = false;

    try {
      original = await container.fs.readFile(filePath, 'utf8');
    } catch (err) {
      const message = String(err ?? '');
      if (!/ENOENT/.test(message)) {
        return {
          ok: false,
          applied: 0,
          failed: 0,
          message: `Error reading file: ${message}`,
        };
      }
      // ENOENT -> new file creation path
      isNewFile = true;
      original = '';
    }

    // Apply the diff with fuzzy matching
    const result = applyDiff(original, diff);

    // Build response based on result
    if (!result.success || result.appliedCount === 0) {
      const errorMessage = buildDiffErrorMessage(result, filePath);
      const suggestion = buildDiffSuggestion(result);

      return {
        ok: false,
        applied: result.appliedCount,
        failed: result.failedBlocks.length,
        message: errorMessage,
        failedBlocks: result.failedBlocks,
        suggestion,
      };
    }

    // We have at least some successful applications
    // Ensure parent directory exists for new files
    if (isNewFile) {
      const lastSlash = filePath.lastIndexOf('/');
      const dir = lastSlash > 0 ? filePath.slice(0, lastSlash) || '/' : '/';
      try {
        if (dir && dir !== '/') {
          await container.fs.mkdir(dir, { recursive: true });
        }
      } catch {
        // Ignore mkdir errors
      }
    }

    // Write the file
    await container.fs.writeFile(filePath, result.content!);
    await WebContainerManager.saveProjectState('default');

    // Build success message
    const totalBlocks = result.appliedCount + result.failedBlocks.length;
    let message: string;

    if (result.failedBlocks.length === 0) {
      message = `Successfully applied ${result.appliedCount} change(s) to ${filePath}.`;
    } else {
      message = `Applied ${result.appliedCount}/${totalBlocks} changes to ${filePath}. ` +
        `${result.failedBlocks.length} block(s) failed - use readFile to check current content.`;
    }

    const response: ApplyDiffResult = {
      ok: true,
      applied: result.appliedCount,
      failed: result.failedBlocks.length,
      message,
    };

    // Include failure details if there were partial failures
    if (result.failedBlocks.length > 0) {
      response.failedBlocks = result.failedBlocks;
      response.suggestion = buildDiffSuggestion(result);
    }

    return response;
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
