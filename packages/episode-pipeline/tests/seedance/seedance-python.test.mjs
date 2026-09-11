import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The independent test lane is also used by CI, whose media setup provides
// Python and FFmpeg. These suites use mocked cloud transports and synthetic media.
for (const filename of ['seedance-dispatch.test.py', 'seedance-delivery.test.py']) {
  test(filename, {timeout: 60000}, async () => {
    const child = spawn('python3', [fileURLToPath(new URL(filename, import.meta.url))], {
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 55000,
    });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data.toString(); });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 0, output);
  });
}
