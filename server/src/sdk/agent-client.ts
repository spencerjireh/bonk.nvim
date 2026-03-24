import { query } from '@anthropic-ai/claude-agent-sdk';
import type { McpSdkServerConfigWithInstance, Options } from '@anthropic-ai/claude-agent-sdk';
import type { DiffHunk } from '../types.js';

const AGENT_SYSTEM_PROMPT = `You are an autonomous coding agent embedded in Neovim. You can read files, search code, and make edits to complete the user's task.

Rules:
- Always read relevant files before making changes.
- Make minimal, focused changes that preserve existing code style.
- After making edits, re-read the file to verify your changes.
- If you encounter an error, explain what went wrong.
- Report all files you modify.`;

export interface AgentStatus {
  type: 'status';
  phase: string;
  message: string;
}

export interface AgentToolUse {
  type: 'tool_use';
  tool: string;
  status: string;
}

export interface AgentDiff {
  type: 'diff';
  path: string;
  hunks: DiffHunk[];
}

export interface AgentDone {
  type: 'done';
  files_modified: number;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AgentError {
  type: 'error';
  message: string;
  code: string;
}

export type AgentEvent = AgentStatus | AgentToolUse | AgentDiff | AgentDone | AgentError;

export async function* streamAgentTask(
  task: string,
  context: string,
  options: {
    model?: string;
    cwd?: string;
    maxTurns?: number;
    toolServer: McpSdkServerConfigWithInstance;
  },
  pendingDiffs: AgentDiff[],
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  let fullText = '';
  let filesModified = 0;
  let resultUsage = { input_tokens: 0, output_tokens: 0 };

  const prompt = context ? `${context}\n\nTask: ${task}` : task;

  try {
    yield { type: 'status', phase: 'analyzing', message: 'Starting task...' };

    const queryOpts: Options = {
      systemPrompt: AGENT_SYSTEM_PROMPT,
      model: options.model ?? 'claude-opus-4-6',
      cwd: options.cwd,
      tools: [],
      mcpServers: { 'bonk-agent': options.toolServer },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: options.maxTurns ?? 25,
      includePartialMessages: true,
      persistSession: false,
    };

    for await (const message of query({ prompt, options: queryOpts })) {
      if (signal?.aborted) break;

      // Drain any diffs emitted by tool handlers
      for (let diff = pendingDiffs.shift(); diff; diff = pendingDiffs.shift()) {
        filesModified++;
        yield diff;
      }

      if (!('type' in message)) continue;

      // Streaming text tokens
      if (message.type === 'stream_event') {
        const event = message.event;
        if (
          event?.type === 'content_block_delta' &&
          'delta' in event &&
          event.delta?.type === 'text_delta'
        ) {
          const text = (event.delta as { type: string; text: string }).text;
          if (text) {
            yield { type: 'status', phase: 'working', message: text };
          }
        }
        continue;
      }

      // Tool use summary
      if (message.type === 'tool_use_summary') {
        yield { type: 'tool_use', tool: 'tool', status: message.summary };
        continue;
      }

      // Final result
      if (message.type === 'result' && 'subtype' in message && message.subtype === 'success') {
        const result = message.result;
        if (typeof result === 'string' && result.length > fullText.length) {
          fullText = result;
        }
        if (message.usage) {
          resultUsage = {
            input_tokens: message.usage.input_tokens ?? 0,
            output_tokens: message.usage.output_tokens ?? 0,
          };
        }
        continue;
      }

      // Assistant message
      if (message.type === 'assistant') {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'text' && typeof block.text === 'string') {
              if (block.text.length > fullText.length) {
                fullText = block.text;
              }
            }
          }
        }
      }
    }

    // Drain any remaining diffs
    for (let diff = pendingDiffs.shift(); diff; diff = pendingDiffs.shift()) {
      filesModified++;
      yield diff;
    }

    yield {
      type: 'done',
      files_modified: filesModified,
      usage: resultUsage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message: msg, code: 'SDK_ERROR' };
  }
}
