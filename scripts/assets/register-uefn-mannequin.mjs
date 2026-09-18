/** Regenerate maintained humanoid descriptors from canonical library metadata. New bytes use tools/ingest.mjs. */
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
execFileSync(process.execPath,['--import','tsx',path.join(root,'packages/creator-host/src/cli/content-cli.ts'),...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
