import { dirname, join, resolve } from 'node:path';
import type { RepoIndex } from './repo-index.js';

// Regex patterns for import detection
const PATTERNS: { lang: string[]; regex: RegExp }[] = [
  // JS/TS: import ... from '...' or import '...'
  {
    lang: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    regex: /(?:import\s+.*?\s+from\s+|import\s+)['"]([^'"]+)['"]/g,
  },
  // JS/TS: require('...')
  {
    lang: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    regex: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  },
  // Python: from ... import ... or import ...
  { lang: ['python'], regex: /(?:from\s+(\S+)\s+import|import\s+(\S+))/g },
  // Rust: use ...
  { lang: ['rust'], regex: /use\s+(?:crate::)?(\S+?);/g },
  // C/C++: #include "..."
  { lang: ['c', 'cpp'], regex: /#include\s+"([^"]+)"/g },
  // Lua: require('...')
  { lang: ['lua'], regex: /require\s*\(?['"]([^'"]+)['"]\)?/g },
];

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

export function resolveImports(
  filePath: string,
  content: string,
  language: string,
  repoIndex: RepoIndex,
): string[] {
  const resolved: string[] = [];
  const fileDir = dirname(filePath);

  for (const { lang, regex } of PATTERNS) {
    if (!lang.includes(language)) continue;

    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(content)) !== null) {
      const importPath = match[1] ?? match[2];
      if (!importPath) continue;

      // Skip package imports (no relative path indicator)
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;

      const absPath = resolve(join(repoIndex.root, fileDir), importPath);
      const relPath = absPath.replace(`${repoIndex.root}/`, '');

      // Try exact match first
      if (repoIndex.getFile(relPath)) {
        resolved.push(relPath);
        continue;
      }

      // Try with common extensions
      if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(language)) {
        for (const ext of JS_EXTENSIONS) {
          const withExt = relPath + ext;
          if (repoIndex.getFile(withExt)) {
            resolved.push(withExt);
            break;
          }
          // Try index file
          const indexPath = join(relPath, `index${ext}`);
          if (repoIndex.getFile(indexPath)) {
            resolved.push(indexPath);
            break;
          }
        }
      }
    }
  }

  return [...new Set(resolved)];
}
