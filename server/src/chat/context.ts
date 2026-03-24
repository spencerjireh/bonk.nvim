import type { RepoIndex } from '../context/repo-index.js';
import type { ChatRequest } from '../types.js';

export async function assembleChatContext(
  request: ChatRequest,
  repoIndex: RepoIndex,
): Promise<string> {
  const parts: string[] = [];
  const ctx = request.context;
  if (!ctx) return '';

  // Include visual selection if present
  if (ctx.selection) {
    const range = `${ctx.selection.start.line + 1}-${ctx.selection.end.line + 1}`;
    const filePath = ctx.file_path ?? 'unknown';
    parts.push(
      `<selection path="${filePath}" lines="${range}">\n${ctx.selection.text}\n</selection>`,
    );
  }

  // Include current file context (if no selection, include file info)
  if (ctx.file_path && !ctx.selection) {
    const content = await repoIndex.getFileContent(ctx.file_path);
    if (content) {
      parts.push(
        `<current_file path="${ctx.file_path}" filetype="${ctx.filetype ?? ''}">\n${content}\n</current_file>`,
      );
    }
  }

  // Include mentioned files
  if (ctx.mentions) {
    for (const mention of ctx.mentions) {
      if (mention.type === 'file') {
        const content = await repoIndex.getFileContent(mention.path);
        if (content) {
          parts.push(`<file path="${mention.path}">\n${content}\n</file>`);
        }
      }
    }
  }

  return parts.join('\n\n');
}
