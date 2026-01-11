import { WebContainer } from '@webcontainer/api';
import { WebContainerManager } from '@/lib/webcontainer';
import { applyDiff, type DiffResult, type FailedBlock } from './diff';
import { DevServerManager } from '@/lib/dev-server';
import { sanitizeForLLM } from '@/lib/output-sanitizer';

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
 * Generic timeout wrapper for async operations
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Operation timed out after ${timeoutMs}ms: ${operation}`)),
      timeoutMs
    )
  );
  return Promise.race([promise, timeout]);
}

/**
 * Safe error message extraction
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Normalize file paths to project-relative format
 * Strips WebContainer internal paths and ensures paths start with /
 *
 * Examples:
 *   /home/xyz123/src/App.tsx -> /src/App.tsx
 *   src/App.tsx -> /src/App.tsx
 *   /src/App.tsx -> /src/App.tsx (unchanged)
 */
function normalizePath(path: string): string {
  if (!path || typeof path !== 'string') return path;

  let normalized = path.trim();

  // Strip WebContainer internal paths like /home/projectid/...
  // Match pattern: /home/[alphanumeric-_]/...
  const internalPathMatch = normalized.match(/^\/home\/[a-z0-9_-]+\/(.*)/i);
  if (internalPathMatch && internalPathMatch[1]) {
    normalized = '/' + internalPathMatch[1];
  }

  // Ensure path starts with / (convert relative to absolute)
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  // Remove duplicate slashes
  normalized = normalized.replace(/\/+/g, '/');

  return normalized;
}

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
    try {
      // Normalize the path to handle any incorrect formatting
      path = normalizePath(path);

      const container = await this.getContainer();
      const lines: string[] = [];
      let fileCount = 0;
      let dirCount = 0;

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

          if (entry.isDirectory()) {
            dirCount++;
            if (recursive) {
              await walk(full, prefix + '  ');
            }
          } else {
            fileCount++;
          }
        }
      }

      // Generous 60 second timeout for large directory trees
      await withTimeout(walk(path), 60000, `listFiles(${path})`);

      const summary = `\n\nTotal: ${fileCount} file(s), ${dirCount} director${dirCount === 1 ? 'y' : 'ies'}`;
      return lines.join('\n') + summary;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      return `❌ Error listing files at "${path}": ${errorMsg}\n\nThis could mean:\n- The path doesn't exist\n- You don't have permission to read it\n- The operation timed out (took longer than 60 seconds)\n\nSuggestion: Try listing a more specific subdirectory or use a non-recursive listing.`;
    }
  },

  async readFile(path: string): Promise<string> {
    try {
      // Normalize the path to handle any incorrect formatting
      path = normalizePath(path);

      const container = await this.getContainer();

      // Generous 30 second timeout for large files
      const content = await withTimeout(
        container.fs.readFile(path, 'utf8'),
        30000,
        `readFile(${path})`
      );

      const lines = content.split('\n').length;
      const size = new Blob([content]).size;
      const sizeKB = (size / 1024).toFixed(2);

      // Add helpful metadata at the end
      return `${content}\n\n📊 File info: ${lines} lines, ${sizeKB} KB`;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      return `❌ Error reading file "${path}": ${errorMsg}\n\nPossible reasons:\n- File doesn't exist (use listFiles to verify the path)\n- File is binary or unreadable as text\n- File is too large and timed out (took longer than 30 seconds)\n- Permission denied\n\nSuggestion: Double-check the file path with listFiles first.`;
    }
  },

  async writeFile(filePath: string, content: string): Promise<
    | { ok: true; message: string; path: string; created: boolean; size?: string }
    | { ok: false; message: string; path?: string; suggestion?: string }
  > {
    try {
      const container = await this.getContainer();
      let path = String(filePath || '').trim();

      // Validate path
      if (!path) {
        return {
          ok: false,
          message: 'Path is required',
          suggestion: 'Provide a valid file path like "/src/App.tsx"',
        };
      }

      // Normalize the path to handle any incorrect formatting
      path = normalizePath(path);

      // Remove trailing slash if present (except for root)
      if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
      if (path === '/' || path.endsWith('/')) {
        return {
          ok: false,
          message: 'Invalid file path',
          path,
          suggestion: 'Provide a complete file path including filename, not a directory path',
        };
      }

      // Check if a directory exists at this path (30 second timeout)
      try {
        await withTimeout(container.fs.readdir(path), 30000, `readdir check for ${path}`);
        return {
          ok: false,
          message: 'A directory with this name already exists',
          path,
          suggestion: 'Choose a different name or delete the directory first',
        };
      } catch (err) {
        // Expected - directory doesn't exist OR path is a file, continue
        const errMsg = getErrorMessage(err);
        if (!errMsg.includes('ENOENT') && !errMsg.includes('ENOTDIR') && !errMsg.includes('timed out')) {
          throw err; // Unexpected error
        }
      }

      // Check if file already exists (to determine created vs overwritten)
      let isNewFile = false;
      try {
        await withTimeout(container.fs.readFile(path, 'utf8'), 30000, `read check for ${path}`);
      } catch (err) {
        const msg = getErrorMessage(err);
        if (msg.includes('ENOENT')) {
          isNewFile = true;
        } else if (msg.includes('ENOTDIR')) {
          // Path contains a file component where a directory is expected
          isNewFile = true;
        } else if (msg.includes('timed out')) {
          // File might be huge, treat as existing
          isNewFile = false;
        } else {
          // Unknown error (e.g., permission), surface it
          throw err;
        }
      }

      // Ensure parent directory exists
      const lastSlash = path.lastIndexOf('/');
      const dir = lastSlash > 0 ? path.slice(0, lastSlash) || '/' : '/';
      if (dir && dir !== '/') {
        try {
          await withTimeout(
            container.fs.mkdir(dir, { recursive: true }),
            30000,
            `mkdir for ${dir}`
          );
        } catch (err) {
          const errMsg = getErrorMessage(err);
          // Only ignore EEXIST errors
          if (!errMsg.includes('EEXIST') && !errMsg.includes('already exists')) {
            const suggestion = errMsg.includes('ENOTDIR')
              ? 'A file exists where a directory is expected in the path. Check the path structure.'
              : 'Check if the parent path is valid and you have permissions';
            return {
              ok: false,
              message: `Failed to create parent directory: ${errMsg}`,
              path,
              suggestion,
            };
          }
        }
      }

      // Write the file with content (30 second timeout for large files)
      await withTimeout(
        container.fs.writeFile(path, content),
        30000,
        `writeFile for ${path}`
      );

      // Save project state (10 second timeout)
      try {
        await withTimeout(
          WebContainerManager.saveProjectState('default'),
          10000,
          'saveProjectState'
        );
      } catch {
        // Non-fatal, log but continue
      }

      const size = new Blob([content]).size;
      const sizeKB = (size / 1024).toFixed(2);
      const lines = content.split('\n').length;
      const action = isNewFile ? '✅ Created' : '✏️  Overwrote';

      return {
        ok: true,
        message: `${action} file ${path} (${lines} lines, ${sizeKB} KB)`,
        path,
        created: isNewFile,
        size: `${sizeKB} KB`,
      };
    } catch (err) {
      const message = getErrorMessage(err);
      return {
        ok: false,
        message: `Error writing file: ${message}`,
        path: filePath,
        suggestion: 'Check the file path, ensure parent directories exist, and verify you have write permissions',
      };
    }
  },

  async applyDiff(filePath: string, diff: string): Promise<ApplyDiffResult> {
    try {
      // Normalize the path to handle any incorrect formatting
      filePath = normalizePath(filePath);

      const container = await this.getContainer();

      // Read existing content; if file doesn't exist or is empty, reject and suggest writeFile
      let original = '';
      let fileExists = true;

      try {
        // 30 second timeout for reading file
        original = await withTimeout(
          container.fs.readFile(filePath, 'utf8'),
          30000,
          `readFile for applyDiff(${filePath})`
        );
      } catch (err) {
        const message = getErrorMessage(err);
        if (message.includes('ENOENT')) {
          // ENOENT -> file doesn't exist
          fileExists = false;
          original = '';
        } else {
          return {
            ok: false,
            applied: 0,
            failed: 0,
            message: `❌ Error reading file: ${message}`,
            suggestion: 'Check if the file path is correct and the file is readable',
          };
        }
      }

      // Reject diffing into empty or non-existent files
      if (original.trim() === '') {
        const reason = !fileExists
          ? `File "${filePath}" does not exist.`
          : `File "${filePath}" is empty.`;
        return {
          ok: false,
          applied: 0,
          failed: 0,
          message: `❌ ${reason} Cannot apply diff to an empty file. Use the writeFile tool instead to create the file with content directly.`,
          suggestion: 'Use writeFile tool to create the file with the desired content.',
        };
      }

      // Apply the diff with fuzzy matching (60 second timeout for large diffs)
      const result = await withTimeout(
        Promise.resolve(applyDiff(original, diff)),
        60000,
        `applyDiff processing for ${filePath}`
      );

      // Build response based on result
      if (!result.success || result.appliedCount === 0) {
        const errorMessage = buildDiffErrorMessage(result, filePath);
        const suggestion = buildDiffSuggestion(result);

        return {
          ok: false,
          applied: result.appliedCount,
          failed: result.failedBlocks.length,
          message: `❌ ${errorMessage}`,
          failedBlocks: result.failedBlocks,
          suggestion,
        };
      }

      // We have at least some successful applications
      // Write the file (30 second timeout)
      await withTimeout(
        container.fs.writeFile(filePath, result.content!),
        30000,
        `writeFile after applyDiff(${filePath})`
      );

      // Save project state (10 second timeout, non-fatal)
      try {
        await withTimeout(
          WebContainerManager.saveProjectState('default'),
          10000,
          'saveProjectState after applyDiff'
        );
      } catch {
        // Non-fatal, continue
      }

      // Build success message
      const totalBlocks = result.appliedCount + result.failedBlocks.length;
      let message: string;

      if (result.failedBlocks.length === 0) {
        message = `✅ Successfully applied ${result.appliedCount} change(s) to ${filePath}.`;
      } else {
        message = `⚠️  Applied ${result.appliedCount}/${totalBlocks} changes to ${filePath}. ` +
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
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      return {
        ok: false,
        applied: 0,
        failed: 0,
        message: `❌ Unexpected error in applyDiff: ${errorMsg}`,
        suggestion: 'This might be a timeout or system error. Try using writeFile to rewrite the entire file instead.',
      };
    }
  },

  async *searchFiles(startPath: string, query: string): AsyncGenerator<GrepResult | { error: string; progress: string }> {
    try {
      // Normalize the path to handle any incorrect formatting
      startPath = normalizePath(startPath);

      const container = await this.getContainer();
      const queue: string[] = [startPath];
      let regex: RegExp;

      // Validate regex pattern
      try {
        regex = new RegExp(query);
      } catch (err) {
        yield {
          error: `❌ Invalid regex pattern: ${getErrorMessage(err)}`,
          progress: 'Pattern validation failed',
        };
        return;
      }

      let filesScanned = 0;
      let matchesFound = 0;
      let dirsScanned = 0;
      const startTime = Date.now();
      const MAX_SEARCH_TIME = 120000; // 2 minutes max for searches

      while (queue.length) {
        // Check timeout
        if (Date.now() - startTime > MAX_SEARCH_TIME) {
          yield {
            error: `⏱️  Search timed out after 2 minutes`,
            progress: `Scanned ${filesScanned} files in ${dirsScanned} directories, found ${matchesFound} matches before timeout`,
          };
          return;
        }

        const dir = queue.shift()!;
        dirsScanned++;

        try {
          const entries = await withTimeout(
            container.fs.readdir(dir, { withFileTypes: true }),
            5000,
            `readdir ${dir}`
          );

          for (const entry of entries) {
            const full = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
            if (entry.isDirectory()) {
              if (full.includes('/node_modules') || full.includes('/.git') || full.includes('/.next')) continue;
              queue.push(full);
            } else {
              filesScanned++;
              try {
                const content = await withTimeout(
                  container.fs.readFile(full, 'utf8'),
                  3000,
                  `readFile ${full}`
                );
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) {
                    matchesFound++;
                    yield { filePath: full, lineNumber: i + 1, lineContent: lines[i].trim() };
                  }
                }
              } catch {
                // ignore unreadable or timed out files
              }
            }
          }
        } catch (err) {
          // Skip directories we can't read
          continue;
        }

        // Yield progress every 50 files
        if (filesScanned % 50 === 0) {
          yield {
            error: '',
            progress: `🔍 Searched ${filesScanned} files in ${dirsScanned} directories, found ${matchesFound} matches so far...`,
          };
        }
      }

      // Final summary
      yield {
        error: '',
        progress: `✅ Search complete: ${filesScanned} files scanned, ${matchesFound} matches found`,
      };
    } catch (err) {
      yield {
        error: `❌ Search failed: ${getErrorMessage(err)}`,
        progress: 'Search terminated due to error',
      };
    }
  },

  async *executeCommand(command: string, args: string[]): AsyncGenerator<string> {
    try {
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
          yield `❌ Starting the dev server via shell is disabled. Use the startDevServer tool instead.\n\nCommand blocked: ${command} ${args.join(' ')}`;
          return;
        }
      }

      yield `🚀 Executing: ${command} ${args.join(' ')}\n`;

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
            if (value) {
              combined += value;
            }
          }
        } catch {
          // ignore
        } finally {
          try { reader.releaseLock(); } catch {}
        }
      })();

      // Add a max timeout in case a command never exits cleanly (e.g., spinner processes)
      // Use 3 minutes for commands (more generous than before)
      const MAX_MS = 180_000; // 3 minutes
      const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(-1), MAX_MS));

      const exitCode = await Promise.race([proc.exit, timeout]);
      if (exitCode === -1) {
        // Timed out; try to stop the process and finish draining
        try { proc.kill(); } catch {}
        const sanitizedTimeout = combined.trim() ? sanitizeForLLM(combined) : '(no output)';
        yield `⏱️  Command timed out after 3 minutes and was terminated.\n\nOutput before timeout:\n${sanitizedTimeout}`;
        reading = false;
        try { await reader.cancel(); } catch {}
        await drain;
        return;
      }

      // Give a short grace period for any final buffered output, then cancel reader
      await new Promise((r) => setTimeout(r, 150));
      reading = false;
      try { await reader.cancel(); } catch {}
      await drain; // Ensure the drain task finishes

      // Build final result with context
      const hasOutput = combined.trim().length > 0;
      let final = '';

      // Sanitize output for LLM consumption (remove UUIDs, ANSI codes, etc.)
      const sanitizedOutput = hasOutput ? sanitizeForLLM(combined) : '';

      if (exitCode === 0) {
        final = `✅ Command completed successfully (exit code 0)\n\n`;
        if (hasOutput) {
          final += `Output:\n${sanitizedOutput}`;
        } else {
          final += `(No output - command completed silently)`;
        }
      } else {
        final = `❌ Command failed with exit code ${exitCode}\n\n`;
        if (hasOutput) {
          final += `Output:\n${sanitizedOutput}\n\nSuggestion: Check the error output above for details on what went wrong.`;
        } else {
          final += `(No output provided)\n\nSuggestion: The command may not exist or failed immediately.`;
        }
      }

      yield final;
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      yield `❌ Failed to execute command: ${errorMsg}\n\nPossible reasons:\n- Command doesn't exist\n- Insufficient permissions\n- WebContainer error\n\nSuggestion: Verify the command name and try a simpler command first.`;
    }
  },

  async startDevServer(): Promise<{ ok: boolean; message: string; alreadyRunning?: boolean }> {
    try {
      // 60 second timeout for starting dev server (includes dependency installation)
      const result = await withTimeout(
        DevServerManager.start(),
        60000,
        'startDevServer'
      );

      // Add verbose messaging
      if (result.ok) {
        if (result.alreadyRunning) {
          result.message = `ℹ️  ${result.message}\n\nThe dev server was already running. No action needed.`;
        } else {
          result.message = `🚀 ${result.message}\n\n✅ The dev server is now running. Use getDevServerLog to check its output, or refreshPreview to reload the preview pane.`;
        }
      } else {
        result.message = `❌ ${result.message}\n\nSuggestion: Check if dependencies are installed (run 'pnpm install' via executeCommand first), or check the project for configuration errors.`;
      }

      return result;
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      return {
        ok: false,
        message: `❌ Failed to start dev server: ${errorMsg}\n\nPossible reasons:\n- Dependencies not installed (run 'pnpm install' first)\n- Port already in use\n- Configuration error in vite.config or package.json\n- Operation timed out (took longer than 60 seconds)\n\nSuggestion: Use executeCommand to run 'pnpm install' if you haven't already, then try again.`,
      };
    }
  },

  async getDevServerLog(linesBack: number = 200): Promise<{ ok: boolean; message: string; log?: string }> {
    try {
      // Check if server is running with timeout
      const isRunning = await withTimeout(
        DevServerManager.isRunning(),
        5000,
        'isRunning check'
      );

      if (!isRunning) {
        return {
          ok: false,
          message: `📭 Dev server is not running. Use startDevServer tool to start it first.\n\nNote: The server needs to be started before you can view its logs.`,
        };
      }

      // Get logs (synchronous, no timeout needed)
      const result = DevServerManager.getLog(linesBack);

      // Add context to the response
      if (result.ok && result.log) {
        result.message = `📊 Retrieved last ${linesBack} lines of dev server output:\n\n` + result.log;
      } else if (result.ok && !result.log) {
        result.message = `📭 Dev server is running but has no output yet. Wait a moment and try again.`;
      } else {
        result.message = `❌ ${result.message}`;
      }

      return result;
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      return {
        ok: false,
        message: `❌ Failed to get dev server log: ${errorMsg}\n\nThis might be a temporary error. Try again in a moment.`,
      };
    }
  },

  async getBrowserLog(linesBack: number = 200): Promise<{ ok: boolean; message: string; log?: string }> {
    try {
      // Import BrowserLogManager dynamically
      const { BrowserLogManager } = await import('@/lib/browser-log-manager');

      // Get formatted logs (synchronous, no timeout needed)
      const formattedLog = BrowserLogManager.getLogsFormatted(linesBack);

      // Check if we have logs
      const stats = BrowserLogManager.getStats();
      if (stats.total === 0) {
        return {
          ok: false,
          message: `📭 No browser console logs available yet. The preview may not have loaded or generated any console output.\n\nNote: Browser logs include console.log/warn/error calls, runtime errors, and HMR events from the preview iframe.`,
        };
      }

      // Add context to the response
      return {
        ok: true,
        message: `📊 Retrieved last ${linesBack} lines of browser console output (${stats.total} total, ${stats.errors} errors, ${stats.warnings} warnings):\n\n` + formattedLog,
        log: formattedLog,
      };
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      return {
        ok: false,
        message: `❌ Failed to get browser console log: ${errorMsg}\n\nThis might be a temporary error. Try again in a moment.`,
      };
    }
  },

  async stopDevServer(): Promise<{ ok: boolean; message: string; alreadyStopped?: boolean }> {
    try {
      // 30 second timeout for stopping server
      const result = await withTimeout(
        DevServerManager.stop(),
        30000,
        'stopDevServer'
      );

      // Add verbose messaging
      if (result.ok) {
        if (result.alreadyStopped) {
          result.message = `ℹ️  ${result.message}\n\nThe dev server was not running. No action needed.`;
        } else {
          result.message = `✅ ${result.message}\n\nThe dev server has been stopped. You can start it again with startDevServer when needed.`;
        }
      } else {
        result.message = `❌ ${result.message}\n\nSuggestion: The server process may have already terminated, or there may be a system error.`;
      }

      return result;
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      return {
        ok: false,
        message: `❌ Failed to stop dev server: ${errorMsg}\n\nPossible reasons:\n- Process already terminated\n- Permission issue\n- Operation timed out (took longer than 30 seconds)\n\nSuggestion: The server may have already stopped. Try checking with isDevServerRunning.`,
      };
    }
  },

  async isDevServerRunning(): Promise<boolean> {
    try {
      return await withTimeout(
        DevServerManager.isRunning(),
        5000,
        'isDevServerRunning'
      );
    } catch {
      // If we can't determine status, assume not running
      return false;
    }
  },

  async refreshPreview(): Promise<{ ok: boolean; message: string }> {
    try {
      // Check if server is running first
      const isRunning = await withTimeout(
        DevServerManager.isRunning(),
        5000,
        'isRunning check for refresh'
      );

      if (!isRunning) {
        return {
          ok: false,
          message: `📭 Cannot refresh preview: dev server is not running.\n\nSuggestion: Start the dev server with startDevServer first.`,
        };
      }

      // Dispatch refresh event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('preview-refresh'));
      }

      return {
        ok: true,
        message: `✅ Preview refresh triggered successfully.\n\nThe preview pane should reload momentarily to show your latest changes.`,
      };
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      return {
        ok: false,
        message: `❌ Failed to refresh preview: ${errorMsg}\n\nThis might be a browser environment issue.`,
      };
    }
  },
};
