import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Three gallery local-fixture regressions preserve SDK-only and legacy publication gates', () => {
  const result = spawnSync('python3', ['scripts/cloud/prepare-three-evaluation-site.test.py'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
