import { describe, expect, it } from 'vitest';
import { validatePath } from '../../sdk/tool-helpers.js';

describe('validatePath', () => {
  const repoRoot = '/home/user/repo';

  it('resolves a relative path inside the repo', () => {
    expect(validatePath('src/index.ts', repoRoot)).toBe('/home/user/repo/src/index.ts');
  });

  it('rejects paths that escape via ..', () => {
    expect(() => validatePath('../secret/file.txt', repoRoot)).toThrow(
      'outside the repository root',
    );
  });

  it('rejects sibling directories with matching prefix', () => {
    expect(() => validatePath('../repo-secret/file.txt', repoRoot)).toThrow(
      'outside the repository root',
    );
  });

  it('rejects absolute paths outside the repo', () => {
    expect(() => validatePath('/etc/passwd', repoRoot)).toThrow('outside the repository root');
  });

  it('allows the repo root itself', () => {
    expect(validatePath('.', repoRoot)).toBe('/home/user/repo');
  });

  it('normalizes redundant segments', () => {
    expect(validatePath('src/../src/index.ts', repoRoot)).toBe('/home/user/repo/src/index.ts');
  });
});
