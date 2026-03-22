import { Hono } from 'hono';
import type { ClientRegistry } from '../lifecycle/clients.js';

export function registerRoutes(clients: ClientRegistry, token: string): Hono {
  const app = new Hono();

  app.post('/register', async (c) => {
    const body = await c.req.json<{ token: string; client_id: string }>();
    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    clients.register(body.client_id);
    return c.json({ status: 'registered', client_id: body.client_id });
  });

  app.post('/unregister', async (c) => {
    const body = await c.req.json<{ token: string; client_id: string }>();
    if (body.token !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    clients.unregister(body.client_id);
    return c.json({ status: 'unregistered', client_id: body.client_id });
  });

  return app;
}
