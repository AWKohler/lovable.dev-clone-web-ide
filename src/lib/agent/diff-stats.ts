// Lightweight line-based diff statistics using LCS length.
// Counts modifications as one deletion + one addition, which matches
// common diff viewers' summary numbers.

export function diffLineStats(before: string, after: string): { additions: number; deletions: number } {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);

  const n = a.length;
  const m = b.length;
  // Optimize memory: keep two rows only
  let prev = new Array(m + 1).fill(0) as number[];
  let curr = new Array(m + 1).fill(0) as number[];

  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      if (ai === b[j - 1]) curr[j] = prev[j - 1] + 1;
      else curr[j] = Math.max(prev[j], curr[j - 1]);
    }
    // swap
    const tmp = prev; prev = curr; curr = tmp; curr.fill(0);
  }

  const lcs = prev[m];
  const deletions = Math.max(0, n - lcs);
  const additions = Math.max(0, m - lcs);
  return { additions, deletions };
}

