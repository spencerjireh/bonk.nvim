import { Hono } from 'hono';
import type { EditTracker } from '../context/edit-tracker.js';

export function contextRoutes(token: string, editTracker: EditTracker): Hono {
  const app = new Hono();

  app.post('/context/edit', async (c) => {
    const body = await c.req.json<{ token: string; path: string; diff: string }>();
    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    editTracker.addEdit(body.path, body.diff);
    return c.json({ status: 'ok' });
  });

  app.post('/context/buffers', async (c) => {
    const body = await c.req.json<{
      token: string;
      buffers: { path: string; content: string }[];
    }>();
    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    // Buffer list is sent with each /complete request, so this endpoint
    // is mainly for future use (e.g., pre-caching or indexing)
    return c.json({ status: 'ok', count: body.buffers.length });
  });

  return app;
}
