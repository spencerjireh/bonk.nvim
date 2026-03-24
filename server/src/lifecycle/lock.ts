import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { LockFile } from '../types.js';

const STATE_DIR = join(homedir(), '.local', 'state', 'bonk');
const LOCK_PATH = join(STATE_DIR, 'server.lock');

export function acquireLock(port: number, token: string): void {
  mkdirSync(STATE_DIR, { recursive: true });

  const lock: LockFile = {
    pid: process.pid,
    port,
    token,
    started_at: new Date().toISOString(),
  };

  // Atomic write: write to temp file then rename
  const tmp = `${LOCK_PATH}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(lock, null, 2));
  renameSync(tmp, LOCK_PATH);
}

export function releaseLock(): void {
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // Already removed or never created
  }
}

export function readLock(): LockFile | null {
  try {
    const raw = readFileSync(LOCK_PATH, 'utf-8');
    return JSON.parse(raw) as LockFile;
  } catch {
    return null;
  }
}

export function isStale(lock: LockFile): boolean {
  try {
    process.kill(lock.pid, 0);
    return false;
  } catch {
    return true;
  }
}

export function getLockPath(): string {
  return LOCK_PATH;
}
