import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const PREFIX = 'three-episode-capture-test-';
/** Test-only ownership. The returned work promise still rejects normally; cleanup
 * observes its settlement even after the test runner has stopped waiting for it.
 * Work must await its child operations before resolving. */
export class TestTaskFiles {
  private readonly parent = path.resolve(tmpdir());
  private readonly roots = new Set<string>();
  private settled: Promise<void> | undefined;
  private retained = false;

  run<T>(work: () => T | Promise<T>): Promise<T> {
    if (this.settled || this.retained) throw new Error('TEST_TASK_FILES_ALREADY_USED');
    const result = Promise.resolve().then(work);
    this.settled = result.then(() => {}, () => {});
    return result;
  }

  async createRoot(): Promise<string> {
    if (this.retained) throw new Error('TEST_TASK_FILES_RETAINED');
    const root = await mkdtemp(path.join(this.parent, PREFIX));
    this.roots.add(root);
    // A pending mkdtemp can finish after the cleanup deadline. Retain and report
    // that path too, rather than deleting a directory the task may still use.
    if (this.retained) console.error(`TEST_TASK_LATE_DIRECTORY_RETAINED: ${root}`);
    return root;
  }

  async cleanup(settleTimeoutMs = 3000): Promise<void> {
    if (this.retained) throw new Error(`TEST_TASK_FILES_RETAINED: ${[...this.roots].join('; ')}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.settled,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.retained = true;
            reject(new Error(`TEST_TASK_DID_NOT_SETTLE: preserved ${[...this.roots].join('; ')}; parent ${this.parent}`));
          }, settleTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    for (const root of this.roots) {
      const absolute = path.resolve(root);
      if (path.dirname(absolute) !== this.parent || !path.basename(absolute).startsWith(PREFIX)) {
        throw new Error(`TEST_DIRECTORY_OUTSIDE_TEMP_ROOT: ${root}`);
      }
      // Only forget successful removals. A filesystem failure keeps its path
      // registered and propagates, instead of silently losing the evidence.
      await rm(absolute, {recursive: true, force: true});
      this.roots.delete(root);
    }
  }
}