import { describe, expect, it, vi } from 'vitest';
import { CreatorOperationQueue, type Operation } from '../../src/tools/operation-queue.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}

function fixture() {
  const journals: Operation[] = [];
  const persist = vi.fn(async (operation: Operation) => { journals.push(structuredClone(operation)); });
  const cancelActive = vi.fn(async () => {});
  return {queue: new CreatorOperationQueue({persist, cancelActive}), journals, persist, cancelActive};
}

describe('Creator operation queue', () => {
  it('journals a queued cancellation without running it or interrupting the active operation', async () => {
    const {queue, journals, cancelActive} = fixture();
    const release = deferred<string>(), entered = deferred<void>();
    const first = queue.start('active', () => { entered.resolve(); return release.promise; });
    const run = vi.fn(async () => 'must not run');
    const second = queue.start('queued', run);
    await entered.promise;
    await queue.cancel(second.operationId);
    expect(cancelActive).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    release.resolve('done');
    await expect.poll(() => journals.length).toBe(2);
    expect(journals.map(({id, status}) => ({id, status}))).toEqual([
      {id: first.operationId, status: 'succeeded'},
      {id: second.operationId, status: 'cancelled'},
    ]);
    expect(run).not.toHaveBeenCalled();
    expect(await queue.get(second.operationId)).toEqual(journals[1]);
  });

  it('cancels active work through its resource owner and lets subsequent work run', async () => {
    const {queue, journals, cancelActive} = fixture();
    const release = deferred<void>(), entered = deferred<void>();
    cancelActive.mockImplementation(async () => { release.resolve(); });
    const first = queue.start('active', async id => {
      entered.resolve();
      await release.promise;
      queue.assertActive(id);
    });
    const second = queue.start('next', async () => 'done');
    await entered.promise;
    await queue.cancel(first.operationId);
    await expect.poll(() => journals.length).toBe(2);
    expect(cancelActive).toHaveBeenCalledTimes(1);
    expect(journals[0]).toMatchObject({status: 'cancelled', error: 'THREE_OPERATION_CANCELLED'});
    expect(await queue.get(second.operationId)).toMatchObject({status: 'succeeded', result: 'done'});
    await queue.cancel(first.operationId);
    expect(cancelActive).toHaveBeenCalledTimes(1);
  });

  it('retains the original diagnostic and continues after both execution and journal failures', async () => {
    const {queue, persist, journals} = fixture();
    persist.mockRejectedValueOnce(new Error('disk unavailable'));
    const first = queue.start('failure', async () => { throw new Error('THREE_TEST_FAILED: original'); });
    const second = queue.start('next', async () => 42);
    await expect.poll(() => journals.length).toBe(1);
    expect(await queue.get(first.operationId)).toMatchObject({
      status: 'failed', error: 'THREE_TEST_FAILED: original',
      errorDetails: {code: 'THREE_TEST_FAILED', message: 'THREE_TEST_FAILED: original'},
    });
    expect(await queue.get(second.operationId)).toMatchObject({status: 'succeeded', result: 42});
  });

  it('cancels all pending work without cancelling completed records or running queued callbacks', async () => {
    const {queue, journals} = fixture();
    const done = queue.start('done', async () => 1);
    await expect.poll(() => journals.length).toBe(1);
    const release = deferred<void>(), entered = deferred<void>();
    const active = queue.start('active', async id => {
      entered.resolve();
      await release.promise;
      queue.assertActive(id);
    });
    const run = vi.fn(async () => 2);
    const queued = queue.start('queued', run);
    await entered.promise;
    queue.cancelAll();
    release.resolve();
    await expect.poll(() => journals.length).toBe(3);
    expect((await queue.get(done.operationId)).status).toBe('succeeded');
    expect((await queue.get(active.operationId)).status).toBe('cancelled');
    expect((await queue.get(queued.operationId)).status).toBe('cancelled');
    expect(run).not.toHaveBeenCalled();
  });

  it('returns detached snapshots and progress without granting authority to another session', async () => {
    const {queue, journals} = fixture();
    const started = queue.start('result', async id => {
      queue.updateProgress(id, {step: 2});
      return {value: 42};
    });
    await expect.poll(() => journals.length).toBe(1);
    const snapshot = await queue.get(started.operationId);
    snapshot.result.value = 0;
    snapshot.status = 'failed';
    expect(await queue.get(started.operationId)).toMatchObject({status: 'succeeded', result: {value: 42}, progress: {step: 2}});
    await expect(fixture().queue.get(started.operationId)).rejects.toThrow('THREE_OPERATION_UNKNOWN');
    await expect(queue.cancel('unknown')).rejects.toThrow('THREE_OPERATION_UNKNOWN');
    for (const waitSeconds of [NaN, Infinity, -1, 26]) {
      await expect(queue.get(started.operationId, waitSeconds)).rejects.toThrow('THREE_WAIT_INVALID');
    }
  });
});
