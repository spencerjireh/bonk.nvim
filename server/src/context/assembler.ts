import type { CompleteRequest } from '../types.js';
import type { EditTracker } from './edit-tracker.js';
import { resolveImports } from './import-resolver.js';
import type { RepoIndex } from './repo-index.js';

const DEFAULT_BUDGET = 32_768;
const PREFIX_RATIO = 0.75;

export async function assembleContext(
  request: CompleteRequest,
  repoIndex: RepoIndex,
  editTracker: EditTracker,
): Promise<string> {
  const budget = request.options?.context_budget ?? DEFAULT_BUDGET;
  const parts: string[] = [];
  let used = 0;

  // P1: Current file with cursor marker (mandatory)
  const currentFile = buildCurrentFileBlock(request);
  parts.push(currentFile);
  used += currentFile.length;

  // P2: Recent edits (mandatory)
  const recentEdits = editTracker.getRecentEdits(10);
  if (recentEdits.length > 0) {
    const editsBlock = buildEditsBlock(recentEdits);
    parts.push(editsBlock);
    used += editsBlock.length;
  }

  // P3: Imported files (fill)
  const relPath = request.file_path.replace(`${repoIndex.root}/`, '');
  const language = mapFiletype(request.filetype);
  const imports = resolveImports(relPath, request.buffer_content, language, repoIndex);

  for (const imp of imports) {
    if (used >= budget) break;
    const content = await repoIndex.getFileContent(imp);
    if (!content) continue;
    const block = `<file path="${imp}">\n${truncate(content, budget - used - 50)}\n</file>\n`;
    parts.push(block);
    used += block.length;
  }

  // P4: Open buffers (fill)
  if (request.context?.open_buffers) {
    for (const buf of request.context.open_buffers) {
      if (used >= budget) break;
      if (buf.path === request.file_path) continue;
      const block = `<file path="${buf.path}">\n${truncate(buf.content, budget - used - 50)}\n</file>\n`;
      parts.push(block);
      used += block.length;
    }
  }

  // P5: Repo tree (fill)
  if (used < budget) {
    const tree = repoIndex.getTree();
    if (tree.length > 0) {
      const treeStr = tree.join('\n');
      const block = `<repo_tree>\n${truncate(treeStr, budget - used - 30)}\n</repo_tree>\n`;
      parts.push(block);
    }
  }

  return parts.join('\n');
}

function buildCurrentFileBlock(request: CompleteRequest): string {
  const lines = request.buffer_content.split('\n');
  const { line, col } = request.cursor;

  // Insert cursor marker at position
  if (line >= 0 && line < lines.length) {
    const cursorLine = lines[line];
    const clampedCol = Math.min(col, cursorLine.length);
    lines[line] = `${cursorLine.slice(0, clampedCol)}<|CURSOR|>${cursorLine.slice(clampedCol)}`;
  } else if (line >= lines.length) {
    lines.push('<|CURSOR|>');
  }

  const content = lines.join('\n');
  return `<current_file path="${request.file_path}" filetype="${request.filetype}">\n${content}\n</current_file>\n`;
}

function buildEditsBlock(edits: { path: string; diff: string }[]): string {
  const parts = edits.map((e) => `--- ${e.path}\n${e.diff}`);
  return `<recent_edits>\n${parts.join('\n')}\n</recent_edits>\n`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n... (truncated)`;
}

function mapFiletype(ft: string): string {
  const map: Record<string, string> = {
    typescript: 'typescript',
    typescriptreact: 'typescriptreact',
    javascript: 'javascript',
    javascriptreact: 'javascriptreact',
    python: 'python',
    rust: 'rust',
    go: 'go',
    lua: 'lua',
    c: 'c',
    cpp: 'cpp',
    ruby: 'ruby',
    java: 'java',
  };
  return map[ft] ?? ft;
}
