import * as fs from 'fs/promises';
import type { DiffHunk } from '../types.js';

/**
 * Compute diff hunks between two line arrays.
 * Uses a simple LCS-based approach to find changed regions.
 */
export function computeHunks(oldLines: string[], newLines: string[]): DiffHunk[] {
  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;

  // For large files, use a simpler approach to avoid memory issues
  if (m * n > 10_000_000) {
    return simpleDiff(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find which lines are in LCS
  const oldInLcs = new Set<number>();
  const newInLcs = new Set<number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      oldInLcs.add(i - 1);
      newInLcs.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // Walk both arrays, grouping non-LCS lines into hunks
  const hunks: DiffHunk[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < m || ni < n) {
    // Skip common lines
    if (oi < m && ni < n && oldInLcs.has(oi) && newInLcs.has(ni)) {
      oi++;
      ni++;
      continue;
    }

    // Start of a change region
    const startLine = oi + 1; // 1-based
    const oldChunk: string[] = [];
    const newChunk: string[] = [];

    while (oi < m && !oldInLcs.has(oi)) {
      oldChunk.push(oldLines[oi]);
      oi++;
    }
    while (ni < n && !newInLcs.has(ni)) {
      newChunk.push(newLines[ni]);
      ni++;
    }

    if (oldChunk.length > 0 || newChunk.length > 0) {
      hunks.push({
        start_line: startLine,
        old_text: oldChunk.join('\n'),
        new_text: newChunk.join('\n'),
      });
    }
  }

  return hunks;
}

/**
 * Simple line-by-line diff for very large files.
 * Treats the entire file as one hunk if different.
 */
function simpleDiff(oldLines: string[], newLines: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;

  while (i < oldLines.length || i < newLines.length) {
    // Skip matching lines
    if (i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i]) {
      i++;
      continue;
    }

    // Find the end of the differing region
    const startLine = i + 1;
    const oldChunk: string[] = [];
    const newChunk: string[] = [];

    while (i < oldLines.length || i < newLines.length) {
      if (i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i]) {
        break;
      }
      if (i < oldLines.length) oldChunk.push(oldLines[i]);
      if (i < newLines.length) newChunk.push(newLines[i]);
      i++;
    }

    if (oldChunk.length > 0 || newChunk.length > 0) {
      hunks.push({
        start_line: startLine,
        old_text: oldChunk.join('\n'),
        new_text: newChunk.join('\n'),
      });
    }
  }

  return hunks;
}

export class VirtualFS {
  private virtualFiles = new Map<string, string>();
  private originalFiles = new Map<string, string>();
  readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async read(absPath: string): Promise<string> {
    // Return virtual content if file was modified
    const virtual = this.virtualFiles.get(absPath);
    if (virtual !== undefined) return virtual;

    // Read from disk and cache
    const content = await fs.readFile(absPath, 'utf-8');
    this.originalFiles.set(absPath, content);
    return content;
  }

  async write(absPath: string, content: string): Promise<DiffHunk[]> {
    // Get original content
    if (!this.originalFiles.has(absPath)) {
      try {
        const disk = await fs.readFile(absPath, 'utf-8');
        this.originalFiles.set(absPath, disk);
      } catch {
        // New file -- original is empty
        this.originalFiles.set(absPath, '');
      }
    }

    const original = this.originalFiles.get(absPath) ?? '';
    this.virtualFiles.set(absPath, content);

    const oldLines = original.split('\n');
    const newLines = content.split('\n');
    return computeHunks(oldLines, newLines);
  }

  async edit(absPath: string, oldStr: string, newStr: string): Promise<DiffHunk[]> {
    // Read current content (virtual or disk)
    const current = await this.read(absPath);

    const idx = current.indexOf(oldStr);
    if (idx === -1) {
      throw new Error(`String not found in ${absPath}: "${oldStr.slice(0, 80)}..."`);
    }

    const updated = current.slice(0, idx) + newStr + current.slice(idx + oldStr.length);
    return this.write(absPath, updated);
  }

  getModifiedFiles(): string[] {
    return Array.from(this.virtualFiles.keys());
  }

  reset(): void {
    this.virtualFiles.clear();
    this.originalFiles.clear();
  }
}
