import { query } from '@anthropic-ai/claude-agent-sdk';

const COMPLETION_SYSTEM_PROMPT = `You are a code completion engine. Given a file with a cursor position marked by <|CURSOR|>, output ONLY the code that should be inserted at that position.

Rules:
- Output raw code only. No markdown fences. No explanations.
- Match the surrounding style, indentation, and conventions.
- Complete the logical unit: finish the statement, block, or function.
- If the cursor is mid-line, complete the rest of the line and any following lines that logically belong.
- Stop when the completion is naturally complete. Do not over-generate.
- Use context from other files and recent edits to inform your completion.`;

export interface CompletionToken {
  type: 'token';
  text: string;
}

export interface CompletionDone {
  type: 'done';
  full_text: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface CompletionError {
  type: 'error';
  message: string;
  code: string;
}

export type CompletionEvent = CompletionToken | CompletionDone | CompletionError;

export async function* streamCompletion(
  prompt: string,
  options: { model?: string; cwd?: string },
  signal?: AbortSignal,
): AsyncGenerator<CompletionEvent> {
  let fullText = '';

  try {
    for await (const message of query({
      prompt,
      options: {
        systemPrompt: COMPLETION_SYSTEM_PROMPT,
        maxTurns: 1,
        allowedTools: [],
        disallowedTools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        model: options.model ?? 'claude-opus-4-6',
        cwd: options.cwd,
      },
    })) {
      if (signal?.aborted) break;

      // Final result message
      if ('result' in message && typeof message.result === 'string') {
        fullText = message.result;
        continue;
      }

      // Intermediate assistant messages with content blocks
      if (message && typeof message === 'object' && 'content' in message) {
        const content = (message as any).content;
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
      }
    }

    yield {
      type: 'done',
      full_text: fullText,
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message: msg, code: 'SDK_ERROR' };
  }
}
