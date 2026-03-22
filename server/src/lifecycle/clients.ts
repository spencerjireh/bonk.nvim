import type { ClientInfo } from '../types.js';

export class ClientRegistry {
  private clients = new Map<string, ClientInfo>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs: number;
  private onIdle: () => void;

  constructor(idleTimeoutMs: number, onIdle: () => void) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.onIdle = onIdle;
  }

  register(id: string): void {
    const now = Date.now();
    this.clients.set(id, {
      id,
      registered_at: now,
      last_seen: now,
    });
    this.clearIdleTimer();
  }

  unregister(id: string): void {
    this.clients.delete(id);
    if (this.clients.size === 0) {
      this.startIdleTimer();
    }
  }

  touch(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.last_seen = Date.now();
    }
  }

  has(id: string): boolean {
    return this.clients.has(id);
  }

  count(): number {
    return this.clients.size;
  }

  list(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  private startIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.clients.size === 0) {
        this.onIdle();
      }
    }, this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  destroy(): void {
    this.clearIdleTimer();
    this.clients.clear();
  }
}
