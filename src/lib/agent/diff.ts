import { distance } from 'fastest-levenshtein';

// ============================================================================
// Types
// ============================================================================

export type SearchReplaceBlock = {
  search: string;
  replace: string;
  startLine?: number; // Optional hint for where the search should start
};

export type DiffResult = {
  success: boolean;
  content?: string;
  error?: string;
  appliedCount: number;
  failedBlocks: FailedBlock[];
  // Additional debug info for the agent
  debugInfo?: string;
};

export type FailedBlock = {
  index: number;
  searchPreview: string;
  bestMatch?: {
    content: string;
    similarity: number;
    lineNumber: number;
  };
  reason: string;
};

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_FUZZY_THRESHOLD = 0.85; // 85% similarity required for a match
const BUFFER_LINES = 40; // Extra context lines to search around expected position

// ============================================================================
// Text Normalization
// ============================================================================

/**
 * Normalize a string to handle smart quotes, unicode characters, and other
 * special characters that LLMs might accidentally substitute.
 */
function normalizeString(str: string): string {
  return str
    // Normalize unicode
    .normalize('NFC')
    // Smart quotes to regular quotes
    .replace(/[\u2018\u2019\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // En/em dashes to regular dashes
    .replace(/[\u2013\u2014]/g, '-')
    // Ellipsis to three dots
    .replace(/\u2026/g, '...')
    // Non-breaking space to regular space
    .replace(/\u00A0/g, ' ')
    // Zero-width characters
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

/**
 * Normalize newlines to \n
 */
function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

// ============================================================================
// Similarity Calculation
// ============================================================================

/**
 * Calculate similarity between two strings using Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function getSimilarity(original: string, search: string): number {
  if (search === '') return 0;

  const normalizedOriginal = normalizeString(original);
  const normalizedSearch = normalizeString(search);

  if (normalizedOriginal === normalizedSearch) return 1;

  const dist = distance(normalizedOriginal, normalizedSearch);
  const maxLength = Math.max(normalizedOriginal.length, normalizedSearch.length);

  return maxLength === 0 ? 1 : 1 - dist / maxLength;
}

// ============================================================================
// Line Number Handling
// ============================================================================

/**
 * Check if a line appears to have a line number prefix like "123 | " or "123|"
 */
function hasLineNumberPrefix(line: string): boolean {
  return /^\s*\d+\s*\|/.test(line);
}

/**
 * Check if every non-empty line in the content has line numbers.
 */
function everyLineHasLineNumbers(content: string): boolean {
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter(l => l.trim() !== '');
  if (nonEmptyLines.length === 0) return false;
  return nonEmptyLines.every(hasLineNumberPrefix);
}

/**
 * Strip line number prefixes from content.
 * Format: "123 | content" or "123| content" -> "content"
 */
function stripLineNumbers(content: string, aggressive = false): string {
  const lines = content.split('\n');
  return lines.map(line => {
    if (aggressive) {
      // Aggressive: strip any leading number followed by | or :
      return line.replace(/^\s*\d+\s*[|:]\s?/, '');
    }
    // Standard: only strip "N | " pattern
    const match = line.match(/^\s*\d+\s*\|\s?(.*)$/);
    return match ? match[1] : line;
  }).join('\n');
}

/**
 * Add line numbers to content for display purposes.
 */
function addLineNumbers(content: string, startLine = 1): string {
  const lines = content.split('\n');
  const maxLineNum = startLine + lines.length - 1;
  const padding = String(maxLineNum).length;
  return lines.map((line, i) => {
    const lineNum = String(startLine + i).padStart(padding, ' ');
    return `${lineNum} | ${line}`;
  }).join('\n');
}

// ============================================================================
// Fuzzy Search Strategies
// ============================================================================

/**
 * Performs a "middle-out" search to find the best matching slice.
 * Searches outward from the midpoint of the given range for better performance.
 */
function fuzzySearch(
  lines: string[],
  searchChunk: string,
  startIndex: number,
  endIndex: number
): { bestScore: number; bestMatchIndex: number; bestMatchContent: string } {
  let bestScore = 0;
  let bestMatchIndex = -1;
  let bestMatchContent = '';

  const searchLen = searchChunk.split('\n').length;
  const midPoint = Math.floor((startIndex + endIndex) / 2);
  let leftIndex = midPoint;
  let rightIndex = midPoint + 1;

  while (leftIndex >= startIndex || rightIndex <= endIndex - searchLen) {
    if (leftIndex >= startIndex) {
      const originalChunk = lines.slice(leftIndex, leftIndex + searchLen).join('\n');
      const similarity = getSimilarity(originalChunk, searchChunk);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatchIndex = leftIndex;
        bestMatchContent = originalChunk;
      }
      leftIndex--;
    }

    if (rightIndex <= endIndex - searchLen) {
      const originalChunk = lines.slice(rightIndex, rightIndex + searchLen).join('\n');
      const similarity = getSimilarity(originalChunk, searchChunk);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatchIndex = rightIndex;
        bestMatchContent = originalChunk;
      }
      rightIndex++;
    }
  }

  return { bestScore, bestMatchIndex, bestMatchContent };
}

// ============================================================================
// Block Parsing
// ============================================================================

/**
 * Parse SEARCH/REPLACE blocks from diff content.
 * Supports multiple formats:
 * - <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
 * - Variations with :start_line: hints
 */
export function parseSearchReplaceBlocks(input: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const normalizedInput = normalizeNewlines(input);

  // Primary pattern: handles the standard format with optional :start_line:
  // Also handles AI variations like extra > or < characters
  const pattern = /(?:^|\n)(?:<<<<<<<?)\s*SEARCH>?\s*\n(?::start_line:\s*(\d+)\s*\n)?(?:-------\s*\n)?([\s\S]*?)\n=======\s*\n([\s\S]*?)\n(?:>>>>>>>?)\s*REPLACE<?(?=\n|$)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalizedInput)) !== null) {
    const startLine = match[1] ? parseInt(match[1], 10) : undefined;
    const search = normalizeNewlines(match[2] || '');
    const replace = normalizeNewlines(match[3] || '');
    blocks.push({ search, replace, startLine });
  }

  // Fallback: simpler pattern for basic format
  if (blocks.length === 0) {
    const simplePattern = /<<<<<<<\s*SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>>\s*REPLACE/gm;
    while ((match = simplePattern.exec(normalizedInput)) !== null) {
      const search = normalizeNewlines(match[1]);
      const replace = normalizeNewlines(match[2]);
      blocks.push({ search, replace });
    }
  }

  return blocks;
}

// ============================================================================
// Indentation Handling
// ============================================================================

/**
 * Extract the leading whitespace from a line.
 */
function getIndent(line: string): string {
  const match = line.match(/^[\t ]*/);
  return match ? match[0] : '';
}

/**
 * Apply replacement while preserving relative indentation.
 */
function applyWithIndentation(
  matchedLines: string[],
  searchLines: string[],
  replaceLines: string[]
): string[] {
  if (replaceLines.length === 0) return [];
  if (matchedLines.length === 0 || searchLines.length === 0) return replaceLines;

  // Get the base indentation from the first matched line
  const matchedBaseIndent = getIndent(matchedLines[0]);
  const searchBaseIndent = getIndent(searchLines[0]);

  return replaceLines.map(line => {
    const currentIndent = getIndent(line);
    const searchBaseLevel = searchBaseIndent.length;
    const currentLevel = currentIndent.length;
    const relativeLevel = currentLevel - searchBaseLevel;

    // Calculate final indentation
    let finalIndent: string;
    if (relativeLevel < 0) {
      finalIndent = matchedBaseIndent.slice(0, Math.max(0, matchedBaseIndent.length + relativeLevel));
    } else {
      finalIndent = matchedBaseIndent + currentIndent.slice(searchBaseLevel);
    }

    return finalIndent + line.trim();
  });
}

// ============================================================================
// Main Application Logic
// ============================================================================

export interface ApplyBlocksOptions {
  fuzzyThreshold?: number;
  bufferLines?: number;
}

/**
 * Apply SEARCH/REPLACE blocks to file content with fuzzy matching.
 * This is the main entry point for diff application.
 */
export function applyBlocksToContent(
  content: string,
  blocks: SearchReplaceBlock[],
  options: ApplyBlocksOptions = {}
): DiffResult {
  const fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;
  const bufferLines = options.bufferLines ?? BUFFER_LINES;

  if (blocks.length === 0) {
    return {
      success: false,
      error: 'No SEARCH/REPLACE blocks found in diff.',
      appliedCount: 0,
      failedBlocks: [],
    };
  }

  // Detect line ending
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  let resultLines = normalizeNewlines(content).split('\n');
  let delta = 0; // Track line number shifts from previous edits

  const failedBlocks: FailedBlock[] = [];
  let appliedCount = 0;

  // Sort blocks by start line (if specified) for deterministic application
  const sortedBlocks = [...blocks].sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));

  for (let blockIndex = 0; blockIndex < sortedBlocks.length; blockIndex++) {
    const block = sortedBlocks[blockIndex];
    let { search: searchContent, replace: replaceContent, startLine } = block;

    // Adjust startLine based on previous edits
    if (startLine !== undefined && startLine > 0) {
      startLine = startLine + delta;
    }

    // Handle line numbers in search/replace content
    const hasAllLineNumbers =
      (everyLineHasLineNumbers(searchContent) && everyLineHasLineNumbers(replaceContent)) ||
      (everyLineHasLineNumbers(searchContent) && replaceContent.trim() === '');

    if (hasAllLineNumbers) {
      // Try to extract start line from line numbers if not provided
      if (!startLine) {
        const firstLineMatch = searchContent.match(/^\s*(\d+)/);
        if (firstLineMatch) {
          startLine = parseInt(firstLineMatch[1], 10);
        }
      }
      searchContent = stripLineNumbers(searchContent);
      replaceContent = stripLineNumbers(replaceContent);
    }

    // Validate search content
    if (searchContent.trim() === '') {
      failedBlocks.push({
        index: blockIndex,
        searchPreview: '(empty)',
        reason: 'Empty search content is not allowed. Provide specific content to search for.',
      });
      continue;
    }

    // Validate that search and replace are different
    if (searchContent === replaceContent) {
      failedBlocks.push({
        index: blockIndex,
        searchPreview: searchContent.slice(0, 100),
        reason: 'Search and replace content are identical - no changes would be made.',
      });
      continue;
    }

    const searchLines = searchContent.split('\n');
    const replaceLines = replaceContent.split('\n');
    const searchChunk = searchLines.join('\n');

    // Determine search bounds
    let searchStartIndex = 0;
    let searchEndIndex = resultLines.length;

    let matchIndex = -1;
    let bestMatchScore = 0;
    let bestMatchContent = '';

    // If we have a start line hint, try exact match first
    if (startLine && startLine > 0) {
      const exactStartIndex = startLine - 1;
      const exactEndIndex = exactStartIndex + searchLines.length;

      if (exactStartIndex >= 0 && exactEndIndex <= resultLines.length) {
        const originalChunk = resultLines.slice(exactStartIndex, exactEndIndex).join('\n');
        const similarity = getSimilarity(originalChunk, searchChunk);

        if (similarity >= fuzzyThreshold) {
          matchIndex = exactStartIndex;
          bestMatchScore = similarity;
          bestMatchContent = originalChunk;
        } else {
          // Set bounds for buffered search around the hint
          searchStartIndex = Math.max(0, exactStartIndex - bufferLines);
          searchEndIndex = Math.min(resultLines.length, exactEndIndex + bufferLines);
        }
      }
    }

    // If no match yet, try fuzzy search
    if (matchIndex === -1) {
      const result = fuzzySearch(resultLines, searchChunk, searchStartIndex, searchEndIndex);
      matchIndex = result.bestMatchIndex;
      bestMatchScore = result.bestScore;
      bestMatchContent = result.bestMatchContent;
    }

    // Try aggressive line number stripping as fallback
    if (matchIndex === -1 || bestMatchScore < fuzzyThreshold) {
      const aggressiveSearchContent = stripLineNumbers(searchContent, true);
      const aggressiveReplaceContent = stripLineNumbers(replaceContent, true);
      const aggressiveSearchLines = aggressiveSearchContent.split('\n');
      const aggressiveSearchChunk = aggressiveSearchLines.join('\n');

      const result = fuzzySearch(resultLines, aggressiveSearchChunk, searchStartIndex, searchEndIndex);

      if (result.bestMatchIndex !== -1 && result.bestScore >= fuzzyThreshold) {
        matchIndex = result.bestMatchIndex;
        bestMatchScore = result.bestScore;
        bestMatchContent = result.bestMatchContent;
        // Update search/replace with stripped versions
        searchContent = aggressiveSearchContent;
        replaceContent = aggressiveReplaceContent;
      }
    }

    // Still no match - record failure with helpful debug info
    if (matchIndex === -1 || bestMatchScore < fuzzyThreshold) {
      const failed: FailedBlock = {
        index: blockIndex,
        searchPreview: searchContent.slice(0, 200),
        reason: `No sufficiently similar match found (${Math.floor(bestMatchScore * 100)}% similar, needs ${Math.floor(fuzzyThreshold * 100)}%).`,
      };

      if (bestMatchContent) {
        failed.bestMatch = {
          content: bestMatchContent.slice(0, 200),
          similarity: bestMatchScore,
          lineNumber: matchIndex + 1,
        };
      }

      failedBlocks.push(failed);
      continue;
    }

    // We have a match - apply the replacement
    const matchedLines = resultLines.slice(matchIndex, matchIndex + searchLines.length);
    const indentedReplaceLines = applyWithIndentation(matchedLines, searchLines, replaceLines);

    // Apply the change
    const beforeMatch = resultLines.slice(0, matchIndex);
    const afterMatch = resultLines.slice(matchIndex + searchLines.length);
    resultLines = [...beforeMatch, ...indentedReplaceLines, ...afterMatch];

    // Update delta for subsequent blocks
    delta += replaceLines.length - searchLines.length;
    appliedCount++;
  }

  // Build result
  const finalContent = resultLines.join(lineEnding);

  if (appliedCount === 0) {
    // Build comprehensive error message
    const errorParts = ['Failed to apply any diff blocks.'];

    for (const failed of failedBlocks) {
      errorParts.push(`\nBlock ${failed.index + 1}: ${failed.reason}`);
      if (failed.bestMatch) {
        errorParts.push(`  Best match at line ${failed.bestMatch.lineNumber} (${Math.floor(failed.bestMatch.similarity * 100)}% similar):`);
        errorParts.push(`  "${failed.bestMatch.content.slice(0, 100)}..."`);
      }
      errorParts.push(`  Search content: "${failed.searchPreview.slice(0, 80)}..."`);
    }

    errorParts.push('\nTip: Use readFile to get the current content before attempting edits.');

    return {
      success: false,
      error: errorParts.join('\n'),
      appliedCount: 0,
      failedBlocks,
      debugInfo: buildDebugInfo(content, failedBlocks),
    };
  }

  // Partial success or full success
  const result: DiffResult = {
    success: true,
    content: finalContent,
    appliedCount,
    failedBlocks,
  };

  if (failedBlocks.length > 0) {
    result.debugInfo = `Applied ${appliedCount}/${appliedCount + failedBlocks.length} blocks. ` +
      `Failed blocks: ${failedBlocks.map(f => f.index + 1).join(', ')}`;
  }

  return result;
}

/**
 * Build debug information for failed blocks.
 */
function buildDebugInfo(originalContent: string, failedBlocks: FailedBlock[]): string {
  const lines = originalContent.split('\n');
  const parts: string[] = ['=== Debug Info ==='];

  for (const failed of failedBlocks) {
    parts.push(`\n--- Block ${failed.index + 1} ---`);
    parts.push(`Reason: ${failed.reason}`);

    if (failed.bestMatch) {
      const start = Math.max(0, failed.bestMatch.lineNumber - 3);
      const end = Math.min(lines.length, failed.bestMatch.lineNumber + 5);
      parts.push(`\nContext around best match (lines ${start + 1}-${end}):`);
      parts.push(addLineNumbers(lines.slice(start, end).join('\n'), start + 1));
    }
  }

  return parts.join('\n');
}

// ============================================================================
// Convenience wrapper (maintains backward compatibility)
// ============================================================================

/**
 * Legacy-compatible interface for applyBlocksToContent.
 */
export function applyDiff(
  content: string,
  diffString: string,
  options?: ApplyBlocksOptions
): DiffResult {
  const blocks = parseSearchReplaceBlocks(diffString);
  return applyBlocksToContent(content, blocks, options);
}
