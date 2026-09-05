#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile, copyFile, rename, rm } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const value = (argv, flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
const contained = (root, target) => { const rel = path.relative(root, target); return !!rel && !rel.startsWith('../') && !path.isAbsolute(rel); };
const browserKeys = new Set(['PLAYWRIGHT_BROWSERS_PATH', 'WORLDKIT_CHROMIUM_EXECUTABLE', 'LD_LIBRARY_PATH', 'FONTCONFIG_PATH', 'FONTCONFIG_FILE', 'LANG']);
const toolNames = ['episode_observe', 'episode_probe', 'episode_submit_plan'];
async function json(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function regular(file) { const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) throw new Error('EPISODE_CLOUD_UNSAFE_FILE'); return file; }

export function modelEnvironment(runtime, workspace, inherited = process.env, { authentication = false } = {}) {
  const env = { PATH: [path.dirname(runtime.nodeBinary), path.dirname(runtime.codexBinary), '/usr/local/bin', '/usr/bin', '/bin'].join(':'), HOME: path.join(workspace, '.episode-session/home'), TMPDIR: path.join(workspace, '.episode-session/tmp'), LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NO_COLOR: '1', TERM: 'dumb', TSX_DISABLE_CACHE: '1' };
  for (const [key, entry] of Object.entries(runtime.browserEnvironment ?? {})) { if (!browserKeys.has(key)) throw new Error('EPISODE_RUNTIME_ENVIRONMENT_NOT_ALLOWED'); env[key] = entry; }
  if (authentication) { if (!inherited.CODEX_HOME) throw new Error('EPISODE_PLATFORM_AUTH_HOME_MISSING'); env.CODEX_HOME = inherited.CODEX_HOME; }
  return env;
}

export async function parseEpisodeCloudLayout(argv) {
  if (argv[0] !== 'exec' || typeof argv.at(-1) !== 'string') throw new Error('EPISODE_PROVIDER_ARGUMENT_INVALID');
  const allowedFlags = new Set(['--skip-git-repo-check', '--ephemeral']);
  const valuedFlags = new Set(['--sandbox', '--model', '-c', '--config', '-C', '--add-dir', '--image', '--output-last-message']);
  for (let i = 1; i < argv.length - 1; i++) {
    if (allowedFlags.has(argv[i])) continue;
    if (!valuedFlags.has(argv[i]) || ++i >= argv.length - 1) throw new Error('EPISODE_PROVIDER_ARGUMENT_INVALID');
  }
  const workspace = await realpath(value(argv, '-C'));
  const outputs = await realpath(path.dirname(value(argv, '--output-last-message')));
  if (outputs !== path.join(workspace, 'outputs')) throw new Error('EPISODE_OUTPUT_ROOT_INVALID');
  if (value(argv, '--model') !== 'gpt-6-astra' || value(argv, '--sandbox') !== 'workspace-write') throw new Error('EPISODE_MODEL_OR_SANDBOX_MISMATCH');
  const configurations = argv.flatMap((v, i) => ['-c', '--config'].includes(v) ? [argv[i + 1]] : []);
  if (configurations.filter(v => v === 'model_reasoning_effort="xhigh"').length !== 1 || configurations.some(v => v !== 'model_reasoning_effort="xhigh"' && v !== 'notify=[]')) throw new Error('EPISODE_XHIGH_REQUIRED');
  for (const dir of argv.flatMap((v, i) => v === '--add-dir' ? [argv[i + 1]] : [])) {
    const resolved = await realpath(dir); if (resolved !== outputs && resolved !== path.join(workspace, 'inputs')) throw new Error('EPISODE_ADD_DIR_INVALID');
  }
  for (const image of argv.flatMap((v, i) => v === '--image' ? [argv[i + 1]] : [])) {
    const resolved = await realpath(image); if (!contained(path.join(workspace, 'inputs'), resolved)) throw new Error('EPISODE_IMAGE_OUTSIDE_INPUTS'); await regular(resolved);
  }
  const candidates = (await readdir(path.join(workspace, 'inputs'))).filter(name => name.includes('episode-launch-input') && name.endsWith('.json'));
  if (candidates.length !== 1) throw new Error('EPISODE_LAUNCH_INPUT_MISSING');
  const input = await json(await regular(path.join(workspace, 'inputs', candidates[0])));
  if (input.kind !== 'three-episode-launch-input' || input.schemaVersion !== 1 || input.taskId !== path.basename(workspace)) throw new Error('EPISODE_LAUNCH_INPUT_IDENTITY_INVALID');
  return { workspace, outputs, input };
}

export async function launch(argv, runtimePath = path.join(here, 'episode-runtime.json')) {
  const runtime = await json(await regular(runtimePath));
  const layout = await parseEpisodeCloudLayout(argv);
  const { workspace, outputs, input } = layout;
  // The provider advertises transport outputs in its task prompt. Keep their
  // authoritative writers outside the model's writable workspace until exit.
  const diagnosticsRoot = await mkdtemp(path.join(path.dirname(workspace), '.episode-host-diagnostics-'));
  const diagnosticNames = ['episode-events.jsonl', 'episode-stderr.log', 'episode-launcher-report.json'];
  const reportFile = path.join(diagnosticsRoot, 'episode-launcher-report.json');
  const report = { kind: 'three-episode-launcher-report', schemaVersion: 1, taskId: input.taskId, model: 'gpt-6-astra', reasoningEffort: 'xhigh', runtimeHash: hash(await readFile(runtimePath)), startedAt: new Date().toISOString(), status: 'starting', mcpTools: input.episodeSourceManifest ? toolNames : [], nativeImageGenerationEnabled: true, mcpAuthenticationEnvironmentPassed: false };
  try {
    const binaryHash = hash(await readFile(await regular(runtime.codexBinary)));
    if (binaryHash !== runtime.codexBinarySha256) throw new Error('EPISODE_CODEX_BINARY_HASH_MISMATCH');
    report.codexBinarySha256 = binaryHash;
    const overrides = ['approval_policy="never"', 'features.apps=false', 'features.hooks=false', 'features.plugins=false', 'features.remote_plugin=false', 'features.skill_mcp_dependency_install=false', 'skills.bundled.enabled=false', 'skills.include_instructions=false', 'features.image_generation=true', 'tools.view_image=true', 'allow_login_shell=false', 'features.shell_snapshot=false', 'shell_environment_policy.inherit="core"'];
    if (input.episodeSourceManifest) {
      const source = await regular(path.resolve(input.episodeSourceManifest));
      if (!contained(await realpath(runtime.allowedSourceRoot), source)) throw new Error('EPISODE_SOURCE_OUTSIDE_FROZEN_ROOT');
      report.sourceManifestSha256 = hash(await readFile(source));
      if (report.sourceManifestSha256 !== input.episodeSourceManifestSha256) throw new Error('EPISODE_SOURCE_MANIFEST_HASH_MISMATCH');
      const mcpArgs = [fileURLToPath(import.meta.url), '--mcp', '--runtime', runtimePath, '--workspace', workspace, '--source-manifest', source];
      if (input.episodeRepairInput) {
        let repair;
        if (input.episodeRepairInput === 'task-asset:repair-input') {
          const files = (await readdir(path.join(workspace, 'inputs'))).filter(name => name.includes('repair-input') && name.endsWith('.json'));
          if (files.length !== 1) throw new Error('EPISODE_REPAIR_ASSET_MISSING');
          const inputFile = await regular(path.join(workspace, 'inputs', files[0]));
          if (hash(await readFile(inputFile)) !== input.episodeRepairInputSha256) throw new Error('EPISODE_REPAIR_HASH_MISMATCH');
          repair = path.join(outputs, 'episode-repair-input.json'); await copyFile(inputFile, repair);
        } else {
          repair = await regular(path.resolve(input.episodeRepairInput));
          if (!contained(await realpath(runtime.allowedSourceRoot), repair)) throw new Error('EPISODE_REPAIR_OUTSIDE_FROZEN_ROOT');
        }
        if (hash(await readFile(repair)) !== input.episodeRepairInputSha256) throw new Error('EPISODE_REPAIR_HASH_MISMATCH');
        mcpArgs.push('--repair-input', repair);
      }
      const policies = toolNames.map(name => `${name}={approval_mode="approve"}`).join(',');
      overrides.push(`mcp_servers={three_episode={command=${JSON.stringify(runtime.nodeBinary)},args=${JSON.stringify(mcpArgs)},cwd=${JSON.stringify(workspace)},enabled=true,required=true,env_vars=[],enabled_tools=${JSON.stringify(toolNames)},default_tools_approval_mode="prompt",tools={${policies}},startup_timeout_sec=120,tool_timeout_sec=180}}`);
    } else overrides.push('mcp_servers={}');
    const env = modelEnvironment(runtime, workspace, process.env, { authentication: true });
    await mkdir(env.HOME, { recursive: true }); await mkdir(env.TMPDIR, { recursive: true });
    let prompt = argv.at(-1);
    if (prompt === '-') { const chunks = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); prompt = Buffer.concat(chunks).toString('utf8'); }
    prompt += `\n\nHost-owned transport output boundary: ${diagnosticNames.join(', ')} are produced by the launcher AFTER you exit. Do not create, rewrite, truncate or delete them, even if the provider lists them among expected outputs. Write only the requested task result/plan files; these transport diagnostics are not Agent deliverables.`;
    const effective = [...argv.slice(0, -1), '--ignore-user-config', '--ignore-rules', '--json', ...overrides.flatMap(v => ['-c', v]), prompt];
    const eventsFile = path.join(diagnosticsRoot, 'episode-events.jsonl'); const stderrFile = path.join(diagnosticsRoot, 'episode-stderr.log');
    const eventStream = createWriteStream(eventsFile, { flags: 'wx' }); const errors = createWriteStream(stderrFile, { flags: 'wx' });
    errors.write('Three Episode launcher: Codex process starting.\n');
    const child = spawn(runtime.codexBinary, effective, { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const stop = signal => { try { process.kill(-child.pid, signal); } catch {} };
    const transportHash = createHash('sha256'); child.stdout.on('data', chunk => transportHash.update(chunk)); child.stdout.pipe(eventStream); child.stderr.pipe(errors);
    report.status = 'running'; await writeFile(reportFile, JSON.stringify(report, null, 2));
    let timedOut = false; let forceTimer;
    const timeout = setTimeout(() => { timedOut = true; stop('SIGTERM'); forceTimer = setTimeout(() => stop('SIGKILL'), 15000); }, (runtime.maximumTaskSeconds ?? 2700) * 1000);
    const onSignal = () => stop('SIGTERM'); process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
    let exit;
    try { exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); await Promise.all([finished(eventStream), finished(errors)]); }
    finally { clearTimeout(timeout); clearTimeout(forceTimer); process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal); stop('SIGKILL'); }
    Object.assign(report, { childExitCode: exit.code, timedOut, eventsSha256: hash(await readFile(eventsFile)), eventsTransportSha256: transportHash.digest('hex') });
    if (report.eventsSha256 !== report.eventsTransportSha256) throw new Error('EPISODE_EVENTS_CHANGED');
    if (timedOut || exit.code !== 0) throw new Error(timedOut ? 'EPISODE_TASK_TIMEOUT' : 'EPISODE_CODEX_FAILED');
    if (input.episodeSourceManifest) {
      await regular(path.join(outputs, 'plan.json')); await regular(path.join(outputs, 'planner-tool-evidence.json'));
    }
    report.status = 'delivered'; return report;
  } catch (error) { report.status = 'failed'; report.error = String(error.message); throw error; }
  finally {
    report.finishedAt = new Date().toISOString();
    if (await realpath(outputs) !== outputs) throw new Error('EPISODE_OUTPUT_ROOT_CHANGED');
    report.diagnosticsOwnership = 'host-private-until-process-exit';
    report.discardedModelDiagnosticPaths = [];
    for (const name of diagnosticNames) { try { await lstat(path.join(outputs, name)); report.discardedModelDiagnosticPaths.push(name); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    await writeFile(reportFile, JSON.stringify(report, null, 2));
    for (const name of diagnosticNames) { try { await rename(path.join(diagnosticsRoot, name), path.join(outputs, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    await rm(diagnosticsRoot, { recursive: true, force: true });
  }
}

async function bridge(argv) {
  const runtime = await json(await regular(value(argv, '--runtime'))); const workspace = await realpath(value(argv, '--workspace'));
  const args = ['--import', path.join(runtime.toolkitRoot, 'node_modules/tsx/dist/loader.mjs'), path.join(runtime.toolkitRoot, 'scripts/three-episode/mcp.ts'), '--source-manifest', value(argv, '--source-manifest'), '--source-root', runtime.allowedSourceRoot, '--output-root', path.join(workspace, 'outputs')];
  if (value(argv, '--repair-input')) args.push('--repair-input', value(argv, '--repair-input'));
  const child = spawn(runtime.nodeBinary, args, { cwd: runtime.toolkitRoot, env: modelEnvironment(runtime, workspace), stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code ?? 1)); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv[2] === '--mcp') await bridge(process.argv.slice(2)); else await launch(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
