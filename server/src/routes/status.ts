import { Hono } from 'hono';
import type { ClientRegistry } from '../lifecycle/clients.js';

export function statusRoutes(clients: ClientRegistry, startedAt: number): Hono {
  const app = new Hono();

  app.get('/status', (c) => {
    return c.json({
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      clients: clients.list(),
      client_count: clients.count(),
    });
  });

  return app;
}
