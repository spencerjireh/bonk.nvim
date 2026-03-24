import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { AgentSessionManager } from './agent/sessions.js';
import { ChatSessionManager } from './chat/sessions.js';
import { EditTracker } from './context/edit-tracker.js';
import { RepoIndex } from './context/repo-index.js';
import { ClientRegistry } from './lifecycle/clients.js';
import { acquireLock, releaseLock } from './lifecycle/lock.js';
import { agentRoutes } from './routes/agent.js';
import { chatRoutes } from './routes/chat.js';
import { completeRoutes } from './routes/complete.js';
import { contextRoutes } from './routes/context.js';
import { healthRoutes } from './routes/health.js';
import { registerRoutes } from './routes/register.js';
import { statusRoutes } from './routes/status.js';

const args = process.argv.slice(2);
const repoRootIdx = args.indexOf('--repo-root');
const repoRoot = repoRootIdx !== -1 ? args[repoRootIdx + 1] : process.cwd();

const token = uuidv4();
const startedAt = Date.now();

const repoIndex = new RepoIndex(repoRoot);
const editTracker = new EditTracker();
const chatSessions = new ChatSessionManager();
const agentSessions = new AgentSessionManager();

function gracefulShutdown() {
  console.error('[bonk] shutting down');
  releaseLock();
  agentSessions.destroy();
  chatSessions.destroy();
  clients.destroy();
  process.exit(0);
}

const clients = new ClientRegistry(60_000, gracefulShutdown);

const app = new Hono();

app.route('/', healthRoutes(clients, token, startedAt));
app.route('/', registerRoutes(clients, token));
app.route('/', statusRoutes(clients, startedAt));
app.route('/', completeRoutes(clients, token, repoIndex, editTracker));
app.route('/', contextRoutes(token, editTracker));
app.route('/', chatRoutes(clients, token, repoIndex, chatSessions));
app.route('/', agentRoutes(clients, token, repoIndex, agentSessions));

const server = serve(
  {
    fetch: app.fetch,
    port: 0,
  },
  (info) => {
    const port = info.port;
    acquireLock(port, token);

    // Signal readiness -- Lua plugin parses this line
    const ready = JSON.stringify({ port, token });
    process.stdout.write(`BONK_READY:${ready}\n`);
    console.error(`[bonk] server listening on port ${port}`);
  },
);

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Index repo in background
repoIndex.build().catch((err) => {
  console.error('[bonk] repo index error:', err);
});
