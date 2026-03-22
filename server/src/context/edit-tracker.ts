export interface EditEntry {
  path: string;
  timestamp: number;
  diff: string;
}

export class EditTracker {
  private edits: EditEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries;
  }

  addEdit(path: string, diff: string): void {
    this.edits.push({
      path,
      timestamp: Date.now(),
      diff,
    });

    if (this.edits.length > this.maxEntries) {
      this.edits = this.edits.slice(-this.maxEntries);
    }
  }

  getRecentEdits(n = 10): EditEntry[] {
    return this.edits.slice(-n);
  }

  clear(): void {
    this.edits = [];
  }
}
