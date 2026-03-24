import { execFile } from 'child_process';
import * as path from 'path';
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import type { DiffHunk } from '../types.js';
import { fileListTool, grepSearchTool, textResult, validatePath } from '../sdk/tool-helpers.js';
import type { VirtualFS } from './virtual-fs.js';

const SHELL_TIMEOUT = 30_000; // 30 seconds

export function createAgentToolServer(
  repoRoot: string,
  virtualFs: VirtualFS,
  onDiff: (relPath: string, hunks: DiffHunk[]) => void,
  options: { allowCommands?: boolean },
) {
  const fileRead = tool(
    'file_read',
    'Read the contents of a file. Returns the current content, including any edits you have made. Path is relative to the repository root.',
    { path: z.string().describe('File path relative to repo root') },
    async (args) => {
      try {
        const absPath = validatePath(args.path, repoRoot);
        const content = await virtualFs.read(absPath);
        return textResult(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error reading file: ${msg}`, true);
      }
    },
    { annotations: { readOnlyHint: true } },
  );

  const fileWrite = tool(
    'file_write',
    'Write the full contents of a file. The file will not be written to disk immediately -- changes are held for user review. Path is relative to the repository root.',
    {
      path: z.string().describe('File path relative to repo root'),
      content: z.string().describe('The complete file content to write'),
    },
    async (args) => {
      try {
        const absPath = validatePath(args.path, repoRoot);
        const hunks = await virtualFs.write(absPath, args.content);
        const relPath = path.relative(repoRoot, absPath);
        if (hunks.length > 0) {
          onDiff(relPath, hunks);
        }
        return textResult(`File written (pending review): ${relPath} -- ${hunks.length} change(s)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error writing file: ${msg}`, true);
      }
    },
  );

  const fileEdit = tool(
    'file_edit',
    'Make a targeted edit to a file by finding and replacing a specific string. The edit will not be applied to disk immediately -- changes are held for user review. Path is relative to the repository root.',
    {
      path: z.string().describe('File path relative to repo root'),
      old_string: z.string().describe('The exact string to find in the file'),
      new_string: z.string().describe('The replacement string'),
    },
    async (args) => {
      try {
        const absPath = validatePath(args.path, repoRoot);
        const hunks = await virtualFs.edit(absPath, args.old_string, args.new_string);
        const relPath = path.relative(repoRoot, absPath);
        if (hunks.length > 0) {
          onDiff(relPath, hunks);
        }
        return textResult(`Edit applied (pending review): ${relPath} -- ${hunks.length} change(s)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error editing file: ${msg}`, true);
      }
    },
  );

  const tools: SdkMcpToolDefinition<any>[] = [
    fileRead,
    fileWrite,
    fileEdit,
    grepSearchTool(repoRoot),
    fileListTool(repoRoot),
  ];

  if (options.allowCommands) {
    const shellExec = tool(
      'shell_exec',
      'Execute a shell command. Use this for running tests, build commands, or other shell operations.',
      {
        command: z.string().describe('The shell command to execute'),
        cwd: z.string().optional().describe('Working directory (relative to repo root)'),
      },
      async (args) => {
        try {
          const cwd = args.cwd ? validatePath(args.cwd, repoRoot) : repoRoot;

          const output = await new Promise<string>((resolve, reject) => {
            execFile(
              'sh',
              ['-c', args.command],
              { cwd, maxBuffer: 1024 * 1024, timeout: SHELL_TIMEOUT },
              (err, stdout, stderr) => {
                if (err && !stdout && !stderr) {
                  reject(err);
                } else {
                  const result = [
                    stdout ? `stdout:\n${stdout}` : '',
                    stderr ? `stderr:\n${stderr}` : '',
                    err ? `exit code: ${err.code}` : 'exit code: 0',
                  ]
                    .filter(Boolean)
                    .join('\n');
                  resolve(result);
                }
              },
            );
          });

          return textResult(output);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return textResult(`Error executing command: ${msg}`, true);
        }
      },
    );
    tools.push(shellExec);
  }

  return createSdkMcpServer({
    name: 'bonk-agent',
    tools,
  });
}
