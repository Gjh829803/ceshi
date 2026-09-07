import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Vertex extraction and Three adapter preserve offline material and event contracts', () => {
  const result = spawnSync('python3', ['-B', 'scripts/lib/vertex-event-director.test.py'], {encoding: 'utf8'});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
