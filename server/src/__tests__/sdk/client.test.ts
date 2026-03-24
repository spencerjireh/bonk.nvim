import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

import { streamCompletion } from '../../sdk/client.js';

async function* fakeQuery(messages: any[]) {
  for (const msg of messages) {
    yield msg;
  }
}

async function collect(gen: AsyncGenerator<any>) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('streamCompletion', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('yields token events from assistant content blocks', async () => {
    mockQuery.mockReturnValue(
      fakeQuery([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'hello world' }] },
          session_id: 'sid',
        },
      ]),
    );

    const events = await collect(streamCompletion('test', { cwd: '/tmp' }));
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].text).toBe('hello world');
  });

  it('yields done event with full_text', async () => {
    mockQuery.mockReturnValue(
      fakeQuery([
        { type: 'result', subtype: 'success', result: 'completed code', session_id: 'sid' },
      ]),
    );

    const events = await collect(streamCompletion('test', { cwd: '/tmp' }));
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect(done!.full_text).toBe('completed code');
  });

  it('yields error event on SDK throw', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        throw new Error('auth failed');
      })(),
    );

    const events = await collect(streamCompletion('test', { cwd: '/tmp' }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', code: 'SDK_ERROR' });
  });

  it('stops on abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    mockQuery.mockReturnValue(
      fakeQuery([
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'hello' }] },
          session_id: 'sid',
        },
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'more' }] },
          session_id: 'sid',
        },
      ]),
    );

    const events = await collect(streamCompletion('test', { cwd: '/tmp' }, controller.signal));
    // Should have at most the done event (loop breaks immediately)
    expect(events.length).toBeLessThanOrEqual(1);
  });

  it('passes model option to query', async () => {
    mockQuery.mockReturnValue(fakeQuery([]));

    await collect(streamCompletion('test', { model: 'claude-sonnet-4-6', cwd: '/tmp' }));
    expect(mockQuery).toHaveBeenCalledOnce();
    const opts = mockQuery.mock.calls[0][0].options;
    expect(opts.model).toBe('claude-sonnet-4-6');
  });
});
