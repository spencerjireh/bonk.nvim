export interface ChatSession {
  id: string;
  clientId: string;
  sdkSessionId: string | null;
  createdAt: number;
  lastActiveAt: number;
}

const SESSION_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  create(id: string, clientId: string): ChatSession {
    const session: ChatSession = {
      id,
      clientId,
      sdkSessionId: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): ChatSession | undefined {
    return this.sessions.get(id);
  }

  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActiveAt = Date.now();
    }
  }

  setSdkSessionId(id: string, sdkSessionId: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.sdkSessionId = sdkSessionId;
    }
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > SESSION_MAX_AGE) {
        this.sessions.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }
}
