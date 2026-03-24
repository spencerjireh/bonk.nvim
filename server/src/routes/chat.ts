import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { assembleChatContext } from '../chat/context.js';
import type { ChatSessionManager } from '../chat/sessions.js';
import type { RepoIndex } from '../context/repo-index.js';
import type { ClientRegistry } from '../lifecycle/clients.js';
import { streamChat } from '../sdk/chat-client.js';
import { createChatToolServer } from '../sdk/tools.js';
import type { ChatRequest } from '../types.js';

const activeRequests = new Map<string, AbortController>();

export function chatRoutes(
  clients: ClientRegistry,
  token: string,
  repoIndex: RepoIndex,
  chatSessions: ChatSessionManager,
): Hono {
  const app = new Hono();

  app.post('/chat', async (c) => {
    const body = await c.req.json<ChatRequest>();

    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    // Cancel any previous chat request for this client
    const prev = activeRequests.get(body.client_id);
    if (prev) {
      prev.abort();
    }

    const controller = new AbortController();
    activeRequests.set(body.client_id, controller);

    clients.touch(body.client_id);

    // Get or create session
    let session = body.session_id ? chatSessions.get(body.session_id) : undefined;

    if (!session) {
      const sessionId = body.session_id ?? `chat-${Date.now()}`;
      session = chatSessions.create(sessionId, body.client_id);
    } else {
      chatSessions.touch(session.id);
    }

    const currentSession = session;

    // Assemble context
    const context = await assembleChatContext(body, repoIndex);

    // Create tool server
    const toolServer = createChatToolServer(repoIndex.root);

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of streamChat(
          body.message,
          context,
          {
            model: body.options?.model,
            cwd: repoIndex.root,
            sdkSessionId: currentSession.sdkSessionId,
            toolServer,
          },
          controller.signal,
        )) {
          if (controller.signal.aborted) break;

          switch (event.type) {
            case 'token':
              await stream.writeSSE({
                event: 'token',
                data: JSON.stringify({ text: event.text }),
              });
              break;
            case 'tool_use':
              await stream.writeSSE({
                event: 'tool_use',
                data: JSON.stringify({ tool: event.tool, status: event.status }),
              });
              break;
            case 'done':
              // Store SDK session ID for future resume
              if (event.session_id) {
                chatSessions.setSdkSessionId(currentSession.id, event.session_id);
              }
              await stream.writeSSE({
                event: 'done',
                data: JSON.stringify({
                  session_id: currentSession.id,
                  usage: event.usage,
                }),
              });
              break;
            case 'error':
              await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({
                  message: event.message,
                  code: event.code,
                }),
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

  app.post('/chat/clear', async (c) => {
    const body = await c.req.json<{ token: string; session_id: string }>();

    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    chatSessions.delete(body.session_id);
    return c.json({ status: 'ok' });
  });

  return app;
}
