import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AgentSessionManager } from '../agent/sessions.js';
import { createAgentToolServer } from '../agent/tools.js';
import type { RepoIndex } from '../context/repo-index.js';
import type { ClientRegistry } from '../lifecycle/clients.js';
import { streamAgentTask } from '../sdk/agent-client.js';
import type { AgentDiff } from '../sdk/agent-client.js';
import type { AgentRequest } from '../types.js';

const activeRequests = new Map<string, AbortController>();

export function agentRoutes(
  clients: ClientRegistry,
  token: string,
  repoIndex: RepoIndex,
  agentSessions: AgentSessionManager,
): Hono {
  const app = new Hono();

  app.post('/agent', async (c) => {
    const body = await c.req.json<AgentRequest>();

    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    // Cancel any previous agent request for this client
    const prev = activeRequests.get(body.client_id);
    if (prev) {
      prev.abort();
    }

    const controller = new AbortController();
    activeRequests.set(body.client_id, controller);

    clients.touch(body.client_id);

    // Create session
    const sessionId = body.session_id ?? `agent-${Date.now()}`;
    const session = agentSessions.create(sessionId, body.client_id, body.task, repoIndex.root);

    // Shared array for tool -> generator communication
    const pendingDiffs: AgentDiff[] = [];

    // Create tool server with onDiff callback
    const toolServer = createAgentToolServer(
      repoIndex.root,
      session.virtualFs,
      (relPath, hunks) => {
        pendingDiffs.push({ type: 'diff', path: relPath, hunks });
      },
      { allowCommands: body.options?.allow_commands ?? false },
    );

    // Build context
    const contextParts: string[] = [];
    if (body.context?.file_path) {
      const content = await repoIndex.getFileContent(body.context.file_path);
      if (content) {
        contextParts.push(
          `<current_file path="${body.context.file_path}" filetype="${body.context.filetype ?? ''}">\n${content}\n</current_file>`,
        );
      }
    }
    if (body.context?.selection) {
      contextParts.push(`<selection>\n${body.context.selection.text}\n</selection>`);
    }
    const context = contextParts.join('\n\n');

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of streamAgentTask(
          body.task,
          context,
          {
            model: body.options?.model,
            cwd: repoIndex.root,
            maxTurns: body.options?.max_turns,
            toolServer,
          },
          pendingDiffs,
          controller.signal,
        )) {
          if (controller.signal.aborted) break;

          switch (event.type) {
            case 'status':
              await stream.writeSSE({
                event: 'status',
                data: JSON.stringify({ phase: event.phase, message: event.message }),
              });
              break;
            case 'tool_use':
              await stream.writeSSE({
                event: 'tool_use',
                data: JSON.stringify({ tool: event.tool, status: event.status }),
              });
              break;
            case 'diff':
              await stream.writeSSE({
                event: 'diff',
                data: JSON.stringify({ path: event.path, hunks: event.hunks }),
              });
              break;
            case 'done':
              agentSessions.setStatus(session.id, 'complete');
              await stream.writeSSE({
                event: 'done',
                data: JSON.stringify({
                  session_id: session.id,
                  files_modified: event.files_modified,
                  usage: event.usage,
                }),
              });
              break;
            case 'error':
              agentSessions.setStatus(session.id, 'error');
              await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({ message: event.message, code: event.code }),
              });
              break;
          }
        }
      } finally {
        if (activeRequests.get(body.client_id) === controller) {
          activeRequests.delete(body.client_id);
        }
      }
    });
  });

  app.post('/agent/stop', async (c) => {
    const body = await c.req.json<{ token: string; client_id: string; session_id?: string }>();

    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const controller = activeRequests.get(body.client_id);
    if (controller) {
      controller.abort();
      activeRequests.delete(body.client_id);
    }

    if (body.session_id) {
      agentSessions.setStatus(body.session_id, 'stopped');
    }

    return c.json({ status: 'stopped' });
  });

  return app;
}
