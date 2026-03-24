import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientRegistry } from '../../lifecycle/clients.js';

describe('ClientRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers and counts clients', () => {
    const registry = new ClientRegistry(60_000, () => {});
    registry.register('c1');
    registry.register('c2');
    expect(registry.count()).toBe(2);
  });

  it('unregisters clients', () => {
    const registry = new ClientRegistry(60_000, () => {});
    registry.register('c1');
    registry.unregister('c1');
    expect(registry.count()).toBe(0);
  });

  it('touch updates last_seen', () => {
    const registry = new ClientRegistry(60_000, () => {});
    registry.register('c1');
    const before = registry.list()[0].last_seen;

    vi.advanceTimersByTime(1000);
    registry.touch('c1');
    const after = registry.list()[0].last_seen;

    expect(after).toBeGreaterThan(before);
  });

  it('calls onIdle after all clients unregister and timeout', () => {
    const onIdle = vi.fn();
    const registry = new ClientRegistry(5_000, onIdle);
    registry.register('c1');
    registry.unregister('c1');

    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('cancels idle timer when new client registers', () => {
    const onIdle = vi.fn();
    const registry = new ClientRegistry(5_000, onIdle);
    registry.register('c1');
    registry.unregister('c1');

    vi.advanceTimersByTime(3_000);
    registry.register('c2');
    vi.advanceTimersByTime(5_000);

    expect(onIdle).not.toHaveBeenCalled();
  });

  it('destroy clears timers and clients', () => {
    const registry = new ClientRegistry(60_000, () => {});
    registry.register('c1');
    registry.destroy();
    expect(registry.count()).toBe(0);
  });
});
