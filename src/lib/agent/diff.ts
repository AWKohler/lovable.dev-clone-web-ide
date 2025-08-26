export type SearchReplaceBlock = {
  search: string;
  replace: string;
};

// Parse one or more SEARCH/REPLACE blocks within a single string.
// Expected format for each block:
// <<<<<<< SEARCH\n
// =======\n
// >>>>>>> REPLACE
export function parseSearchReplaceBlocks(input: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const pattern = /<<<<<<<\s*SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>>\s*REPLACE/gm;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    const search = normalizeNewlines(match[1]);
    const replace = normalizeNewlines(match[2]);
    blocks.push({ search, replace });
  }
  return blocks;
}

export function applyBlocksToContent(content: string, blocks: SearchReplaceBlock[]): {
  content: string;
  applied: number;
  failures: { index: number; preview: string }[];
} {
  let updated = content;
  const failures: { index: number; preview: string }[] = [];

  blocks.forEach((b, i) => {
    const idx = updated.indexOf(b.search);
    if (idx === -1) {
      failures.push({ index: i, preview: previewNotFound(updated, b.search) });
      return;
    }
    updated = updated.replace(b.search, b.replace);
  });

  return { content: updated, applied: blocks.length - failures.length, failures };
}

function normalizeNewlines(s: string) {
  return s.replace(/\r\n?/g, '\n');
}

function previewNotFound(haystack: string, needle: string): string {
  // Provide a short preview around the best-effort match region to aid debugging.
  // Find first line of needle and try to locate similar line.
  const firstLine = needle.split('\n')[0]?.trim();
  if (!firstLine) return 'No preview available';
  const lines = haystack.split('\n');
  const idx = lines.findIndex((l) => l.includes(firstLine));
  if (idx === -1) return 'No similar line found in file.';
  const start = Math.max(0, idx - 3);
  const end = Math.min(lines.length, idx + 4);
  return lines.slice(start, end).join('\n');
}

