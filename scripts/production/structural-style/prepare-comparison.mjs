// Local input preparation only. No account selection, upload or generation API.
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creativePromptFromSource } from '../../cloud/three-eval-policy.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--manifest', '--case-ids', '--output-root'].includes(key) || !process.argv[i + 1] || args[key]) throw Error('Expected --manifest, --case-ids and --output-root');
  args[key] = process.argv[i + 1];
}
if (Object.keys(args).length !== 3) throw Error('Provide all three preparation arguments');
const output = path.resolve(args['--output-root']);
if (!output.startsWith(path.join(repo, '.codex-tmp') + path.sep)) throw Error('Use a new local .codex-tmp output directory');
const sourceFile = await realpath(args['--manifest']);
if (!sourceFile.startsWith(repo + path.sep)) throw Error('Source manifest must belong to this checkout');
const sourceBytes = await readFile(sourceFile), source = JSON.parse(sourceBytes);
const ids = args['--case-ids'].split(',');
if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw Error('Choose one to100 distinct source cases');
const instructions = await readFile(path.join(repo, 'scripts/cloud/three-eval-instructions.md'));
if (source.genericInstructionsSha256 && source.genericInstructionsSha256 !== sha(instructions)) throw Error('Source baseline instructions changed');
const styleFile = path.join(repo, 'scripts/production/structural-style/style-brief.md');
const style = (await readFile(styleFile, 'utf8')).trim();
const checked = [];
for (const id of ids) {
  const c = source.cases.find(c => c.id === id);
  if (!c || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) throw Error('Invalid selected case: ' + id);
  if (c.codexAccountIds) throw Error('Select from an unassigned source manifest; refresh accounts only when generation resumes');
  const imagePath = await realpath(c.referenceImage.path), promptPath = await realpath(c.effectiveUserPromptFile.path);
  if (![imagePath, promptPath].every(p => p.startsWith(repo + path.sep))) throw Error('Source input escaped this checkout');
  const image = await readFile(imagePath), prompt = await readFile(promptPath);
  if (sha(image) !== c.referenceImage.contentSha256 || sha(prompt) !== c.effectiveUserPromptFile.contentSha256 || prompt.toString().trimEnd() !== c.effectiveUserPrompt.trimEnd()) throw Error('Frozen source input mismatch: ' + id);
  const control = creativePromptFromSource(prompt.toString().trimEnd());
  if (control.includes(style)) throw Error('This source already contains the treatment; select another control input');
  checked.push({ c, image, original: prompt, control, matte: control + '\n\n' + style });
}
// Validate every original input before creating any derived output. Never replace
// an existing preparation or the immutable source campaign.
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const manifests = Object.fromEntries(['a', 'b'].map(variant => [variant, {
  schemaVersion: 1, kind: 'three-creator-source-cases', id: 'structural-style-' + variant,
  genericInstructionsSha256: sha(instructions), selectionMode: 'paired-reference-style-comparison', cases: [],
}]));
const pairs = [];
for (const { c, image, original, control, matte } of checked) {
  const directory = path.join(output, 'inputs', c.id); await mkdir(directory, { recursive: true });
  const referencePath = path.join(directory, 'reference.png');
  await writeFile(referencePath, image, { flag: 'wx' });
  await writeFile(path.join(directory, 'original-effective-prompt.txt'), original, { flag: 'wx' });
  const pair = { sourceCaseId: c.id, sourceTestSetId: c.sourceTestSetId, referenceImageSha256: sha(image), originalEffectivePromptSha256: sha(original), variants: {} };
  for (const [variant, prompt] of [['a', control], ['b', matte]]) {
    const promptFile = path.join(directory, variant + '-prompt.txt'); await writeFile(promptFile, prompt, { flag: 'wx' });
    // Distinct neutral task identities permit simultaneous A/B execution later.
    const id = 'style-' + variant + '-' + c.id;
    manifests[variant].cases.push({ ...c, id, title: c.title,
      sourceUserPrompt: c.sourceUserPrompt ?? c.effectiveUserPrompt,
      referenceImage: { ...c.referenceImage, path: referencePath },
      effectiveUserPrompt: prompt, effectiveUserPromptFile: { path: promptFile, contentSha256: sha(prompt), sizeBytes: Buffer.byteLength(prompt) },
      styleComparison: { pairId: c.id, variant, originalEffectivePromptSha256: sha(original), styleBriefSha256: variant === 'b' ? sha(style) : null },
    });
    pair.variants[variant] = { caseId: id, effectivePromptSha256: sha(prompt) };
  }
  pairs.push(pair);
}
for (const [variant, manifest] of Object.entries(manifests)) await writeJson(path.join(output, variant + '-manifest.json'), manifest);
await writeJson(path.join(output, 'comparison.json'), {
  kind: 'local-structural-style-comparison', schemaVersion: 1, createdAt: new Date().toISOString(),
  status: 'inputs-prepared-generation-paused', sourceManifest: sourceFile, sourceManifestSha256: sha(sourceBytes),
  baselineInstructionsSha256: sha(instructions), styleBriefPath: styleFile, styleBriefSha256: sha(style),
  runtimeLockPath: path.join(repo, 'docs/evaluations/gpt6-three/humanoid-motion-repair-20260906/runtime-lock.json'),
  variants: { a: 'Existing effective creative prompt', b: 'Same creative prompt plus the shared matte structural style paragraph' },
  accountSelection: 'Not performed; pin the same freshly available verified account within each pair when generation is authorized again',
  cloudSubmissions: 0, sourceInputsModified: false, sdkChanged: false, pairs,
});
console.log(JSON.stringify({ output, pairs: pairs.length, manifests: ['a-manifest.json', 'b-manifest.json'], cloudSubmissions: 0 }));
