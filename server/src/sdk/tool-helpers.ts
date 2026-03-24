import { execFile } from 'child_process';
import * as path from 'path';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs/promises';
import { z } from 'zod/v4';

export const MAX_FILE_SIZE = 1024 * 1024; // 1MB
export const MAX_GREP_MATCHES = 100;

export function validatePath(filePath: string, repoRoot: string): string {
  const resolved = path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path ${filePath} is outside the repository root`);
  }
  return resolved;
}

export function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], isError };
}

export function grepSearchTool(repoRoot: string) {
  return tool(
    'grep_search',
    'Search for a regex pattern across files in the repository. Returns matching lines with file paths and line numbers.',
    {
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory to search in, relative to repo root'),
      glob: z.string().optional().describe('File glob pattern to filter (e.g. "*.ts")'),
    },
    async (args) => {
      try {
        const searchDir = args.path ? validatePath(args.path, repoRoot) : repoRoot;

        const grepArgs = ['-rn', '--max-count=5'];
        if (args.glob) {
          grepArgs.push('--include', args.glob);
        }
        grepArgs.push(args.pattern, searchDir);

        const output = await new Promise<string>((resolve, reject) => {
          execFile('grep', grepArgs, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
            if (err && err.code !== 1) {
              reject(err);
            } else {
              resolve(stdout || '');
            }
          });
        });

        const lines = output.split('\n').filter(Boolean);
        if (lines.length > MAX_GREP_MATCHES) {
          return textResult(
            `${lines.slice(0, MAX_GREP_MATCHES).join('\n')}\n... (${lines.length - MAX_GREP_MATCHES} more matches)`,
          );
        }
        return textResult(lines.length ? lines.join('\n') : 'No matches found.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error searching: ${msg}`, true);
      }
    },
    { annotations: { readOnlyHint: true } },
  );
}

export function fileListTool(repoRoot: string) {
  return tool(
    'file_list',
    'List files in a directory. Path is relative to the repository root.',
    {
      path: z.string().optional().describe('Directory path relative to repo root (default: root)'),
      recursive: z.boolean().optional().describe('List recursively (default: false)'),
    },
    async (args) => {
      try {
        const dirPath = args.path ? validatePath(args.path, repoRoot) : repoRoot;

        const entries = await fs.readdir(dirPath, {
          withFileTypes: true,
          recursive: args.recursive ?? false,
        });

        const lines = entries
          .map((e) => {
            const rel = path.relative(repoRoot, path.join(dirPath, e.name));
            return e.isDirectory() ? `${rel}/` : rel;
          })
          .filter((p) => !p.startsWith('node_modules') && !p.startsWith('.git/'))
          .sort();

        return textResult(lines.join('\n') || '(empty directory)');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error listing directory: ${msg}`, true);
      }
    },
    { annotations: { readOnlyHint: true } },
  );
}
