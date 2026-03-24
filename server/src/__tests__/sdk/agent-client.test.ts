import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: any[]) => mockQuery(...args),
  createSdkMcpServer: vi.fn(() => ({})),
  tool: vi.fn(),
}));

import { streamAgentTask } from '../../sdk/agent-client.js';
import type { AgentDiff, AgentEvent } from '../../sdk/agent-client.js';

async function* fakeQuery(messages: any[]) {
  for (const msg of messages) yield msg;
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe('streamAgentTask', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('yields initial status event', async () => {
    mockQuery.mockReturnValue(
      fakeQuery([{ type: 'result', subtype: 'success', result: 'done', session_id: 'sid' }]),
    );

    const diffs: AgentDiff[] = [];
    const events = await collect(
      streamAgentTask('test task', '', { cwd: '/tmp', toolServer: {} as any }, diffs),
    );

    expect(events[0]).toMatchObject({ type: 'status', phase: 'analyzing' });
  });

  it('yields done event with files_modified count', async () => {
    mockQuery.mockReturnValue(
      fakeQuery([{ type: 'result', subtype: 'success', result: 'done', session_id: 'sid' }]),
    );

    const diffs: AgentDiff[] = [];
    const events = await collect(
      streamAgentTask('task', '', { cwd: '/tmp', toolServer: {} as any }, diffs),
    );

    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect((done as any).files_modified).toBe(0);
  });

  it('drains pendingDiffs during iteration', async () => {
    // Simulate tool handler pushing diffs during query iteration
    const diffs: AgentDiff[] = [];

    mockQuery.mockReturnValue(
      (async function* () {
        // Simulate a diff being pushed by a tool handler before this message is processed
        diffs.push({
          type: 'diff',
          path: 'test.ts',
          hunks: [{ start_line: 1, old_text: 'a', new_text: 'b' }],
        });
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'editing...' }] },
          session_id: 'sid',
        };
        yield { type: 'result', subtype: 'success', result: 'done', session_id: 'sid' };
      })(),
    );

    const events = await collect(
      streamAgentTask('task', '', { cwd: '/tmp', toolServer: {} as any }, diffs),
    );

    const diffEvents = events.filter((e) => e.type === 'diff');
    expect(diffEvents).toHaveLength(1);
    expect((diffEvents[0] as AgentDiff).path).toBe('test.ts');

    const done = events.find((e) => e.type === 'done') as any;
    expect(done.files_modified).toBe(1);
  });

  it('yields tool_use events from SDK', async () => {
    mockQuery.mockReturnValue(
      fakeQuery([
        { type: 'tool_use_summary', summary: 'Reading test.ts' },
        { type: 'result', subtype: 'success', result: 'done', session_id: 'sid' },
      ]),
    );

    const events = await collect(
      streamAgentTask('task', '', { cwd: '/tmp', toolServer: {} as any }, []),
    );

    const toolUse = events.find((e) => e.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect((toolUse as any).status).toBe('Reading test.ts');
  });

  it('yields error event on SDK throw', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        throw new Error('SDK crashed');
      })(),
    );

    const events = await collect(
      streamAgentTask('task', '', { cwd: '/tmp', toolServer: {} as any }, []),
    );

    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect((err as any).code).toBe('SDK_ERROR');
  });
});
