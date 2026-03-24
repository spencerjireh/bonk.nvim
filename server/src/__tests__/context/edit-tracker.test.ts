import { describe, expect, it } from 'vitest';
import { EditTracker } from '../../context/edit-tracker.js';

describe('EditTracker', () => {
  it('stores and retrieves edits', () => {
    const tracker = new EditTracker();
    tracker.addEdit('test.ts', '- old\n+ new');

    const edits = tracker.getRecentEdits(10);
    expect(edits).toHaveLength(1);
    expect(edits[0].path).toBe('test.ts');
    expect(edits[0].diff).toBe('- old\n+ new');
  });

  it('returns last n edits', () => {
    const tracker = new EditTracker();
    tracker.addEdit('a.ts', 'diff-a');
    tracker.addEdit('b.ts', 'diff-b');
    tracker.addEdit('c.ts', 'diff-c');

    const edits = tracker.getRecentEdits(2);
    expect(edits).toHaveLength(2);
    expect(edits[0].path).toBe('b.ts');
    expect(edits[1].path).toBe('c.ts');
  });

  it('trims oldest entries when exceeding max', () => {
    const tracker = new EditTracker(3);
    tracker.addEdit('a.ts', 'd1');
    tracker.addEdit('b.ts', 'd2');
    tracker.addEdit('c.ts', 'd3');
    tracker.addEdit('d.ts', 'd4');

    const edits = tracker.getRecentEdits(10);
    expect(edits).toHaveLength(3);
    expect(edits[0].path).toBe('b.ts');
  });
});
