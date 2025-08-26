import { WebContainer } from '@webcontainer/api';
import { WebContainerManager } from '@/lib/webcontainer';
import { parseSearchReplaceBlocks, applyBlocksToContent } from './diff';

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

  async applyDiff(path: string, diff: string): Promise<{ applied: number; failures: number } & (
    | { ok: true; message: string }
    | { ok: false; message: string }
  )> {
    const container = await this.getContainer();
    const original = await container.fs.readFile(path, 'utf8');
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
    await container.fs.writeFile(path, result.content);
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
    const container = await this.getContainer();
    const proc = await container.spawn(command, args);
    const reader = proc.output.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  },
};
