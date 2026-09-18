#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { RegistryClient } from './registry-client.mjs';
import { materializeAssets } from './materialize.mjs';

const [command, ...args] = process.argv.slice(2);
const options = {}, positional = [];
try {
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) positional.push(args[i]);
    else if (args[i] === '--offline') options.offline = true;
    else { const key = args[i].slice(2); if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing --${key} value`); options[key] = args[++i]; }
  }
  const registryUrl = options.registry || process.env.ASSET_REGISTRY_URL;
  const client = registryUrl ? new RegistryClient({ registryUrl, artifactBaseUrl: options['artifact-base'] || process.env.ASSET_ARTIFACT_BASE_URL }) : undefined;
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  let result;
  if (command === 'fetch') {
    result = await materializeAssets(await json(options.lock || positional[0]), { client, cacheRoot: options.cache, outputRoot: options.output, offline: !!options.offline });
  } else {
    if (!client) throw new Error('--registry or ASSET_REGISTRY_URL is required');
    if (command === 'search') result = await client.searchAssets({ query: positional.join(' '), ...(options.limit ? { limit: Number(options.limit) } : {}), ...(options.snapshot ? { snapshot_id: options.snapshot } : {}) });
    else if (command === 'describe') result = await client.describeAsset(positional[0], { version: options.version, snapshotId: options.snapshot });
    else if (command === 'resolve') result = await client.resolveAssembly(await json(options.manifest || positional[0]));
    else throw new Error('Usage: worldkit-assets search|describe|resolve|fetch [input] --registry URL; resolve --manifest request.json; fetch --lock lock.json --cache DIR [--output DIR] [--offline]');
  }
  const serialized = JSON.stringify(result, null, 2) + '\n';
  if (options.out) await writeFile(options.out, serialized); else process.stdout.write(serialized);
} catch (error) {
  process.stderr.write(JSON.stringify({ error: { code: error.code || 'ASSET_CLI_ERROR', message: error.message, retryable: error.retryable || false, details: error.details || {} } }) + '\n');
  process.exitCode = 1;
}
