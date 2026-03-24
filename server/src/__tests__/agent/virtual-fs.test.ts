import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualFS, computeHunks } from '../../agent/virtual-fs.js';

describe('computeHunks', () => {
  it('returns no hunks for identical arrays', () => {
    const lines = ['a', 'b', 'c'];
    expect(computeHunks(lines, lines)).toEqual([]);
  });

  it('detects a single changed line', () => {
    const hunks = computeHunks(['a', 'b', 'c'], ['a', 'X', 'c']);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({ start_line: 2, old_text: 'b', new_text: 'X' });
  });

  it('detects insertion in the middle', () => {
    const hunks = computeHunks(['a', 'c'], ['a', 'b', 'c']);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].old_text).toBe('');
    expect(hunks[0].new_text).toBe('b');
  });

  it('detects deletion from the middle', () => {
    const hunks = computeHunks(['a', 'b', 'c'], ['a', 'c']);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].old_text).toBe('b');
    expect(hunks[0].new_text).toBe('');
  });

  it('detects multiple non-contiguous changes', () => {
    const hunks = computeHunks(['a', 'b', 'c', 'd', 'e'], ['A', 'b', 'c', 'D', 'e']);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toEqual({ start_line: 1, old_text: 'a', new_text: 'A' });
    expect(hunks[1]).toEqual({ start_line: 4, old_text: 'd', new_text: 'D' });
  });

  it('handles complete file replacement', () => {
    const hunks = computeHunks(['a', 'b'], ['x', 'y', 'z']);
    expect(hunks.length).toBeGreaterThan(0);
    // All original lines should appear as old_text, all new as new_text
    const allOld = hunks.map((h) => h.old_text).join('\n');
    const allNew = hunks.map((h) => h.new_text).join('\n');
    expect(allOld).toContain('a');
    expect(allNew).toContain('x');
  });

  it('handles empty original (new file)', () => {
    const hunks = computeHunks([], ['a', 'b']);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].old_text).toBe('');
    expect(hunks[0].new_text).toBe('a\nb');
  });

  it('handles empty new (deletion)', () => {
    const hunks = computeHunks(['a', 'b'], []);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].old_text).toBe('a\nb');
    expect(hunks[0].new_text).toBe('');
  });

  it('uses 1-based start_line', () => {
    const hunks = computeHunks(['X'], ['Y']);
    expect(hunks[0].start_line).toBe(1);
  });

  it('handles change at end of file', () => {
    const hunks = computeHunks(['a', 'b', 'c'], ['a', 'b', 'Z']);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].start_line).toBe(3);
    expect(hunks[0].old_text).toBe('c');
    expect(hunks[0].new_text).toBe('Z');
  });
});

describe('VirtualFS', () => {
  let vfs: VirtualFS;

  // Mock fs.readFile
  vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
  }));

  beforeEach(async () => {
    vfs = new VirtualFS('/repo');
    const { readFile } = await import('fs/promises');
    (readFile as any).mockReset();
  });

  it('read() returns content from disk', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('file content');

    const content = await vfs.read('/repo/test.ts');
    expect(content).toBe('file content');
    expect(readFile).toHaveBeenCalledWith('/repo/test.ts', 'utf-8');
  });

  it('read() returns virtual content after write()', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('original');

    await vfs.write('/repo/test.ts', 'modified');
    const content = await vfs.read('/repo/test.ts');
    expect(content).toBe('modified');
  });

  it('write() returns diff hunks', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('line1\nline2\n');

    const hunks = await vfs.write('/repo/test.ts', 'line1\nchanged\n');
    expect(hunks.length).toBeGreaterThan(0);
    expect(hunks.some((h) => h.new_text.includes('changed'))).toBe(true);
  });

  it('write() to new file treats original as empty', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockRejectedValue(new Error('ENOENT'));

    const hunks = await vfs.write('/repo/new.ts', 'content');
    expect(hunks).toHaveLength(1);
    expect(hunks[0].new_text).toBe('content');
  });

  it('edit() replaces string and returns hunks', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('const x = 1;\nconst y = 2;\n');

    const hunks = await vfs.edit('/repo/test.ts', 'const x = 1;', 'const x = 42;');
    expect(hunks.length).toBeGreaterThan(0);

    // Verify the virtual content reflects the edit
    const content = await vfs.read('/repo/test.ts');
    expect(content).toContain('const x = 42;');
    expect(content).toContain('const y = 2;');
  });

  it('edit() throws when string not found', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('hello world');

    await expect(vfs.edit('/repo/test.ts', 'nonexistent', 'replacement')).rejects.toThrow(
      'String not found',
    );
  });

  it('sequential edits work on virtual content', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('a\nb\nc\n');

    await vfs.edit('/repo/test.ts', 'a', 'A');
    await vfs.edit('/repo/test.ts', 'b', 'B');

    const content = await vfs.read('/repo/test.ts');
    expect(content).toBe('A\nB\nc\n');
  });

  it('getModifiedFiles() returns modified paths', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('content');

    await vfs.write('/repo/a.ts', 'new');
    await vfs.write('/repo/b.ts', 'new');

    const files = vfs.getModifiedFiles();
    expect(files).toContain('/repo/a.ts');
    expect(files).toContain('/repo/b.ts');
  });

  it('reset() clears all state', async () => {
    const { readFile } = await import('fs/promises');
    (readFile as any).mockResolvedValue('content');

    await vfs.write('/repo/test.ts', 'modified');
    vfs.reset();

    expect(vfs.getModifiedFiles()).toHaveLength(0);
    // After reset, read should hit disk again
    const content = await vfs.read('/repo/test.ts');
    expect(readFile).toHaveBeenCalled();
  });
});
