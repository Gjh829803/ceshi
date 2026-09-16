import Ajv from 'ajv';
import { AGENT_DOCUMENT_PATHS } from '../discovery/agent-docs.js';
import { objectSchema } from '../contracts.js';
import { SCHEMA_SECTIONS } from '../discovery/creator-discovery.js';
import { AUTHORING_TOPICS } from '../discovery/authoring-schema.js';
import { BINDING_EXAMPLE_TOPICS } from '../discovery/binding-examples.js';
import { WORLD_COMMAND_SCHEMA } from '../schema/command-schema.js';
import { CreatorToolInputError } from './tool-errors.js';
import { operationFeedback, startWithReply } from './operation-feedback.js';
import type { ThreeCreatorTools } from './tools.js';

// A tool's discovery schema and execution live together for both CLI and MCP.
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ReturnType<typeof objectSchema> & {allOf?: object[]};
  readOnly?: boolean;
  execute: (service: ThreeCreatorTools, input: Record<string, any>) => unknown;
};

const string = { type: 'string', minLength: 1 };
const definitions: ToolDefinition[] = [
  {
    execute: (service, input) => service.environment(),
    readOnly: true,
    name: 'creator_describe_environment',
    description: 'Read the selected Three raw/SDK profile, actual capabilities and limitations. Call first.',
    inputSchema: objectSchema({}) },
  {
    execute: (service, input) => input.document !== undefined ? service.readAuthoringDocument(input.document) : service.authoringSchema(input.topic, input.sections),
    readOnly: true,
    name: 'creator_get_authoring_schema',
    description: 'Read a source-backed topic guide first. Read quality for task requirements, programming for coding/tools, getting-started for the SDK index and assets for resource selection. Follow returned navigation with document to read one child page; do not combine document with topic/sections. Topic/sections provide deeper interfaces. Default sections is [guide]. Request contracts, project, episode, observation, commands or humanoid only when needed; [all] returns the full topic.',
    inputSchema: {...objectSchema({ document:{enum:AGENT_DOCUMENT_PATHS}, topic: { enum: AUTHORING_TOPICS }, sections: { type: 'array', items: { enum: SCHEMA_SECTIONS }, minItems: 1, maxItems: 8, uniqueItems: true } }), allOf:[{if:{required:['document']},then:{not:{anyOf:[{required:['topic']},{required:['sections']}]}}}] } },
  {
    execute: (service, input) => service.bindingExamples(input.topic,input.files,input.variant),
    readOnly: true,
    name: 'creator_get_examples',
    description: 'Get a binding snippet with explicit scene/map inputs; integrate it into your authored world. Choose the topic matching the subject: getting-started for a human, character-actions for requested contextual actions, mounted-interaction for creature riding (variant flying-creature for flying mounts), custom-vehicle for authored vehicles (variant car, motorcycle or plane), nonhuman-subject for an animal protagonist. Read explicit files from the manifest as needed.',
    inputSchema: objectSchema({ topic: { enum: BINDING_EXAMPLE_TOPICS }, variant:{enum:['car','motorcycle','plane','flying-creature']}, files:{type:'array',items:string,maxItems:32,uniqueItems:true} }) },
  {
    execute: (service, input) => service.materializeRuntime(),
    name: 'creator_materialize_runtime',
    description: 'Copy editable browser SDK source into sdk/ for this workspace and return runtimeSourceHash. This does not start or compile the runtime. Edit its source, then world_validate compiles it with locked dependencies. Source hashes and files ship in delivery. Existing sdk/ files are preserved.',
    inputSchema: objectSchema({}) },
  {
    execute: (service, input) => service.searchAssets(input.query, input.limit, input.offset),
    readOnly: true,
    name: 'assets_search',
    description: 'Search allowed assets by name or action, including Chinese skills. Returns ranked summaries, default 5 (max 20), with nextOffset pagination. Empty query lists allowed assets. Read assets_describe for complete resources and conditions; mountUsage reports missing dependencies without expanding permissions.',
    inputSchema: objectSchema({ query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 }, offset: { type: 'integer', minimum: 0 } }) },
  {
    execute: (service, input) => service.describeAsset(input.assetId),
    readOnly: true,
    name: 'assets_describe',
    description: 'Read complete permitted asset resources, exact animation mapping, characterUsage and mountUsage conditions/control bindings. Select its id in project.json; use createHumanoidWorld for the supplied human, and follow binding conditions for custom subjects.',
    inputSchema: objectSchema({ assetId: string }, ['assetId']) },
  {
    execute: (service, input) => service.start('world.validate', () => service.validate()),
    name: 'world_validate',
    description: 'Compile a browser candidate without executing author code/config on the Host. Uses shared Three and the selected default or workspace SDK source. Episode-only changes do not rebuild the world. Returns operationId; compilation alone is not runtime acceptance.',
    inputSchema: objectSchema({}) },
  {
    execute: (service, input) => service.start('world.preview', () => service.preview(input.view, input.entityIds, input.frontYawRadians)),
    name: 'world_preview',
    description: "Render pure world PNGs. current renders the SDK current fixed-step presentation (alpha 1), or the raw current camera, without pausing, reset, mode change or simulation stepping. Its camera observation includes compact state, explicit overrides, resolved settings and advisory framing; unavailable diagnostics are null. opening (the default) pauses and resets to the opening state. top-down and entity-triview pause without resetting. For entity-triview, select at most one complete object or representative with entityIds: ['rider']; omit entityIds to use the subject. top-down may select multiple targets. Opening/current also return advisory live viewport diagnostics. Compare with the user reference.",
    inputSchema: {...objectSchema({ view: { enum: ['opening', 'current', 'top-down', 'entity-triview'] }, entityIds: { type: 'array', items: string, maxItems: 16 }, frontYawRadians: { type: 'number' } }),allOf:[{if:{properties:{view:{const:'entity-triview'}},required:['view']},then:{properties:{entityIds:{maxItems:1}}}}]} },
  {
    execute: (service, input) => service.start('world.inspect', () => service.inspect({ query: input.query, entityIds: input.entityIds, sections: input.sections, vehicleDetail: input.vehicleDetail })),
    name: 'world_inspect',
    description: 'Inspect the real world. Use sections:[snapshot] for current actor/camera state or [description] with entityIds for action/boarding eligibility. hierarchy adds geometry bounds; diagnostics adds physics/input audit; viewport reads live canvas render/display sizes, pixel density and camera aspect without resizing. Use sections:[camera] for committed camera configuration and field provenance. Use sections:[vehicles] for opt-in vehicle state, with vehicleDetail:wheels for per-wheel evidence. Omit sections for standard sections only. query matches SDK entity id/name/tags; omitted entityIds selects all, [] selects none. Unavailable SDK telemetry is null; viewport diagnostics report status:unavailable. Feedback is advisory. Returns Creator operationId.',
    inputSchema: objectSchema({ query: string, entityIds: { type: 'array', items: string, maxItems: 64 }, sections: {type: 'array', items: {enum: ['snapshot','description','hierarchy','diagnostics','vehicles','camera','viewport']}, minItems: 1, maxItems: 7, uniqueItems: true}, vehicleDetail:{enum:['summary','wheels']} }) },
  {
    execute: (service, input) => service.start('world.check-viewport', () => service.checkViewport({width:input.widthCssPixels,height:input.heightCssPixels})),
    name: 'world_check_viewport',
    description: 'Optional advisory resize probe for a small or blurry page. Temporarily changes the browser viewport to the requested CSS pixel size, samples canvas resolution and camera aspect, then restores the original browser size. No pause/reset/step; a live world continues. Reports before/resized/restored evidence and restoration status. Unavailable measurements and warnings do not affect submission eligibility. This is not an actual browser fullscreen test.',
    inputSchema: objectSchema({widthCssPixels:{type:'integer',minimum:1,maximum:4096},heightCssPixels:{type:'integer',minimum:1,maximum:4096}},['widthCssPixels','heightCssPixels']) },
  {
    execute: (service, input) => startWithReply(service, 'world.execute-command', id => service.executeCommand(input.command, id), input.waitSeconds),
    name: 'world_execute_command',
    description: 'Execute one SDK v2 command in the current browser. Optional waitSeconds (0-25) returns the result inline when ready; otherwise keep operationId and follow next. worldExecution distinguishes applied/accepted/rejected from Host status; accepted is not completed. Never resubmit to poll. Waiting does not start simulation. Raw profile is unsupported.',
    inputSchema: objectSchema({ command: WORLD_COMMAND_SCHEMA, waitSeconds: {type: 'number', minimum: 0, maximum: 25} }, ['command']) },
  {
    execute: (service, input) => startWithReply(service, 'world.get-operation', () => service.worldOperation(input.worldOperationId, input.waitSeconds ?? 0), input.waitSeconds),
    name: 'world_get_operation',
    description: 'Read the World operationId from an accepted command. With positive waitSeconds (max 25), return inline when ready; otherwise follow next using the returned Creator operationId. worldExecution is the sampled action status, separate from Host query status. A reply timeout leaves the same query running; never resubmit the action or auto-start the world.',
    inputSchema: objectSchema({ worldOperationId: string, waitSeconds: { type: 'number', minimum: 0, maximum: 25 } }, ['worldOperationId']) },
  {
    execute: (service, input) => service.start('world.playtest', id => service.playtest(id, input.durationSeconds, input.framesPerSecond)),
    name: 'world_playtest',
    description: 'Execute the Creator input plan in episode.json with real browser keys, pointer drags, commands/lifecycle and optional bounded driveTo steps for mounted road vehicles. driveTo follows supplied points with real throttle/steering/braking; it does not find paths. Top-level XYZ targets only measure proximity; they never steer or teleport. targetResults includes the nearest recorded sample, its time and target-minus-player XYZ offset in meters. Timeout or blocked driveTo fails the recording and stops later steps; inspect feedback.roadRoutes. Record video, input and runtime evidence. passed means technical recording checks passed, not a complete plan or semantic acceptance. feedback.actions summarizes rejected commands and failed/pending operations without interrupting remaining input; judge outcomes against task intent. recordingReadiness lists recording prerequisites and missing items for its recorded hashes; submit still rechecks current files and identity. Omit durationSeconds to execute all steps (driveTo can finish before its timeout); a shorter value truncates debugging, a longer value continues waiting after the steps with any unreleased keys still held. framesPerSecond requests video sampling, not simulation or render FPS. Submit requires a complete nonempty plan and valid real-input video. Water and viewport feedback are advisory.',
    inputSchema: objectSchema({ durationSeconds: { type: 'number', exclusiveMinimum: 0, maximum: 600 }, framesPerSecond: { enum: [1, 2, 3, 6] } }) },
  {
    execute: (service, input) => service.start('world.capture-triviews', () => service.triviews(input.includeAdditionalTargets??false)),
    name: 'world_capture_triviews',
    description: 'Reset the world, then capture opening, full playable-area top-down, and up to five prioritized front/right/back sheets, complete subject first. Choose important objects via setCaptureTargets; repeated objects use one complete representative. includeAdditionalTargets captures all ordered selections.',
    inputSchema: objectSchema({includeAdditionalTargets:{type:'boolean'}}) },
  {
    execute: (service, input) => service.start('world.submit', () => service.submit()),
    name: 'world_submit',
    description: 'Create a local verified delivery archive and creator-result.json from this same-session current-source/current-episode complete real-input recording, three views and playable. Missing current opening, full-area top-down and object three-views are captured automatically. This does not upload, publish, start Episode or request review. The package is ready for independent semantic/reference review.',
    inputSchema: objectSchema({}) },
  {
    execute: async (service, input) => operationFeedback(await service.getOperation(input.operationId, input.waitSeconds ?? 0)),
    readOnly: true,
    name: 'operations_get',
    description: 'Poll a Creator operationId; successful previews include actual image bytes. Command replies include worldExecution and next. Host succeeded can still contain a rejected or failed World action. waitSeconds is at most 25. Never submit duplicate operations while waiting.',
    inputSchema: objectSchema({ operationId: string, waitSeconds: { type: 'number', minimum: 0, maximum: 25 } }, ['operationId']) },
  {
    execute: (service, input) => service.readPlaytest(input.operationId, {fromSeconds:input.fromSeconds,toSeconds:input.toSeconds,maxSamples:input.maxSamples}),
    readOnly: true,
    name: 'world_read_playtest',
    description: 'Read an existing completed world_playtest from this service session. Select a browser-trace time range to inspect sampled position, speed, mounting, camera and keyboard events. Does not compile, open a browser, advance simulation or record again. Returns recorded source identity; no comparison to current source. Null telemetry is unavailable; this summary does not judge task success. maxSamples defaults to 12 (2–32).',
    inputSchema: objectSchema({operationId:string,fromSeconds:{type:'number',minimum:0},toSeconds:{type:'number',minimum:0},maxSamples:{type:'integer',minimum:2,maximum:32}},['operationId']) },
  {
    execute: (service, input) => service.cancel(input.operationId),
    name: 'operations_cancel',
    description: 'Cancel an operation in this service. Cancelling a queued operation never closes an unrelated active browser.',
    inputSchema: objectSchema({ operationId: string }, ['operationId']) },
];

export const THREE_CREATOR_TOOLS = definitions.map(({execute, readOnly = false, ...tool}) => ({
  ...tool,
  annotations: {readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false},
}));
const ajv = new Ajv({ allErrors: true, strict: false, strictNumbers: true });
const toolsByName = new Map(definitions.map(tool => [tool.name, {
  execute: tool.execute,
  check: ajv.compile(tool.inputSchema),
}]));

export async function executeThreeCreatorTool(service: ThreeCreatorTools, name: string, args: Record<string, any> = {}) {
  const tool = toolsByName.get(name);
  if (!tool || !tool.check(args)) throw new CreatorToolInputError(name, tool?.check.errors ?? []);
  return tool.execute(service, args);
}
