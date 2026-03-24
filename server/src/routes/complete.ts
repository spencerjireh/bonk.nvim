import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { assembleContext } from '../context/assembler.js';
import type { EditTracker } from '../context/edit-tracker.js';
import type { RepoIndex } from '../context/repo-index.js';
import type { ClientRegistry } from '../lifecycle/clients.js';
import { streamCompletion } from '../sdk/client.js';
import type { CompleteRequest } from '../types.js';

// Track active requests per client for cancellation
const activeRequests = new Map<string, AbortController>();

export function completeRoutes(
  clients: ClientRegistry,
  token: string,
  repoIndex: RepoIndex,
  editTracker: EditTracker,
): Hono {
  const app = new Hono();

  app.post('/complete', async (c) => {
    const body = await c.req.json<CompleteRequest>();

    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    // Cancel any previous request for this client
    const prev = activeRequests.get(body.client_id);
    if (prev) {
      prev.abort();
    }

    const controller = new AbortController();
    activeRequests.set(body.client_id, controller);

    // Touch the client's last_seen
    clients.touch(body.client_id);

    // Assemble context
    const prompt = await assembleContext(body, repoIndex, editTracker);

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of streamCompletion(
          prompt,
          { model: body.options?.model, cwd: repoIndex.root },
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
            case 'done':
              await stream.writeSSE({
                event: 'done',
                data: JSON.stringify({
                  full_text: event.full_text,
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

  return app;
}
