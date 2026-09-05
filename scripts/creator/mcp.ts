import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import { CreatorTools, CREATOR_TOOL_VERSION } from "./tools.js";
import { CREATOR_SCENE_CONFIG_SCHEMA_V1 } from "./config.js";

const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });
const text = { type: "string" };
export const CREATOR_MINIMAL_SCENE_SOURCE = `import { defineBabylonNativeScene } from '@whitebox-world/native-babylon';
import { registerEntity } from '@worldkit/creator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';

export default defineBabylonNativeScene({
  kind: 'babylon-native-scene-module',
  id: 'creator-minimal-world',
  build(context) {
    const ground = MeshBuilder.CreateBox('ground', { width: 80, height: 0.5, depth: 80 }, context.scene);
    const groundMaterial = new StandardMaterial('ground-material', context.scene);
    groundMaterial.diffuseColor = new Color3(0.48, 0.65, 0.36);
    ground.material = groundMaterial;
    ground.position.y = -0.25;
    ground.computeWorldMatrix(true);
    registerEntity(context, ground, { id: 'ground', physics: 'solid', traversable: true });
  },
});
`;
export const CREATOR_TOOLS = [
  { name: "creator_describe_environment", description: "Describe the actual experimental WorldKit runtime, available tools, and capabilities not implemented. Call first.", inputSchema: object({}) },
  { name: "creator_get_authoring_schema", description: "Get the exact scene.json schema and how to author scene.ts. Do not guess config fields or custom subject shapes.", inputSchema: object({}) },
  { name: "assets_search", description: "Search reusable subject models and exact animation IDs. Static models have no skeletal actions.", inputSchema: object({ query: text }) },
  { name: "assets_describe", description: "Inspect a selected subject pack, dimensions, motions, exact actions and usage constraints.", inputSchema: object({ subjectPackId: text }, ["subjectPackId"]) },
  { name: "world_validate", description: "Snapshot scene.ts + scene.json and compile an immutable candidate. Returns an operation ID. Compilation success alone does not prove runtime/playability.", inputSchema: object({}) },
  { name: "world_preview", description: "Render the actual Babylon/Havok candidate. Returns operation ID; operations_get returns the PNG image and camera/physics diagnostics. Failed builds may include private authoringDiagnostics with precise code/message/hint; repair that error in the same scene. Inspect successful images against the user's original reference.", inputSchema: object({ view: { type: "string", enum: ["opening", "top-down", "entity-triview"] }, entityIds: { type: "array", items: text, minItems: 1, maxItems: 8 } }) },
  { name: "world_playtest", description: "Run a real controller through scene.json exploration targets, without teleportation, and record an actual low-cadence evaluation video and trajectory. Use 10-30s to debug, then 180s+ before submit. Returns an operation ID. Blocked targets must be repaired.", inputSchema: object({ durationSeconds: { type: "integer", minimum: 1, maximum: 300 }, framesPerSecond: { type: "integer", enum: [1, 2, 3, 6] } }) },
  { name: "world_capture_triviews", description: "Capture real front/right/back views of the controlled subject and registered visualTargets. Returns operation ID. Use the same stable entity ID in registerEntity and scene.json.", inputSchema: object({}) },
  { name: "world_submit", description: "Seal source, real preview, three views, passing 180s+ exploration and a standalone playable build into creator-delivery.tar.gz plus creator-result.json. Requires current-source successful playtest and nontrivial coverage. Experimental only; no formal production signature.", inputSchema: object({}) },
  { name: "operations_get", description: "Read an existing operation. Poll with waitSeconds<=25. For a completed preview, the actual PNG image is included. Do not create duplicate operations when one is running.", inputSchema: object({ operationId: text, waitSeconds: { type: "number", minimum: 0, maximum: 25 } }, ["operationId"]) },
  { name: "operations_cancel", description: "Cancel an existing operation and stop its browser work. Read its final operation status before starting another run.", inputSchema: object({ operationId: text }, ["operationId"]) },
];
const validator = new Ajv({ allErrors: true, strict: false });
const checks = new Map(CREATOR_TOOLS.map(tool => [tool.name, validator.compile(tool.inputSchema)]));

export async function executeCreatorTool(service: CreatorTools, name: string, input: Record<string, any>) {
  const check = checks.get(name);
  if (!check || !check(input)) throw new Error(`CREATOR_TOOL_INPUT_INVALID: ${name} ${JSON.stringify(check?.errors ?? [])}`);
  const args = input as Record<string, any>;
  switch (name) {
    case "creator_describe_environment": return service.environment();
    case "creator_get_authoring_schema": return { schema: CREATOR_SCENE_CONFIG_SCHEMA_V1,
      minimalSceneSource: CREATOR_MINIMAL_SCENE_SOURCE,
      minimalSceneScope: "This is an executable scene.ts API example for a valid scene.json, not a completed reconstruction or exploration test. Use your scene id, reference layout, landmarks and gameplay. The example's ground support surface is y=0.",
      entityRegistration: { helperImport: "@worldkit/creator", idPattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$", maximumIdLength: 64, allowedOptionKeys: ["id", "physics", "traversable"], physics: ["solid", "none"], traversableRule: "Optional boolean. physics:none requires omitted or false. A solid entity defaults to traversable unless false." },
      source: "scene.ts exports default defineBabylonNativeScene({kind:'babylon-native-scene-module',id,build(context){...}}). Import defineBabylonNativeScene from '@whitebox-world/native-babylon'; import registerEntity from '@worldkit/creator'. Import MeshBuilder/VertexData/Vector3/Color3/StandardMaterial from their exact @babylonjs/core deep ESM modules, as shown in minimalSceneSource. Assign a Material such as StandardMaterial to mesh.material; assign Color3 to the material's diffuseColor, never directly to mesh.material. Finish each mesh's geometry and transforms before registerEntity(context, mesh, {id, physics:'solid'|'none', traversable:true|false}); the same visible mesh supplies collisions. Entity ids use lowercase letters/digits/dots/hyphens, at most 64 characters, with a letter/digit at both ends. physics:none cannot be traversable:true. Spawn is registered by Host from scene.json: do not register it yourself. Use context.random.nextRatio(), context.random.range(min,max), or context.random.pick(values) for deterministic randomness. For a compound visual target, merge its static parts into one mesh before registering its unique entity id. No engines, cameras, render loops, timers, network, process, window or document. Helpers can be local .ts files. scene.json camera values are SDK-owned. Every visualTargets id must match a registered mesh entity. Read the custom-rigid parts schema; only actual collision parts set colliderContribution:'include' and touch the support y=0 plane. Place 3+ exploration waypoints on actual ground, including intermediate turns; the tool walks straight between waypoints. Ensure at least 30m exploration extent and 15 distinct 5m cells. Runtime tool progress is authoritative; repair geometry when stuck. For failed build operations, read private authoringDiagnostics code/message/hint; the original NativeHost rejection remains authoritative." };
    case "assets_search": return service.assets(args.query);
    case "assets_describe": return service.assets("", args.subjectPackId);
    case "world_validate": return service.start("world.validate", async () => { const c = await service.prepare(); return { status: "compiled", candidateId: c.id, sourceHash: c.sourceHash, runtimeValidation: "not-run" }; });
    case "world_preview": return service.start("world.preview", () => service.preview(args.view, args.entityIds));
    case "world_playtest": return service.start("world.playtest", id => service.playtest(id, args.durationSeconds ?? 180, args.framesPerSecond ?? 3));
    case "world_capture_triviews": return service.start("world.capture-triviews", () => service.triviews());
    case "world_submit": return service.start("world.submit", () => service.submit());
    case "operations_get": return service.getOperation(args.operationId, args.waitSeconds ?? 0);
    case "operations_cancel": return service.cancel(args.operationId);
    default: throw new Error("CREATOR_TOOL_UNKNOWN");
  }
}

export async function serveCreatorMcp(workspace: string) {
  const service = new CreatorTools(workspace);
  const server = new Server({ name: "worldkit-creator", version: CREATOR_TOOL_VERSION }, { capabilities: { tools: {} }, instructions: "Build and inspect real Native WorldKit worlds. Read environment/schema first. Long work returns operation IDs; poll them. Inspect actual image outputs and repair the same scene. Do not claim formal production or runtime edit capabilities not implemented." });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: CREATOR_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const result = await executeCreatorTool(service, request.params.name, request.params.arguments ?? {});
      const content: any[] = [{ type: "text", text: JSON.stringify(result) }];
      const value = result as any;
      const imagePath = value?.status === "succeeded" ? value.result?.image?.path : undefined;
      if (imagePath && path.resolve(imagePath).startsWith(`${service.evidenceRoot}${path.sep}`)) content.push({ type: "image", mimeType: "image/png", data: (await readFile(imagePath)).toString("base64") });
      return { content };
    } catch (error) { return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] }; }
  });
  const stop = async () => { await service.close(); await server.close(); };
  process.once("SIGTERM", () => void stop()); process.once("SIGINT", () => void stop());
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("creator", "mcp.ts"))) {
  const index = process.argv.indexOf("--workspace");
  await serveCreatorMcp(index >= 0 ? process.argv[index + 1]! : process.cwd());
}
