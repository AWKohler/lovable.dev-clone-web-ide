/**
 * Output Sanitizer - Cleans up WebContainer output for better UX
 *
 * Removes or replaces:
 * - Internal WebContainer UUIDs and identifiers
 * - ANSI escape codes
 * - Verbose internal paths
 * - Token-heavy noise that doesn't help users
 */

/**
 * Sanitize terminal/log output for display to users and LLM agents
 */
export function sanitizeOutput(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // Remove ANSI escape codes (colors, cursor movements, etc.)
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  cleaned = cleaned.replace(/\x1b\][0-9;]*[^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

  // Replace WebContainer internal UUIDs (long alphanumeric strings) with cleaner placeholders
  // Matches patterns like: ah578c4tnozj67c6fhe7n5271utge1-agxd, wc-abc123def456, etc.
  // Only replace if it looks like an internal identifier (20+ chars, alphanumeric with dashes/underscores)
  cleaned = cleaned.replace(/\b[a-z0-9_-]{20,}\b/gi, (match) => {
    // Don't replace if it looks like a regular word or hash
    if (/^[0-9a-f]{32,}$/i.test(match)) return '[hash]'; // Looks like a hash
    if (match.includes('node_modules')) return match; // Keep node_modules paths
    if (match.includes('package')) return match; // Keep package names
    return '[id]'; // Replace with generic placeholder
  });

  // Clean up WebContainer internal paths that expose implementation details
  // /home/projects/webcontainer-abc123/... -> /project/...
  cleaned = cleaned.replace(/\/home\/projects\/[a-z0-9_-]+\//gi, '/project/');

  // Clean up node cache paths
  // /tmp/.vite/... or similar temp paths
  cleaned = cleaned.replace(/\/tmp\/[a-z0-9_.\-\/]+/gi, '/tmp/cache');
  cleaned = cleaned.replace(/\/node_modules\/\.cache\/[a-z0-9_.\-\/]+/gi, '/node_modules/.cache');
  cleaned = cleaned.replace(/\/node_modules\/\.vite\/[a-z0-9_.\-\/]+/gi, '/node_modules/.vite');

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
  cleaned = cleaned.replace(/[ \t]+$/gm, ''); // Remove trailing whitespace on each line

  return cleaned;
}

/**
 * Sanitize output specifically for LLM consumption (more aggressive cleaning)
 */
export function sanitizeForLLM(text: string): string {
  let cleaned = sanitizeOutput(text);

  // Remove spinner/progress characters that waste tokens
  cleaned = cleaned.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷]/g, '');
  cleaned = cleaned.replace(/[│┤┐└┴┬├─┼╭╮╯╰]/g, '');

  // Remove repeated dots/loading indicators
  cleaned = cleaned.replace(/\.{4,}/g, '...');
  cleaned = cleaned.replace(/…+/g, '...');

  // Collapse multiple spaces
  cleaned = cleaned.replace(/  +/g, ' ');

  return cleaned.trim();
}

/**
 * Sanitize file paths for display
 */
export function sanitizePath(path: string): string {
  if (!path) return path;

  // Clean up WebContainer internal paths
  let cleaned = path.replace(/\/home\/projects\/[a-z0-9_-]+\//gi, '/');

  // Simplify working directory references
  cleaned = cleaned.replace(/^\.\//, '');

  return cleaned;
}
