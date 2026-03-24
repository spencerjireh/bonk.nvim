import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export interface FileEntry {
  path: string;
  size: number;
  language: string;
  lastModified: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.lua': 'lua',
  '.rb': 'ruby',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.proto': 'protobuf',
  '.vim': 'vim',
  '.el': 'elisp',
  '.zig': 'zig',
  '.nix': 'nix',
};

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '__pycache__',
  '.cache',
  '.next',
  '.nuxt',
  'target',
  'vendor',
  '.venv',
  'venv',
  'env',
  '.tox',
  'coverage',
]);

const MAX_FILE_SIZE = 1_048_576; // 1MB

export class RepoIndex {
  readonly root: string;
  private files = new Map<string, FileEntry>();

  constructor(root: string) {
    this.root = root;
  }

  async build(): Promise<void> {
    this.files.clear();
    await this.walk(this.root);
  }

  private async walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const s = await stat(fullPath);
          if (s.size > MAX_FILE_SIZE) continue;

          const relPath = relative(this.root, fullPath);
          const ext = extname(entry.name).toLowerCase();
          const language = LANGUAGE_MAP[ext] ?? 'unknown';

          this.files.set(relPath, {
            path: relPath,
            size: s.size,
            language,
            lastModified: s.mtimeMs,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  getFile(relPath: string): FileEntry | undefined {
    return this.files.get(relPath);
  }

  async getFileContent(relPath: string): Promise<string | null> {
    try {
      return await readFile(join(this.root, relPath), 'utf-8');
    } catch {
      return null;
    }
  }

  getTree(): string[] {
    return Array.from(this.files.keys()).sort();
  }

  size(): number {
    return this.files.size;
  }
}
