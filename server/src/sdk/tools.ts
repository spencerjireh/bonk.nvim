import * as fs from 'fs/promises';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { MAX_FILE_SIZE, fileListTool, grepSearchTool, textResult, validatePath } from './tool-helpers.js';

export function createChatToolServer(repoRoot: string) {
  const fileRead = tool(
    'file_read',
    'Read the contents of a file. Path is relative to the repository root.',
    { path: z.string().describe('File path relative to repo root') },
    async (args) => {
      try {
        const absPath = validatePath(args.path, repoRoot);
        const stat = await fs.stat(absPath);
        if (stat.size > MAX_FILE_SIZE) {
          return textResult(`File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`, true);
        }
        const content = await fs.readFile(absPath, 'utf-8');
        return textResult(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error reading file: ${msg}`, true);
      }
    },
    { annotations: { readOnlyHint: true } },
  );

  return createSdkMcpServer({
    name: 'bonk-chat',
    tools: [fileRead, grepSearchTool(repoRoot), fileListTool(repoRoot)],
  });
}
