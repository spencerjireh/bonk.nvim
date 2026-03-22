import { Hono } from 'hono';
import type { ClientRegistry } from '../lifecycle/clients.js';

export function healthRoutes(clients: ClientRegistry, token: string, startedAt: number): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    const t = c.req.query('token');
    if (t !== token) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return c.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      clients: clients.count(),
    });
  });

  return app;
}
