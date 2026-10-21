import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SaveQueue } from './saveQueue';

describe('save queue', () => {
  it('keeps a second move and writes it from the revision the first save stored', () => {
    const queue = new SaveQueue<{ revision: number; board: string }>();
    queue.enqueue({ revision: 4, board: 'first' });
    const first = queue.take();
    assert.deepEqual(first, { revision: 4, board: 'first' });
    assert.equal(queue.take(), null);

    queue.enqueue({ revision: 4, board: 'second' });
    queue.committed(5);
    assert.deepEqual(queue.take(), { revision: 5, board: 'second' });
  });

  it('drops the queued move when the write fails', () => {
    const queue = new SaveQueue<{ revision: number }>();
    queue.enqueue({ revision: 1 });
    queue.take();
    queue.enqueue({ revision: 1 });
    queue.failed();
    assert.equal(queue.hasPending, false);
    assert.equal(queue.take(), null);
  });
});
