import { describe, expect, it } from 'vitest';
import { assembleChatContext } from '../../chat/context.js';
import type { ChatRequest } from '../../types.js';

function mockRepoIndex(files: Record<string, string> = {}) {
  return {
    root: '/repo',
    getFileContent: async (relPath: string) => files[relPath] ?? null,
    getFile: () => undefined,
    getTree: () => Object.keys(files).sort(),
    size: () => Object.keys(files).length,
    build: async () => {},
  } as any;
}

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    token: 'test',
    client_id: 'c1',
    message: 'hello',
    ...overrides,
  };
}

describe('assembleChatContext', () => {
  it('returns empty string when no context', async () => {
    const result = await assembleChatContext(makeRequest(), mockRepoIndex());
    expect(result).toBe('');
  });

  it('includes selection block with correct line range', async () => {
    const result = await assembleChatContext(
      makeRequest({
        context: {
          file_path: '/repo/test.ts',
          selection: {
            start: { line: 0, col: 0 },
            end: { line: 3, col: 10 },
            text: 'selected code',
          },
        },
      }),
      mockRepoIndex(),
    );
    expect(result).toContain('<selection');
    expect(result).toContain('lines="1-4"');
    expect(result).toContain('selected code');
  });

  it('includes current file when no selection', async () => {
    const result = await assembleChatContext(
      makeRequest({
        context: {
          file_path: 'test.ts',
          filetype: 'typescript',
        },
      }),
      mockRepoIndex({ 'test.ts': 'const x = 1;' }),
    );
    expect(result).toContain('<current_file');
    expect(result).toContain('const x = 1;');
  });

  it('includes mentioned files', async () => {
    const result = await assembleChatContext(
      makeRequest({
        context: {
          mentions: [{ type: 'file', path: 'utils.ts' }],
        },
      }),
      mockRepoIndex({ 'utils.ts': 'export function util() {}' }),
    );
    expect(result).toContain('<file path="utils.ts">');
    expect(result).toContain('export function util()');
  });

  it('skips mentioned files that do not exist', async () => {
    const result = await assembleChatContext(
      makeRequest({
        context: {
          mentions: [{ type: 'file', path: 'missing.ts' }],
        },
      }),
      mockRepoIndex(),
    );
    expect(result).toBe('');
  });
});
