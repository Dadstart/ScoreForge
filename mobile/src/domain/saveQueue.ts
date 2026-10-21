type Revisioned = { revision: number };

/**
 * One save at a time. A move that arrives while a write is in flight stays
 * queued and is stored with the revision that write just saved.
 */
export class SaveQueue<T extends Revisioned> {
  private pending: T | null = null;
  private inflight = false;
  private savedRevision: number | null = null;

  get saving(): boolean {
    return this.inflight;
  }

  get hasPending(): boolean {
    return this.pending != null;
  }

  enqueue(value: T): void {
    this.pending = value;
  }

  /** The next document to write, or null when a write is running or nothing is waiting. */
  take(): T | null {
    if (this.inflight || !this.pending) return null;
    this.inflight = true;
    const next = this.pending;
    this.pending = null;
    if (this.savedRevision == null) return next;
    return { ...next, revision: this.savedRevision };
  }

  committed(savedRevision: number): void {
    this.savedRevision = savedRevision;
    this.inflight = false;
  }

  failed(): void {
    this.inflight = false;
    this.pending = null;
  }
}
