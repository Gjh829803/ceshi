import {afterEach, expect, it} from 'vitest';
import {existsSync} from 'node:fs';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {TestTaskFiles} from '../fixtures/test-task-files';

const ownedRoots: string[] = [];
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return {promise, release};
}
async function root(files: TestTaskFiles) {
  const value = await files.createRoot();
  ownedRoots.push(value);
  return value;
}
afterEach(async () => {
  // All test work has settled in each case's finally before removing retained
  // evidence here. Restrict this cleanup to roots created by these regressions.
  for (const value of ownedRoots.splice(0)) {
    const absolute = path.resolve(value);
    if (path.dirname(absolute) !== path.resolve(tmpdir()) || !path.basename(absolute).startsWith('three-episode-capture-test-')) throw Error('UNSAFE_REGRESSION_CLEANUP');
    await rm(absolute, {recursive: true, force: true});
  }
});

it.each(['success', 'failure'])('cleans settled %s work without swallowing its result', async outcome => {
  const files = new TestTaskFiles();
  let directory = '';
  const error = new Error('EXPECTED_WORK_FAILURE');
  const work = files.run(async () => {
    directory = await root(files);
    await writeFile(path.join(directory, 'episode.json'), 'saved');
    if (outcome === 'failure') throw error;
    return 42;
  });
  if (outcome === 'failure') await expect(work).rejects.toBe(error);
  else await expect(work).resolves.toBe(42);
  await files.cleanup();
  expect(existsSync(directory)).toBe(false);
  await files.cleanup();
});

it('waits for a delayed final write before deleting the directory', async () => {
  const files = new TestTaskFiles(), ready = gate(), finish = gate();
  let directory = '';
  const work = files.run(async () => {
    directory = await root(files);
    await writeFile(path.join(directory, 'episode.json'), 'before');
    ready.release();
    await finish.promise;
    await writeFile(path.join(directory, 'episode.json'), 'after');
  });
  let cleaning: Promise<void> | undefined;
  try {
    await ready.promise;
    let cleaned = false;
    cleaning = files.cleanup().then(() => { cleaned = true; });
    expect(await readFile(path.join(directory, 'episode.json'), 'utf8')).toBe('before');
    expect(cleaned).toBe(false);
    finish.release();
    await work;
    await cleaning;
    expect(existsSync(directory)).toBe(false);
  } finally { finish.release(); await work; await cleaning; }
});

it('retains unresponsive work after the deadline and isolates the next test directories', async () => {
  const files = new TestTaskFiles(), ready = gate(), finish = gate();
  let directory = '';
  const work = files.run(async () => {
    directory = await root(files);
    await writeFile(path.join(directory, 'episode.json'), 'before');
    ready.release();
    await finish.promise;
    await writeFile(path.join(directory, 'episode.json'), 'late evidence');
  });
  try {
    await ready.promise;
    // Shorten only this helper's isolated test deadline. The real capture tests
    // retain their original 5000 ms test timeout and 3000 ms cleanup deadline.
    const failure = files.cleanup(25);
    await expect(failure).rejects.toThrow('TEST_TASK_DID_NOT_SETTLE');
    await expect(failure).rejects.toThrow(directory);
    expect(await readFile(path.join(directory, 'episode.json'), 'utf8')).toBe('before');
    const next = new TestTaskFiles();
    const nextRoot = await next.run(() => root(next));
    await next.cleanup();
    expect(existsSync(nextRoot)).toBe(false);
    expect(existsSync(directory)).toBe(true);
    finish.release();
    await work;
    expect(await readFile(path.join(directory, 'episode.json'), 'utf8')).toBe('late evidence');
    await expect(files.cleanup()).rejects.toThrow('TEST_TASK_FILES_RETAINED');
    expect(existsSync(directory)).toBe(true);
  } finally { finish.release(); await work; }
});