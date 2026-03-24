import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../lifecycle/clients.js';
import { healthRoutes } from '../../routes/health.js';

describe('GET /health', () => {
  function createApp() {
    const clients = new ClientRegistry(60_000, () => {});
    return healthRoutes(clients, 'secret', Date.now());
  }

  it('returns 401 without valid token', async () => {
    const app = createApp();
    const res = await app.request('/health?token=wrong');
    expect(res.status).toBe(401);
  });

  it('returns status ok with valid token', async () => {
    const app = createApp();
    const res = await app.request('/health?token=secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns uptime and client count', async () => {
    const app = createApp();
    const res = await app.request('/health?token=secret');
    const body = await res.json();
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('clients');
  });
});
