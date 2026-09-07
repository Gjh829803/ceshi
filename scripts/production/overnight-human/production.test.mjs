import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

for (const name of ['controller', 'publisher']) {
  test(`existing ${name} production contracts remain in the offline test gate`, () => {
    const file = fileURLToPath(new URL(`./${name}.test.py`, import.meta.url));
    const result = spawnSync('python3', ['-B', file], { encoding: 'utf8', timeout: 30_000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
