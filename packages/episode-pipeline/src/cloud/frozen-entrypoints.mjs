// Queued jobs retain their immutable image/archive identities across a package move.
// Resolve only the known entrypoint inside those bytes; never replace their image,
// source archive or request identity to make a new repository path available.
const entrypoints = {
  batch: ['packages/episode-pipeline/src/cli/batch-cli.mjs', 'packages/episode-pipeline/batch-cli.mjs', 'scripts/three-episode/batch-cli.mjs'],
  workflow: ['packages/episode-pipeline/src/workflow/workflow.ts', 'packages/episode-pipeline/workflow.ts', 'scripts/three-episode/workflow.ts'],
  host: ['packages/episode-pipeline/src/cloud/cloud-host.mjs', 'packages/episode-pipeline/cloud-host.mjs', 'scripts/cloud/three-episode-host.mjs'],
};

export function episodeEntrypointCandidates(entry) {
  if (!Object.hasOwn(entrypoints, entry)) throw Error('EPISODE_ENTRYPOINT_ARGUMENTS_INVALID');
  return [...entrypoints[entry]];
}

/** Node arguments that work in either frozen layout, without spawning another owner. */
export function episodeNodeArguments(entry, args = []) {
  const candidates = episodeEntrypointCandidates(entry);
  if (!candidates || !Array.isArray(args) || args.some(value => typeof value !== 'string')) throw Error('EPISODE_ENTRYPOINT_ARGUMENTS_INVALID');
  const bootstrap = `import {existsSync} from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const entry=${JSON.stringify(candidates)}.find(file=>existsSync(file));
if(!entry)throw Error('EPISODE_FROZEN_ENTRYPOINT_MISSING: ${entry}');
process.argv=[process.argv[0],path.resolve(entry),...process.argv.slice(1)];
await import(pathToFileURL(process.argv[1]).href);`;
  return [...(entry === 'workflow' ? ['--import', './node_modules/tsx/dist/loader.mjs'] : []), '--input-type=module', '-e', bootstrap, '--', ...args];
}
