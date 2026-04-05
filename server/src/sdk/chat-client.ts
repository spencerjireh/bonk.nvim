import { query } from '@anthropic-ai/claude-agent-sdk';
import type { McpSdkServerConfigWithInstance, Options } from '@anthropic-ai/claude-agent-sdk';
import {
  chunkText,
  getE2eChatText,
  getE2eChatToolName,
  getE2eChatToolStatus,
  getE2eStreamChunkSize,
  getE2eStreamDelayMs,
  isE2eMode,
  maybeDelay,
} from './e2e.js';

const CHAT_SYSTEM_PROMPT = `You are a coding assistant embedded in Neovim. The user will ask questions about their code. You have access to their current file, selection, and referenced files. You also have tools to read files, search the codebase, and list directories.

Rules:
- Be concise and direct.
- When showing code, use markdown fences with the correct language.
- Reference specific line numbers when discussing code.
- If you need more context, use your tools to read files or search the codebase.
- Do not make changes to files. You are a read-only assistant in this mode.`;

export interface ChatToken {
  type: 'token';
  text: string;
}

export interface ChatToolUse {
  type: 'tool_use';
  tool: string;
  status: string;
}

export interface ChatDone {
  type: 'done';
  session_id: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface ChatError {
  type: 'error';
  message: string;
  code: string;
}

export type ChatEvent = ChatToken | ChatToolUse | ChatDone | ChatError;

export async function* streamChat(
  message: string,
  context: string,
  options: {
    model?: string;
    cwd?: string;
    sdkSessionId?: string | null;
    toolServer: McpSdkServerConfigWithInstance;
  },
  signal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  let fullText = '';
  let sessionId = '';
  let resultUsage = { input_tokens: 0, output_tokens: 0 };

  const prompt = context ? `${context}\n\n${message}` : message;

  try {
    if (isE2eMode()) {
      const delayMs = getE2eStreamDelayMs();
      const toolStatus = getE2eChatToolStatus();
      if (toolStatus) {
        yield { type: 'tool_use', tool: getE2eChatToolName(), status: toolStatus };
        await maybeDelay(delayMs);
      }

      sessionId = options.sdkSessionId ?? 'e2e-chat-session';
      for (const chunk of chunkText(getE2eChatText(), getE2eStreamChunkSize())) {
        if (signal?.aborted) break;
        yield { type: 'token', text: chunk };
        fullText += chunk;
        await maybeDelay(delayMs);
      }

      yield {
        type: 'done',
        session_id: sessionId,
        usage: resultUsage,
      };
      return;
    }

    const queryOpts: Options = {
      systemPrompt: CHAT_SYSTEM_PROMPT,
      model: options.model ?? 'claude-opus-4-6',
      cwd: options.cwd,
      tools: [],
      mcpServers: { 'bonk-chat': options.toolServer },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 10,
      includePartialMessages: true,
      persistSession: true,
    };

    if (options.sdkSessionId) {
      queryOpts.resume = options.sdkSessionId;
    }

    for await (const event of query({ prompt, options: queryOpts })) {
      if (signal?.aborted) break;

      if (!('type' in event)) continue;

      // Partial streaming token
      if (event.type === 'stream_event') {
        const streamEvent = event.event;
        if (
          streamEvent?.type === 'content_block_delta' &&
          'delta' in streamEvent &&
          streamEvent.delta?.type === 'text_delta'
        ) {
          const text = (streamEvent.delta as { type: string; text: string }).text;
          if (text) {
            fullText += text;
            yield { type: 'token', text };
          }
        }
        continue;
      }

      // Tool use summary
      if (event.type === 'tool_use_summary') {
        yield { type: 'tool_use', tool: 'tool', status: event.summary };
        continue;
      }

      // Final result
      if (event.type === 'result' && 'subtype' in event && event.subtype === 'success') {
        sessionId = event.session_id;
        const result = event.result;
        if (typeof result === 'string' && result.length > fullText.length) {
          const newText = result.slice(fullText.length);
          if (newText) {
            yield { type: 'token', text: newText };
          }
          fullText = result;
        }
        if (event.usage) {
          resultUsage = {
            input_tokens: event.usage.input_tokens ?? 0,
            output_tokens: event.usage.output_tokens ?? 0,
          };
        }
        continue;
      }

      // Assistant message with content blocks (non-streaming fallback)
      if (event.type === 'assistant') {
        const content = event.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === 'text' && typeof block.text === 'string') {
              const newText = block.text.slice(fullText.length);
              if (newText) {
                fullText = block.text;
                yield { type: 'token', text: newText };
              }
            }
          }
        }

        sessionId = event.session_id;
      }
    }

    yield {
      type: 'done',
      session_id: sessionId,
      usage: resultUsage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message: msg, code: 'SDK_ERROR' };
  }
}
