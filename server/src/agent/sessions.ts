import { VirtualFS } from './virtual-fs.js';

export interface AgentSession {
  id: string;
  clientId: string;
  task: string;
  status: 'running' | 'complete' | 'error' | 'stopped';
  virtualFs: VirtualFS;
  createdAt: number;
}

const SESSION_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

export class AgentSessionManager {
  private sessions = new Map<string, AgentSession>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  create(id: string, clientId: string, task: string, repoRoot: string): AgentSession {
    const session: AgentSession = {
      id,
      clientId,
      task,
      status: 'running',
      virtualFs: new VirtualFS(repoRoot),
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  setStatus(id: string, status: AgentSession['status']): void {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
    }
  }

  delete(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.virtualFs.reset();
    }
    this.sessions.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.status === 'running') continue;
      if (now - session.createdAt > SESSION_MAX_AGE) {
        session.virtualFs.reset();
        this.sessions.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    for (const session of this.sessions.values()) {
      session.virtualFs.reset();
    }
    this.sessions.clear();
  }
}
