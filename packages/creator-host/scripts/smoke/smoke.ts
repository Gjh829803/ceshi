import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ThreeCreatorTools } from '../../src/tools/tools.js';
import { executeThreeCreatorTool } from '../../src/cli/mcp.js';
import { profileFrom, type TimedEpisodeStep } from '../../src/contracts.js';

const value = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const profile = profileFrom(value('--profile') ?? 'three-raw'), duration = Number(value('--duration') ?? 4);
const root = path.resolve(value('--workspace') ?? `.codex-tmp/three-creator-smoke/${profile}-${Date.now()}`);
await mkdir(root, { recursive: true }); const service = new ThreeCreatorTools(root, profile);
async function call(name: string, args: Record<string, unknown> = {}) {
  const started: any = await executeThreeCreatorTool(service, name, args); if (!started.operationId) return started;
  let operation; do { operation = await service.getOperation(started.operationId, 10); if (operation.progress) process.stdout.write(`${name}: ${JSON.stringify(operation.progress)}\n`); } while (['queued', 'running'].includes(operation.status));
  if (operation.status !== 'succeeded') throw new Error(`${name}: ${operation.error}`); return operation.result;
}
try {
  const example = await service.examples(); for (const [name, text] of Object.entries(example.files)) await writeFile(path.join(root, name), text);
  const cycle: TimedEpisodeStep[] = [
    { keysDown: ['w'], durationSeconds: 2 }, { keysDown: ['w'], durationSeconds: 0.1 }, { keysDown: ['Shift'], durationSeconds: 1 }, { keysUp: ['w', 'Shift'], durationSeconds: 0.5 },
    { keysDown: ['ArrowRight'], durationSeconds: 2 }, { keysUp: ['ArrowRight'], durationSeconds: 0.2 },
    { keysDown: ['s'], durationSeconds: 2.1 }, { keysDown: ['Shift'], durationSeconds: 1 }, { keysUp: ['s', 'Shift'], durationSeconds: 0.5 },
    { keysDown: ['ArrowLeft'], durationSeconds: 2 }, { keysUp: ['ArrowLeft'], keysDown: ['Space'], durationSeconds: 0.15 }, { keysDown: ['Space'], durationSeconds: 0.1 }, { keysUp: ['Space'], durationSeconds: 0.5 },
  ];
  const steps: TimedEpisodeStep[] = []; let total = 0;
  while (total < duration) for (const step of cycle) { if (total >= duration) break; const seconds = Math.min(step.durationSeconds, duration - total); steps.push({ ...step, durationSeconds: seconds }); total += seconds; }
  steps.push({ keysUp: ['w', 's', 'ArrowRight', 'ArrowLeft', 'Shift', 'Space'], durationSeconds: 0 });
  await writeFile(path.join(root, 'episode.json'), JSON.stringify({ schemaVersion: 1, steps, targets: [{ id: 'spawn-return', positionMetersXYZ: [0, 0, 0], toleranceMeters: 1 }] }, null, 2));
  const validated = await call('world_validate'), preview = await call('world_preview'), inspected = await call('world_inspect');
  const played = await call('world_playtest'); const captured = await call('world_capture_triviews'); const submitted = await call('world_submit');
  const report = { profile, root, validated, preview, initialPlayer: inspected.observation.controlledObject, playtest: { status: played.status, actualWallSeconds: played.actualWallSeconds, travelledMeters: played.travelledMeters, capturedInput: played.capturedInput, isCompleteEpisode: played.isCompleteEpisode, failure: played.failure, pageErrors: played.pageErrors, runtimeErrors: played.runtimeErrors, videoPath: played.videoPath, frameTiming: played.frameTiming, lastPlayer: played.lastObservation?.controlledObject, keyboardEventCount: played.browserKeyboardEvents.length, repeatedKeydownCount: played.browserKeyboardEvents.filter((event: any) => event.repeat).length }, captures: captured.images, submitted };
  await writeFile(path.join(root, 'smoke-report.json'), JSON.stringify(report, null, 2)); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (played.status !== 'passed') process.exitCode = 1;
} finally { await service.close(); }
