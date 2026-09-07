import assert from 'node:assert/strict';
import test from 'node:test';
import { stableJson, sha256Canonical } from './canonical-json.mjs';

// Captured from the prior playthrough hash implementation before its removal.
test('canonical hashes preserve delivered identities and recursive key ordering', () => {
  const first = {z: [3, {b: true, a: null}], a: '中文'};
  const reordered = {a: '中文', z: [3, {a: null, b: true}]};
  assert.equal(stableJson(first), '{"a":"中文","z":[3,{"a":null,"b":true}]}');
  assert.equal(sha256Canonical(first), 'sha256:51cf8d4e5dd276d06e54b221f63d24d24a4d0a6675c77d3fd0dbfbab5e69cc81');
  assert.equal(sha256Canonical(reordered), sha256Canonical(first));
  assert.equal(sha256Canonical(['b', 'a']), 'sha256:02d8bc3008a9bb0dcc4b86d7fd3428ced792355c733c19756bec5a56dc61b2c5');
  assert.notEqual(sha256Canonical(['a', 'b']), sha256Canonical(['b', 'a']));
  assert.equal(sha256Canonical(null), 'sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b');
});

test('extraction preserves existing non-JSON edge semantics', () => {
  const value = {a: undefined, b: NaN, c: [undefined, Infinity]};
  assert.equal(stableJson(value), '{"a":undefined,"b":null,"c":[,null]}');
  assert.equal(sha256Canonical(value), 'sha256:e31488bcc016138556b238137707e1823f1c7f389b2cc911cb9321f59fbdb081');
});
