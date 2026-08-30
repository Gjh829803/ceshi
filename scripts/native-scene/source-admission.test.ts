import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  admitBabylonNativeSourceGraphV1,
} from "./source-admission.js";
import {
  createNativeSceneWorkspaceFixtureV1,
  MINIMAL_NATIVE_SCENE_SOURCE_V1,
  removeNativeSceneWorkspaceFixtureV1,
} from "./test-support.js";

const roots: string[] = [];

async function fixture(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<string> {
  const root = await createNativeSceneWorkspaceFixtureV1({ files });
  roots.push(root);
  return root;
}

async function admittedCode(
  source: string,
  extraFiles: Readonly<Record<string, string | Uint8Array>> = {},
): Promise<Readonly<{
  outcome: string;
  code?: string;
  sourcePaths?: readonly string[];
  externalImportSpecifiers?: readonly string[];
}>> {
  const result = await admitBabylonNativeSourceGraphV1(await fixture({
    "scene.ts": source,
    ...extraFiles,
  }));
  return result.outcome === "passed"
    ? {
        outcome: result.outcome,
        sourcePaths: result.sourceGraph.workspace.sourcePaths,
        externalImportSpecifiers: result.sourceGraph.externalImportSpecifiers,
      }
    : { outcome: result.outcome, code: result.diagnostics[0]!.code };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeNativeSceneWorkspaceFixtureV1));
});

describe("Babylon Native Source Admission", () => {
  it("admits reachable .js-to-.ts local ESM and excludes unreachable files", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { buildGeometry } from "./src/geometry.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() { buildGeometry(); },
      });
    `, {
      "src/geometry.ts": "export function buildGeometry(): void {}",
      "src/unreachable.ts": "throw new Error('must not enter graph');",
    });

    expect(result).toEqual({
      outcome: "passed",
      sourcePaths: ["scene.ts", "src/geometry.ts"],
      externalImportSpecifiers: ["@whitebox-world/native-babylon"],
    });
  }, 15_000);

  it("admits both WorldKit roots and the exact 12 Babylon Deep ESM specifiers", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { BABYLON_NATIVE_BLOCK_PROFILE_REF_V1 } from "@whitebox-world/native-babylon-block-profile";
      import { Buffer } from "@babylonjs/core/Buffers/buffer.js";
      import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
      import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
      import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
      import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
      import { Color3 } from "@babylonjs/core/Maths/math.color.js";
      import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
      import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
      import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
      import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
      import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
      import type { Scene } from "@babylonjs/core/scene.js";
      type Allowed = Scene | Buffer | DirectionalLight | HemisphericLight | PointLight |
        StandardMaterial | Color3 | Vector3 | Mesh | VertexData | TransformNode;
      void BABYLON_NATIVE_BLOCK_PROFILE_REF_V1;
      void MeshBuilder;
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() { const local: Allowed | undefined = undefined; void local; },
      });
    `);
    expect(result).toMatchObject({
      outcome: "passed",
      externalImportSpecifiers: [
        "@babylonjs/core/Buffers/buffer.js",
        "@babylonjs/core/Lights/directionalLight.js",
        "@babylonjs/core/Lights/hemisphericLight.js",
        "@babylonjs/core/Lights/pointLight.js",
        "@babylonjs/core/Materials/standardMaterial.js",
        "@babylonjs/core/Maths/math.color.js",
        "@babylonjs/core/Maths/math.vector.js",
        "@babylonjs/core/Meshes/mesh.js",
        "@babylonjs/core/Meshes/mesh.vertexData.js",
        "@babylonjs/core/Meshes/meshBuilder.js",
        "@babylonjs/core/Meshes/transformNode.js",
        "@babylonjs/core/scene.js",
        "@whitebox-world/native-babylon",
        "@whitebox-world/native-babylon-block-profile",
      ],
    });
  }, 15_000);

  it("admits local object and assignment destructuring inside build", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() {
          const local = { width: 4, depth: 8 };
          const { width } = local;
          let depth = 0;
          ({ depth } = local);
          void width;
          void depth;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it.each([
    ["tsx", "./src/value.tsx", "export const value = 1;"],
    ["actual js", "./src/value.js", "export const value = 1;"],
    ["json", "./src/value.json", "{}"],
    ["css", "./src/value.css", "body {}"],
    ["wasm", "./src/value.wasm", new Uint8Array([0, 97, 115, 109])],
    ["url", "https://example.com/value.js", undefined],
    ["absolute", "/tmp/value.js", undefined],
    ["bare local", "local-package", undefined],
    ["escape", "../outside.js", undefined],
  ] as const)("rejects an invalid local dependency form: %s", async (
    _name,
    specifier,
    contents,
  ) => {
    const extraFiles = typeof contents === "undefined"
      ? {}
      : { [specifier.replace(/^\.\//, "")]: contents };
    const result = await admittedCode(`
      import ${JSON.stringify(specifier)};
      ${MINIMAL_NATIVE_SCENE_SOURCE_V1}
    `, extraFiles);
    expect(result.outcome).toBe("rejected");
    expect(result.code).toMatch(
      /WORLDKIT_NATIVE_SCENE_(?:SOURCE_PATH_INVALID|DEPENDENCY_FORBIDDEN)/,
    );
  });

  it.each([
    "@babylonjs/core",
    "@whitebox-world/native-babylon/host",
    "@whitebox-world/runtime-babylon",
    "@whitebox-world/runtime-host",
    "@whitebox-world/compiler",
    "@whitebox-world/authoring",
    "@whitebox-world/camera",
    "@whitebox-world/character-movement",
    "@babylonjs/havok",
    "babylonjs",
    "three",
    "node:fs",
  ])("rejects forbidden external dependency %s", async (specifier) => {
    const result = await admittedCode(`
      import ${JSON.stringify(specifier)};
      ${MINIMAL_NATIVE_SCENE_SOURCE_V1}
    `);
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_DEPENDENCY_FORBIDDEN",
    });
  });

  it("rejects unresolved dependencies, symlink files/directories, and case-fold collisions", async () => {
    expect(await admittedCode(`
      import "./src/missing.js";
      ${MINIMAL_NATIVE_SCENE_SOURCE_V1}
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_DEPENDENCY_UNRESOLVED",
    });

    const symlinkFileRoot = await fixture({
      "scene.ts": `import "./src/link.js"; ${MINIMAL_NATIVE_SCENE_SOURCE_V1}`,
      "src/actual.ts": "export {};",
    });
    await symlink("actual.ts", path.join(symlinkFileRoot, "src/link.ts"));
    const symlinkFile = await admitBabylonNativeSourceGraphV1(symlinkFileRoot);
    expect(symlinkFile.outcome).toBe("rejected");
    if (symlinkFile.outcome !== "passed") {
      expect(symlinkFile.diagnostics[0]?.code).toBe(
        "WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN",
      );
    }

    const symlinkDirectoryRoot = await fixture({
      "scene.ts": `import "./linked/value.js"; ${MINIMAL_NATIVE_SCENE_SOURCE_V1}`,
      "actual/value.ts": "export {};",
    });
    await symlink("actual", path.join(symlinkDirectoryRoot, "linked"));
    const symlinkDirectory = await admitBabylonNativeSourceGraphV1(
      symlinkDirectoryRoot,
    );
    expect(symlinkDirectory.outcome).toBe("rejected");
    if (symlinkDirectory.outcome !== "passed") {
      expect(symlinkDirectory.diagnostics[0]?.code).toBe(
        "WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN",
      );
    }

    const collision = await admittedCode(`
      import "./src/Rock.js";
      import "./src/rock.js";
      ${MINIMAL_NATIVE_SCENE_SOURCE_V1}
    `, {
      "src/Rock.ts": "export {};",
      "src/rock.ts": "export {};",
    });
    expect(collision).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_CASE_COLLISION",
    });
  });

  it.each([
    ["dynamic import", "await import('./src/value.js');"],
    ["CommonJS", "require('./src/value.js');"],
    ["random", "Math.random();"],
    ["time", "Date.now();"],
    ["date constructor", "void new Date();"],
    ["crypto UUID", "crypto.randomUUID();"],
    ["crypto random values", "crypto.getRandomValues(new Uint8Array(4));"],
    ["aliased time", "const D = Date; D.now();"],
    ["aliased random", "const M = Math; M.random();"],
    ["computed const random", "const key = 'random'; Math[key]();"],
    ["computed const time", "const key = 'now'; Date[key]();"],
    ["any-cast random", "(Math as any).random();"],
    ["any-aliased random", "const M: any = Math; M.random();"],
    [
      "structural-cast random",
      "(Math as { random(): number }).random();",
    ],
    [
      "unknown structural-cast random",
      "(Math as unknown as { random(): number }).random();",
    ],
    [
      "unknown structural-cast aliased random",
      "const M = Math as unknown as { random(): number }; M.random();",
    ],
    ["destructured random", "const { random } = Math; random();"],
    [
      "parameter-destructured random",
      "function take({ random }: Math): void { random(); } take(Math);",
    ],
    [
      "parameter-destructured Babylon engine",
      "function take({ getEngine }: typeof context.scene): void { getEngine(); } take(context.scene);",
    ],
    [
      "assignment-destructured Babylon engine",
      "let getEngine: typeof context.scene.getEngine; ({ getEngine } = context.scene); getEngine();",
    ],
    [
      "for-of destructured Babylon engine",
      "for (const { getEngine } of [context.scene]) { getEngine(); }",
    ],
    [
      "nested-destructured Babylon engine",
      "const [{ getEngine }] = [context.scene]; getEngine();",
    ],
    ["reflected random", "Reflect.get(Math, 'random')();"],
    [
      "descriptor random",
      "Object.getOwnPropertyDescriptor(Math, 'random')!.value();",
    ],
    [
      "computed descriptor random",
      "const key = 'getOwnPropertyDescriptor'; Object[key](Math, 'random')!.value();",
    ],
    [
      "any-cast descriptor random",
      "(Object as any).getOwnPropertyDescriptor(Math, 'random')!.value();",
    ],
    [
      "unknown structural-cast Babylon engine",
      "(context.scene as unknown as { getEngine(): unknown }).getEngine();",
    ],
    [
      "unknown structural-cast aliased Babylon engine",
      "const scene = context.scene as unknown as { getEngine(): unknown }; scene.getEngine();",
    ],
    [
      "structural parameter random",
      "function take(value: { random(): number }): void { value.random(); } take(Math);",
    ],
    [
      "structural parameter Babylon engine",
      "function take(value: { getEngine(): unknown }): void { value.getEngine(); } take(context.scene);",
    ],
    [
      "structural parameter Babylon callback",
      "function take(value: { registerBeforeRender(callback: () => void): void }): void { value.registerBeforeRender(() => {}); } take(context.scene);",
    ],
    [
      "structural return random",
      "const wrap = () => Math as unknown as { random(): number }; wrap().random();",
    ],
    [
      "delayed structural Babylon engine",
      "let scene: { getEngine(): unknown }; scene = context.scene; scene.getEngine();",
    ],
    [
      "Object.create random",
      "Object.create(Math).random();",
    ],
    [
      "Object.assign retained context",
      "Object.assign(this, { retained: context });",
    ],
    [
      "Object.defineProperty retained context",
      "Object.defineProperty(this, 'retained', { value: context });",
    ],
    [
      "Object.setPrototypeOf retained context",
      "Object.setPrototypeOf(this, { retained: context });",
    ],
    [
      "Record structural random",
      "type RandomRecord = Record<'random', () => number>; function take(value: RandomRecord): void { value.random(); } take(Math);",
    ],
    [
      "Pick structural Babylon engine",
      "type SceneEngine = Pick<typeof context.scene, 'getEngine'>; const scene: SceneEngine = context.scene; scene.getEngine();",
    ],
    [
      "generic structural Babylon callback",
      "function take<T extends { registerBeforeRender(callback: () => void): void }>(value: T): void { value.registerBeforeRender(() => {}); } take(context.scene);",
    ],
    [
      "computed structural Babylon engine",
      "function take(value: { ['getEngine'](): unknown }): void { value.getEngine(); } take(context.scene);",
    ],
    [
      "computed generic structural Babylon engine",
      "function take<T extends { ['getEngine'](): unknown }>(value: T): void { value.getEngine(); } take(context.scene);",
    ],
    [
      "typeof-mapped structural Babylon engine",
      "const key = 'getEngine' as const; type SceneEngine = { [K in typeof key]: () => unknown }; function take(value: SceneEngine): void { value.getEngine(); } take(context.scene);",
    ],
    ["Babylon input attach", "context.scene.attachControl();"],
    ["Babylon input detach", "context.scene.detachControl();"],
    [
      "Babylon camera add",
      "context.scene.addCamera(undefined as never);",
    ],
    [
      "Babylon camera switch",
      "context.scene.switchActiveCamera(undefined as never);",
    ],
    [
      "Babylon camera select",
      "context.scene.setActiveCameraById('camera');",
    ],
    [
      "Babylon camera select by name",
      "context.scene.setActiveCameraByName('camera');",
    ],
    [
      "Babylon legacy camera select by ID",
      "context.scene.setActiveCameraByID('camera');",
    ],
    [
      "Babylon camera select by name extraction",
      "const select = context.scene.setActiveCameraByName; void select;",
    ],
    [
      "Babylon legacy camera select by ID extraction",
      "const select = context.scene.setActiveCameraByID; void select;",
    ],
    [
      "Babylon input method extraction",
      "const attach = context.scene.attachControl; void attach;",
    ],
    [
      "this-retained build context",
      "(this as { retained?: unknown }).retained = context;",
    ],
    [
      "this build alias retained context",
      "const fn = this.build; (fn as typeof fn & { retained?: unknown }).retained = context;",
    ],
    [
      "aliased this build retained context",
      "const moduleAlias = this; const fn = moduleAlias.build; (fn as typeof fn & { retained?: unknown }).retained = context;",
    ],
    [
      "destructured this build retained context",
      "const { build } = this; (build as typeof build & { retained?: unknown }).retained = context;",
    ],
    [
      "assignment destructured this build retained context",
      "let build: ((...args: readonly unknown[]) => unknown) | undefined; ({ build } = this as unknown as { build: typeof build }); if (build) (build as typeof build & { retained?: unknown }).retained = context;",
    ],
    [
      "this build via object retained context",
      "const bag = { fn: this.build }; (bag.fn as typeof bag.fn & { retained?: unknown }).retained = context;",
    ],
    [
      "this build via array retained context",
      "const fns = [this.build]; (fns[0] as typeof fns[0] & { retained?: unknown }).retained = context;",
    ],
    [
      "this build via comma retained context",
      "(0, this.build as typeof this.build & { retained?: unknown }).retained = context;",
    ],
    [
      "this build via helper retained context",
      "function wrap(module: { build: typeof this.build }): void { (module.build as typeof module.build & { retained?: unknown }).retained = context; } wrap(this);",
    ],
    [
      "this build via spread retained context",
      "const rest = { ...this }; (rest.build as typeof rest.build & { retained?: unknown }).retained = context;",
    ],
    [
      "Babylon default camera structural call",
      "(context.scene as unknown as { createDefaultCamera(): void }).createDefaultCamera();",
    ],
    [
      "Babylon default camera or light structural call",
      "(context.scene as unknown as { createDefaultCameraOrLight(): void }).createDefaultCameraOrLight();",
    ],
    [
      "Babylon default VR structural call",
      "(context.scene as unknown as { createDefaultVRExperience(): void }).createDefaultVRExperience();",
    ],
    [
      "Babylon default XR structural call",
      "(context.scene as unknown as { createDefaultXRExperienceAsync(): Promise<unknown> }).createDefaultXRExperienceAsync();",
    ],
    ["with random", "with (Math) { random(); }"],
    ["timer", "setTimeout(() => {}, 1);"],
    ["network", "fetch('https://example.com');"],
    ["DOM", "document.createElement('canvas');"],
    ["process", "process.env.SECRET;"],
    ["eval", "eval('1');"],
    ["Function", "new Function('return 1');"],
    ["Proxy", "void new Proxy({}, {});"],
    ["WeakRef", "void new WeakRef({});"],
    ["FinalizationRegistry", "void new FinalizationRegistry(() => {});"],
  ])("rejects forbidden source capability: %s", async (_name, statement) => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        async build(context) { ${statement} },
      });
    `, { "src/value.ts": "export const value = 1;" });
    expect(result.outcome).toBe("rejected");
    expect(result.code).toMatch(
      /WORLDKIT_NATIVE_SCENE_(?:DYNAMIC_IMPORT|SOURCE_(?:CAPABILITY|LIFECYCLE|MODULE_STATE))_FORBIDDEN/,
    );
  }, 30_000);

  it("keeps exact Scene helper types and Host random available", async () => {
    const result = await admittedCode(`
      import type { Scene } from "@babylonjs/core/scene.js";
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      function inspectVisualScene(scene: Scene): void {
        void scene.meshes.length;
      }
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          inspectVisualScene(context.scene);
          void context.random.range(0, 1);
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 30_000);

  it("rejects aliases of Babylon lifecycle, callbacks, collections, and retained module state", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { mutate } from "./src/alias.js";
      let retained: unknown;
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) { retained = context; mutate(context.scene); },
      });
    `, {
      "src/alias.ts": `
        import type { Scene } from "@babylonjs/core/scene.js";
        export function mutate(scene: Scene): void {
          const call = scene.getEngine;
          void call;
          scene.registerBeforeRender(() => {});
          scene.addMesh(null as never);
        }
      `,
    });
    expect(result.outcome).toBe("rejected");
    expect(result.code).toMatch(
      /WORLDKIT_NATIVE_SCENE_SOURCE_(?:LIFECYCLE|MODULE_STATE|CAPABILITY)_FORBIDDEN/,
    );
  });

  it("rejects retained state through an imported module-scope function", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { holder } from "./src/holder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          (holder as typeof holder & { retained?: unknown }).retained = context;
        },
      });
    `, {
      "src/holder.ts": "export function holder(): void {}",
    });
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);

  it.each([
    [
      "object",
      "const bag = { fn: holder }; (bag.fn as typeof bag.fn & { retained?: unknown }).retained = context;",
    ],
    [
      "array",
      "const fns = [holder]; (fns[0] as typeof holder & { retained?: unknown }).retained = context;",
    ],
    [
      "comma",
      "(0, holder as typeof holder & { retained?: unknown }).retained = context;",
    ],
    [
      "helper",
      "function retain(fn: typeof holder): void { (fn as typeof holder & { retained?: unknown }).retained = context; } retain(holder);",
    ],
  ])("rejects retained state through an imported function %s container", async (
    _name,
    statement,
  ) => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { holder } from "./src/holder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) { ${statement} },
      });
    `, {
      "src/holder.ts": "export function holder(): void {}",
    });
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 30_000);

  it.each([
    [
      "typed object",
      "const bag: { fn: { retained?: unknown } } = { fn: holder }; bag.fn.retained = context;",
    ],
    [
      "typed array",
      "const fns: Array<{ retained?: unknown }> = [holder]; fns[0]!.retained = context;",
    ],
    [
      "typed comma",
      "(0, holder as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed helper parameter",
      "function retain(target: { retained?: unknown }): void { target.retained = context; } retain(holder);",
    ],
    [
      "typed assignment",
      "let target: { retained?: unknown }; target = holder; target.retained = context;",
    ],
    [
      "typed destructuring",
      "const { fn }: { fn: { retained?: unknown } } = { fn: holder }; fn.retained = context;",
    ],
    [
      "typed helper chain",
      "function retain(target: { retained?: unknown }): void { target.retained = context; } function relay(target: { retained?: unknown }): void { retain(target); } relay(holder);",
    ],
    [
      "typed assignment destructuring",
      "let fn: { retained?: unknown }; ({ fn } = { fn: holder }); fn.retained = context;",
    ],
    [
      "typed property insertion",
      "const bag: { fn?: { retained?: unknown } } = {}; bag.fn = holder; bag.fn.retained = context;",
    ],
    [
      "typed array insertion",
      "const fns: Array<{ retained?: unknown }> = []; fns.push(holder); fns[0]!.retained = context;",
    ],
    [
      "typed map insertion",
      "const holders = new Map<string, { retained?: unknown }>(); holders.set('holder', holder); holders.get('holder')!.retained = context;",
    ],
    [
      "typed spread",
      "const bag: { fn: { retained?: unknown } } = { ...{ fn: holder } }; bag.fn.retained = context;",
    ],
    [
      "typed conditional",
      "const target: { retained?: unknown } = context.random.next() > -1 ? holder : {}; target.retained = context;",
    ],
    [
      "typed identity return",
      "function identity(target: { retained?: unknown }): { retained?: unknown } { return target; } const target = identity(holder); target.retained = context;",
    ],
    [
      "typed spread call",
      "function retain(...targets: Array<{ retained?: unknown }>): void { targets[0]!.retained = context; } retain(...[holder]);",
    ],
    [
      "typed array spread",
      "const source: Array<{ retained?: unknown }> = [holder]; const copied = [...source]; copied[0]!.retained = context;",
    ],
    [
      "typed default parameter",
      "function retain(target: { retained?: unknown } = holder): void { target.retained = context; } retain();",
    ],
    [
      "typed for-of",
      "for (const target of [holder] as Array<{ retained?: unknown }>) { target.retained = context; }",
    ],
    [
      "typed Map values iterator",
      "const holders = new Map<string, { retained?: unknown }>([['holder', holder]]); for (const target of holders.values()) { target.retained = context; }",
    ],
    [
      "typed Set values iterator",
      "const holders = new Set<{ retained?: unknown }>([holder]); for (const target of holders.values()) { target.retained = context; }",
    ],
    [
      "typed Map entries iterator",
      "const holders = new Map<string, { retained?: unknown }>([['holder', holder]]); for (const [, target] of holders.entries()) { target.retained = context; }",
    ],
    [
      "typed Map keys iterator",
      "const holders = new Map<{ retained?: unknown }, string>([[holder, 'holder']]); for (const target of holders.keys()) { target.retained = context; }",
    ],
    [
      "typed Map manual iterator",
      "const holders = new Map<string, { retained?: unknown }>([['holder', holder]]); const iterator = holders.values(); const target = iterator.next().value!; target.retained = context;",
    ],
    [
      "typed Set Symbol iterator",
      "const holders = new Set<{ retained?: unknown }>([holder]); const iterator = holders[Symbol.iterator](); const target = iterator.next().value!; target.retained = context;",
    ],
    [
      "typed Array Symbol iterator",
      "const holders: Array<{ retained?: unknown }> = [holder]; const iterator = holders[Symbol.iterator](); const target = iterator.next().value!; target.retained = context;",
    ],
    [
      "typed helper iterator return",
      "const holders = new Set<{ retained?: unknown }>([holder]); function first(items: Iterator<{ retained?: unknown }>): { retained?: unknown } { return items.next().value!; } first(holders.values()).retained = context;",
    ],
    [
      "typed optional iterator read",
      "const holders = new Set<{ retained?: unknown }>([holder]); const target = holders.values?.().next().value!; target.retained = context;",
    ],
    [
      "typed generator yield",
      "function* holders(): Generator<{ retained?: unknown }> { yield holder; } for (const target of holders()) { target.retained = context; }",
    ],
    [
      "typed tagged template helper return",
      "function tagged(_parts: TemplateStringsArray): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } tagged``.retained = context;",
    ],
    [
      "typed helper alias return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const alias = wrap; alias().retained = context;",
    ],
    [
      "typed helper property return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const helpers = { wrap }; helpers.wrap().retained = context;",
    ],
    [
      "typed assigned helper alias return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } let alias: typeof wrap; alias = wrap; alias().retained = context;",
    ],
    [
      "typed destructured helper alias return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const { wrap: alias } = { wrap }; alias().retained = context;",
    ],
    [
      "typed array-destructured helper alias return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const [alias] = [wrap]; alias!().retained = context;",
    ],
    [
      "typed tagged helper alias return",
      "function tagged(_parts: TemplateStringsArray): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const alias = tagged; alias``.retained = context;",
    ],
    [
      "typed tagged helper alias substitution return",
      "function tagged(_parts: TemplateStringsArray, target: { retained?: unknown }): { retained?: unknown } { return target; } const alias = tagged; alias`${holder}`.retained = context;",
    ],
    [
      "typed tagged helper property return",
      "function tagged(_parts: TemplateStringsArray): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const tags = { tagged }; tags.tagged``.retained = context;",
    ],
    [
      "typed assigned tagged helper alias return",
      "function tagged(_parts: TemplateStringsArray): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } let alias: typeof tagged; alias = tagged; alias``.retained = context;",
    ],
    [
      "typed tagged helper call return",
      "function tagged(_parts: TemplateStringsArray): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } tagged.call(undefined, [] as unknown as TemplateStringsArray).retained = context;",
    ],
    [
      "typed tagged helper apply return",
      "function tagged(_parts: TemplateStringsArray): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } tagged.apply(undefined, [[] as unknown as TemplateStringsArray]).retained = context;",
    ],
    [
      "typed aliased helper call return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const alias = wrap; alias.call(undefined).retained = context;",
    ],
    [
      "typed helper property call return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const helpers = { wrap }; helpers.wrap.call(undefined).retained = context;",
    ],
    [
      "typed helper call parameter return",
      "function identity(target: { retained?: unknown }): { retained?: unknown } { return target; } identity.call(undefined, holder).retained = context;",
    ],
    [
      "typed helper apply parameter return",
      "function identity(target: { retained?: unknown }): { retained?: unknown } { return target; } identity.apply(undefined, [holder]).retained = context;",
    ],
    [
      "typed bound helper return",
      "function wrap(): { retained?: unknown } { return holder as unknown as { retained?: unknown }; } const bound = wrap.bind(undefined); bound().retained = context;",
    ],
    [
      "typed bound helper parameter return",
      "function identity(target: { retained?: unknown }): { retained?: unknown } { return target; } const bound = identity.bind(undefined, holder); bound().retained = context;",
    ],
    [
      "typed Object identity",
      "const target = Object(holder) as { retained?: unknown }; target.retained = context;",
    ],
    [
      "typed new Object identity",
      "const target = new Object(holder) as { retained?: unknown }; target.retained = context;",
    ],
    [
      "typed Promise identity",
      "const target = await Promise.resolve(holder as unknown as { retained?: unknown }); target.retained = context;",
    ],
    [
      "typed forEach callback",
      "const holders: Array<{ retained?: unknown }> = [holder]; holders.forEach((target) => { target.retained = context; });",
    ],
    [
      "typed Promise then callback",
      "await Promise.resolve(holder as unknown as { retained?: unknown }).then((target) => { target.retained = context; });",
    ],
    [
      "typed Promise then identity return",
      "const target = await Promise.resolve(holder as unknown as { retained?: unknown }).then((value) => value); target.retained = context;",
    ],
    [
      "typed Promise catch identity return",
      "const target = await Promise.reject(holder as unknown as { retained?: unknown }).catch((value) => value); target.retained = context;",
    ],
    [
      "typed Promise then rejection callback",
      "await Promise.reject(holder as unknown as { retained?: unknown }).then(undefined, (target) => { target.retained = context; });",
    ],
    [
      "typed chained Promise catch callback",
      "await Promise.resolve(holder as unknown as { retained?: unknown }).then((value) => { throw value; }).catch((target) => { target.retained = context; });",
    ],
    [
      "typed Promise then call callback",
      "const promise = Promise.resolve(holder as unknown as { retained?: unknown }); await promise.then.call(promise, (target) => { target.retained = context; });",
    ],
    [
      "typed custom iterable helper",
      "function iterate(): Iterator<{ retained?: unknown }> { return [holder as unknown as { retained?: unknown }][Symbol.iterator](); } const iterable = { [Symbol.iterator]: iterate }; for (const target of iterable) { target.retained = context; }",
    ],
    [
      "typed custom iterable method",
      "const iterable = { [Symbol.iterator](): Iterator<{ retained?: unknown }> { return [holder as unknown as { retained?: unknown }][Symbol.iterator](); } }; for (const target of iterable) { target.retained = context; }",
    ],
    [
      "typed Array find read",
      "const holders: Array<{ retained?: unknown }> = [holder]; holders.find(() => true)!.retained = context;",
    ],
    [
      "typed Array filter read",
      "const holders: Array<{ retained?: unknown }> = [holder]; holders.filter(() => true)[0]!.retained = context;",
    ],
    [
      "typed Array map identity return",
      "const holders: Array<{ retained?: unknown }> = [holder]; holders.map((target) => target)[0]!.retained = context;",
    ],
    [
      "typed Array reduce identity return",
      "const holders: Array<{ retained?: unknown }> = [holder]; holders.reduce((target) => target).retained = context;",
    ],
    [
      "typed Array concat inserted reference",
      "([] as Array<{ retained?: unknown }>).concat(holder)[0]!.retained = context;",
    ],
    [
      "typed Array toSpliced inserted reference",
      "const holders: Array<{ retained?: unknown }> = []; holders.toSpliced(0, 0, holder)[0]!.retained = context;",
    ],
    [
      "typed Array with inserted reference",
      "const holders: Array<{ retained?: unknown }> = [{}]; holders.with(0, holder)[0]!.retained = context;",
    ],
    [
      "typed Array reduce initial reference",
      "const holders: Array<{ retained?: unknown }> = []; holders.reduce((target) => target, holder).retained = context;",
    ],
    [
      "typed Array from mapper reference",
      "Array.from({ length: 1 }, () => holder)[0]!.retained = context;",
    ],
    [
      "typed Array prototype concat call reference",
      "Array.prototype.concat.call([], holder)[0]!.retained = context;",
    ],
    [
      "typed Promise reject call identity",
      "const target = await Promise.reject.call(Promise, holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed Promise reject apply identity",
      "const target = await Promise.reject.apply(Promise, [holder]).catch((value) => value); target.retained = context;",
    ],
    [
      "typed Promise resolve call identity",
      "const target = await Promise.resolve.call(Promise, holder); target.retained = context;",
    ],
    [
      "typed bound helper chained call return",
      "function identity(target: { retained?: unknown }): { retained?: unknown } { return target; } identity.bind(undefined, holder).call(undefined).retained = context;",
    ],
    [
      "typed bound helper chained apply return",
      "function identity(target: { retained?: unknown }): { retained?: unknown } { return target; } identity.bind(undefined, holder).apply(undefined, []).retained = context;",
    ],
    [
      "typed bind call partial parameter return",
      "function identity(target: { retained?: unknown }): { retained?: unknown } { return target; } identity.bind.call(identity, undefined, holder)().retained = context;",
    ],
    [
      "typed custom call-named method return",
      "const helpers = { call(target: { retained?: unknown }) { return target; } }; helpers.call(holder).retained = context;",
    ],
    [
      "typed custom apply-named method return",
      "const helpers = { apply(target: { retained?: unknown }) { return target; } }; helpers.apply(holder).retained = context;",
    ],
    [
      "typed custom bind-named method return",
      "const helpers = { bind(target: { retained?: unknown }) { return () => target; } }; helpers.bind(holder)().retained = context;",
    ],
    [
      "typed Promise constructor alias reject identity",
      "const PromiseAlias = Promise; const target = await PromiseAlias.reject(holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed Array constructor alias from mapper reference",
      "const ArrayAlias = Array; ArrayAlias.from({ length: 1 }, () => holder)[0]!.retained = context;",
    ],
    [
      "typed Array constructor alias reference",
      "const ArrayAlias = Array; new ArrayAlias(holder)[0]!.retained = context;",
    ],
    [
      "typed comma Array constructor reference",
      "new (0, Array)(holder)[0]!.retained = context;",
    ],
    [
      "typed Map constructor alias reference",
      "const MapAlias = Map; new MapAlias([[\"holder\", holder]]).get(\"holder\")!.retained = context;",
    ],
    [
      "typed Set constructor alias reference",
      "const SetAlias = Set; const [target] = new SetAlias([holder]); target!.retained = context;",
    ],
    [
      "typed WeakMap constructor alias reference",
      "const WeakMapAlias = WeakMap; new WeakMapAlias([[holder, holder]]).get(holder)!.retained = context;",
    ],
    [
      "typed WeakSet constructor alias reference",
      "const WeakSetAlias = WeakSet; const bag = new WeakSetAlias([holder]); (bag as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed destructured Promise constructor resolution",
      "const { Promise: PromiseAlias } = { Promise }; const target = await new PromiseAlias((resolve) => resolve(holder)); (target as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed nested object-destructured Promise constructor resolution",
      "const { bag: { Promise: PromiseAlias } } = { bag: { Promise } }; const target = await new PromiseAlias((resolve) => resolve(holder)); (target as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed nested array-destructured Map constructor reference",
      "const [{ Map: MapAlias }] = [{ Map }]; new MapAlias([[\"holder\", holder]]).get(\"holder\")!.retained = context;",
    ],
    [
      "typed bound Promise constructor resolution",
      "const PromiseAlias = Promise.bind(null); const target = await new PromiseAlias((resolve) => resolve(holder)); (target as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed bind-call WeakSet constructor reference",
      "const WeakSetAlias = WeakSet.bind.call(WeakSet, null); const bag = new WeakSetAlias([holder]); (bag as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed nested object-destructured Promise reject identity",
      "const { bag: { reject } } = { bag: Promise }; const target = await reject(holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed nested array-destructured Promise reject identity",
      "const [{ reject }] = [Promise]; const target = await reject(holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed assignment-destructured Promise constructor resolution",
      "let PromiseAlias: PromiseConstructor; ({ Promise: PromiseAlias } = { Promise }); const target = await new PromiseAlias((resolve) => resolve(holder)); (target as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed parameter-destructured Promise constructor resolution",
      "function retain({ Promise: PromiseAlias }: { Promise: PromiseConstructor }) { return new PromiseAlias((resolve) => resolve(holder)); } const target = await retain({ Promise }); (target as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed destructured Promise reject identity",
      "const { reject } = Promise; const target = await reject(holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed object-field Promise reject identity",
      "const methods = { reject: Promise.reject }; const target = await methods.reject(holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed comma Array from mapper reference",
      "(0, Array.from)({ length: 1 }, () => holder)[0]!.retained = context;",
    ],
    [
      "typed comma Promise reject identity",
      "const target = await (0, Promise.reject)(holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed Promise constructor alias reject call identity",
      "const PromiseAlias = Promise; const target = await PromiseAlias.reject.call(PromiseAlias, holder).catch((value) => value); target.retained = context;",
    ],
    [
      "typed nested apply call container insertion",
      "Array.prototype.concat.apply.call(Array.prototype.concat, [], [holder])[0]!.retained = context;",
    ],
    [
      "typed apply array-like container insertion",
      "Array.prototype.concat.apply([], { 0: holder, length: 1 })[0]!.retained = context;",
    ],
    [
      "typed Promise executor resolution",
      "const target = await new Promise((resolve) => { resolve(holder); }); (target as unknown as { retained?: unknown }).retained = context;",
    ],
    [
      "typed custom iterable getter",
      "const iterable = { get [Symbol.iterator]() { return () => [holder as unknown as { retained?: unknown }][Symbol.iterator](); } }; for (const target of iterable) { target.retained = context; }",
    ],
    [
      "typed custom iterable aliased key",
      "const iteratorKey = Symbol.iterator; const iterable = { [iteratorKey]: () => [holder as unknown as { retained?: unknown }][Symbol.iterator]() }; for (const target of iterable) { target.retained = context; }",
    ],
    [
      "typed Array aliased Symbol iterator",
      "const iteratorKey = Symbol.iterator; const target = [holder as unknown as { retained?: unknown }][iteratorKey]().next().value!; target.retained = context;",
    ],
    [
      "typed destructured Promise then call callback",
      "const promise = Promise.resolve(holder as unknown as { retained?: unknown }); const { then: aliasedThen } = promise; await aliasedThen.call(promise, (target) => { target.retained = context; });",
    ],
    [
      "typed try catch thrown reference",
      "try { throw holder; } catch (target) { (target as unknown as { retained?: unknown }).retained = context; }",
    ],
  ])("rejects type-erased imported callable retention through a %s", async (
    _name,
    statement,
  ) => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { holder } from "./src/holder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        async build(context) { ${statement} },
      });
    `, {
      "src/holder.ts": "export function holder(): void {}",
    });
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 30_000);

  it("rejects type-erased same-file module callable retention", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      function holder(): void {}
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const bag: { fn: { retained?: unknown } } = { fn: holder };
          bag.fn.retained = context;
        },
      });
    `);
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);

  it("rejects a type-erased module reference returned by a helper", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      function holder(): { retained?: unknown } {
        return holder as unknown as { retained?: unknown };
      }
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) { holder().retained = context; },
      });
    `);
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);

  it("rejects type-erased imported Babylon reference retention", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const bag: { owner: { retained?: unknown } } = { owner: MeshBuilder };
          bag.owner.retained = context;
        },
      });
    `);
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);

  it("allows imported pure callables to be invoked without retained mutation", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { holder } from "./src/holder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() {
          const alias = holder;
          const bag = { fn: holder };
          alias();
          bag.fn();
        },
      });
    `, {
      "src/holder.ts": "export function holder(): void {}",
    });
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows visual objects returned by imported Babylon factories to be configured", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const mesh = MeshBuilder.CreateBox("box", {}, context.scene);
          mesh.position.x = 1;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows a helper with a callable argument to return and configure a new visual object", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
      function marker(): void {}
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          function makeBox(_marker: typeof marker) {
            return MeshBuilder.CreateBox("box", {}, context.scene);
          }
          const mesh = makeBox(marker);
          mesh.position.x = 1;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows a tagged helper with a callable substitution to return a new visual object", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
      function marker(): void {}
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          function makeBox(
            _parts: TemplateStringsArray,
            _marker: typeof marker,
          ) {
            return MeshBuilder.CreateBox("box", {}, context.scene);
          }
          const mesh = makeBox\`\${marker}\`;
          mesh.position.x = 1;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows aliased helpers with callable inputs to return new visual objects", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
      function marker(): void {}
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          function makeBox(_marker: typeof marker) {
            return MeshBuilder.CreateBox("box", {}, context.scene);
          }
          const alias = makeBox;
          const helpers = { makeBox };
          alias(marker).position.x = 1;
          helpers.makeBox(marker).position.y = 2;
          alias.call(undefined, marker).position.z = 3;
          alias.bind(undefined, marker)().position.x = 4;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows custom call, apply, and bind-named methods that return fresh visual objects", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const helpers = {
            call() { return MeshBuilder.CreateBox("call", {}, context.scene); },
            apply() { return MeshBuilder.CreateBox("apply", {}, context.scene); },
            bind() { return () => MeshBuilder.CreateBox("bind", {}, context.scene); },
          };
          helpers.call().position.x = 1;
          helpers.apply().position.y = 2;
          helpers.bind()().position.z = 3;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows a Promise callback to replace a module reference with fresh local data", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { holder } from "./src/holder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        async build() {
          const local = await Promise.resolve(holder).then(() => ({ value: 1 }));
          local.value = 2;
        },
      });
    `, {
      "src/holder.ts": "export function holder(): void {}",
    });
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows a destructured Promise constructor to resolve fresh local data", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        async build() {
          const { Promise: PromiseAlias } = { Promise };
          const local = await new PromiseAlias<{ value: number }>((resolve) => resolve({ value: 1 }));
          local.value = 2;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows a bound Promise constructor to resolve fresh local data", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        async build() {
          const PromiseAlias = Promise.bind(null);
          const local = await new PromiseAlias<{ value: number }>((resolve) => resolve({ value: 1 }));
          local.value = 2;
        },
      });
    `);
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows a Promise rejection callback to replace a module reference with fresh local data", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { holder } from "./src/holder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        async build() {
          const local = await Promise.reject(holder).catch(() => ({ value: 1 }));
          local.value = 2;
        },
      });
    `, {
      "src/holder.ts": "export function holder(): void {}",
    });
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("allows an Array mapper to replace a module reference with fresh local data", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { holder } from "./src/holder.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() {
          const local = [holder].map(() => ({ value: 1 }));
          local[0]!.value = 2;
        },
      });
    `, {
      "src/holder.ts": "export function holder(): void {}",
    });
    expect(result.outcome).toBe("passed");
  }, 15_000);

  it("rejects Babylon's installed retained external-data factory method", async () => {
    const result = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          context.scene.getOrAddExternalDataWithFactory(
            "retained",
            undefined as never,
          );
        },
      });
    `);
    expect(result).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });
  }, 15_000);

  it("rejects destructured, dynamic, and function-object authority retention", async () => {
    const destructured = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const { getEngine } = context.scene;
          void getEngine;
        },
      });
    `);
    expect(destructured).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    const dynamic = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const key = "getEngine";
          const retained = context.scene[key];
          void retained;
        },
      });
    `);
    expect(dynamic).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    const functionObject = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      function holder(): void {}
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          (holder as typeof holder & { retained?: unknown }).retained = context;
        },
      });
    `);
    expect(functionObject).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 30_000);

  it("rejects module-load execution outside the one default definition", async () => {
    expect(await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      function runEarly(): void {}
      runEarly();
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() {},
      });
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);

  it("rejects installed-version constructor flags that skip Scene registration", async () => {
    const transformNode = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) { new TransformNode("hidden", context.scene, false); },
      });
    `);
    expect(transformNode).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    const light = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
      import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          new HemisphericLight("hidden", Vector3.Up(), context.scene, true);
        },
      });
    `);
    expect(light).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    const aliasedTransformNode = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const TransformNodeAlias = TransformNode;
          new TransformNodeAlias("hidden", context.scene, false);
        },
      });
    `);
    expect(aliasedTransformNode).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    const destructuredLight = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
      import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const { HemisphericLight: LightAlias } = { HemisphericLight };
          new LightAlias("hidden", Vector3.Up(), context.scene, true);
        },
      });
    `);
    expect(destructuredLight).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    const commaTransformNode = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) { new (0, TransformNode)("hidden", context.scene, false); },
      });
    `);
    expect(commaTransformNode).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    const boundLight = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
      import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const LightAlias = HemisphericLight.bind(null);
          new LightAlias("hidden", Vector3.Up(), context.scene, true);
        },
      });
    `);
    expect(boundLight).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });
  }, 60_000);

  it("rejects renamed, structural, and generic Babylon constructors that skip Scene registration", async () => {
    const cases = [
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make<T extends StructuralConstructor>(Alias: T) {
              return new Alias("hidden", context.scene, false);
            }
            make(TransformNode);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make(Alias: StructuralConstructor) {
              return new Alias("hidden", context.scene, false);
            }
            make(TransformNode);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
        import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
        type StructuralLight = new (
          name: string,
          direction: Vector3,
          scene: Scene,
          dontAddToScene?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make({ Alias }: { Alias: StructuralLight }) {
              return new Alias("hidden", Vector3.Up(), context.scene, true);
            }
            make({ Alias: HemisphericLight });
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        function identity(value: object): object { return value; }
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            const Alias = identity(TransformNode) as StructuralConstructor;
            new Alias("hidden", context.scene, false);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode as Hidden } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) { new Hidden("hidden", context.scene, false); },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode as Hidden } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            const Alias = Hidden;
            new Alias("hidden", context.scene, false);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { HemisphericLight as Hidden } from "@babylonjs/core/Lights/hemisphericLight.js";
        import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) { new Hidden("hidden", Vector3.Up(), context.scene, true); },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            let Alias: typeof TransformNode;
            ({ TransformNode: Alias } = { TransformNode });
            new Alias("hidden", context.scene, false);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            for (const { TransformNode: Alias } of [{ TransformNode }]) {
              new Alias("hidden", context.scene, false);
            }
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make({ TransformNode: Alias }: { TransformNode: typeof TransformNode }) {
              return new Alias("hidden", context.scene, false);
            }
            make({ TransformNode });
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => TransformNode;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            const Alias = TransformNode as StructuralConstructor;
            new Alias("hidden", context.scene, false);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make<T extends typeof TransformNode>(Alias: T) {
              return new Alias("hidden", context.scene, false);
            }
            make(TransformNode);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
        import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make<T extends typeof HemisphericLight>(Alias: T) {
              return new Alias("hidden", Vector3.Up(), context.scene, true);
            }
            make(HemisphericLight);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        function hiddenConstructor(): object { return TransformNode; }
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            const Alias = hiddenConstructor() as StructuralConstructor;
            new Alias("hidden", context.scene, false);
          },
        });
      `,
    ];
    for (const source of cases) {
      expect(await admittedCode(source)).toMatchObject({
        outcome: "rejected",
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      });
    }
  }, 120_000);

  it("rejects erased constructor parameters through local modules and call-like invocations", async () => {
    const localModule = await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
      import { make } from "./src/make.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) { make(TransformNode, context.scene); },
      });
    `, {
      "src/make.ts": `
        import type { Scene } from "@babylonjs/core/scene.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        export function make(Alias: StructuralConstructor, scene: Scene) {
          return new Alias("hidden", scene, false);
        }
      `,
    });
    expect(localModule).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    for (const invocation of [
      "make.call(undefined, TransformNode);",
      "make.apply(undefined, [TransformNode]);",
    ]) {
      expect(await admittedCode(`
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make(Alias: StructuralConstructor) {
              return new Alias("hidden", context.scene, false);
            }
            ${invocation}
          },
        });
      `)).toMatchObject({
        outcome: "rejected",
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      });
    }
  }, 45_000);

  it("rejects erased constructor provenance through rest, spread, opaque projection, and new invocation", async () => {
    const cases = [
      `
        function make(...constructors: [StructuralConstructor]) {
          const [Alias] = constructors;
          return new Alias("hidden", context.scene, false);
        }
        make(TransformNode);
      `,
      `
        function make(Alias: StructuralConstructor) {
          return new Alias("hidden", context.scene, false);
        }
        const constructors: [StructuralConstructor] = [TransformNode];
        make(...constructors);
      `,
      `
        function identity(value: object): object { return value; }
        function make({ Alias }: { Alias: StructuralConstructor }) {
          return new Alias("hidden", context.scene, false);
        }
        make(identity({ Alias: TransformNode }) as { Alias: StructuralConstructor });
      `,
      `
        const Wrapper = function(Alias: StructuralConstructor) {
          return new Alias("hidden", context.scene, false);
        } as unknown as new (Alias: StructuralConstructor) => object;
        new Wrapper(TransformNode);
      `,
      `
        function make(...lights: [StructuralLight]) {
          const [Alias] = lights;
          return new Alias("hidden", Vector3.Up(), context.scene, true);
        }
        make(HemisphericLight);
      `,
      `
        function bag(): { Alias: StructuralConstructor } {
          return { Alias: TransformNode };
        }
        function make({ Alias }: { Alias: StructuralConstructor }) {
          return new Alias("hidden", context.scene, false);
        }
        make(bag());
      `,
    ];
    for (const statement of cases) {
      expect(await admittedCode(`
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
        import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        type StructuralLight = new (
          name: string,
          direction: Vector3,
          scene: Scene,
          dontAddToScene?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) { ${statement} },
        });
      `)).toMatchObject({
        outcome: "rejected",
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      });
    }
  }, 60_000);

  it("rejects bound, defaulted, implicit, and getter constructor provenance", async () => {
    const cases = [
      {
        statement: `
        function make(Alias: StructuralConstructor) {
          return new Alias("hidden", context.scene, false);
        }
        const Bound = make.bind(undefined, TransformNode);
        new Bound();
      `,
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      },
      {
        statement: `
        function make(
          { Alias = TransformNode }: { Alias?: StructuralConstructor } = {},
        ) {
          return new Alias("hidden", context.scene, false);
        }
        make();
      `,
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      },
      {
        statement: `
        function make() {
          const Alias = arguments[0] as StructuralConstructor;
          return new Alias("hidden", context.scene, false);
        }
        make(TransformNode);
      `,
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
      },
      {
        statement: `
        const bag: { readonly Alias: StructuralConstructor } = {
          get Alias(): StructuralConstructor { return TransformNode; },
        };
        new bag.Alias("hidden", context.scene, false);
      `,
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      },
    ];
    for (const { statement, code } of cases) {
      expect(await admittedCode(`
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) { ${statement} },
        });
      `)).toMatchObject({
        outcome: "rejected",
        code,
      });
    }
  }, 45_000);

  it("rejects returned binds, assignment defaults, and spread registration flags", async () => {
    const cases = [
      `
        function make(Alias: StructuralConstructor) {
          return new Alias("hidden", context.scene, false);
        }
        function wrap() { return make.bind(undefined, TransformNode); }
        new (wrap())();
      `,
      `
        function make(Alias: StructuralConstructor) {
          return new Alias("hidden", context.scene, false);
        }
        const bag = { get Bound() { return make.bind(undefined, TransformNode); } };
        bag.Bound();
      `,
      `
        let Alias: StructuralConstructor | undefined;
        ({ Alias = TransformNode } = {});
        new Alias!("hidden", context.scene, false);
      `,
      `
        const args = ["hidden", context.scene, false] as const;
        new TransformNode(...args);
      `,
      `
        const args = ["hidden", Vector3.Up(), context.scene, true] as const;
        new HemisphericLight(...args);
      `,
    ];
    for (const statement of cases) {
      expect(await admittedCode(`
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import type { Scene } from "@babylonjs/core/scene.js";
        import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
        import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        type StructuralConstructor = new (
          name: string,
          scene: Scene,
          isPure?: boolean,
        ) => unknown;
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) { ${statement} },
        });
      `)).toMatchObject({
        outcome: "rejected",
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      });
    }
  }, 60_000);

  it("rejects type-erased and union Babylon constructors that skip Scene registration", async () => {
    const cases = [
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        function hiddenConstructor(): unknown { return TransformNode; }
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            const Alias = hiddenConstructor() as typeof TransformNode;
            new Alias("hidden", context.scene, false);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            function make(Alias?: typeof TransformNode) {
              return new Alias!("hidden", context.scene, false);
            }
            make(TransformNode);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            let Alias: typeof TransformNode | undefined;
            for (const candidate of [TransformNode]) {
              Alias = candidate;
              break;
            }
            new Alias!("hidden", context.scene, false);
          },
        });
      `,
      `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "native-source-test",
          build(context) {
            let Alias: typeof TransformNode | undefined;
            if (context.scene) Alias = TransformNode;
            new Alias!("hidden", context.scene, false);
          },
        });
      `,
    ];
    for (const source of cases) {
      expect(await admittedCode(source)).toMatchObject({
        outcome: "rejected",
        code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
      });
    }
  }, 60_000);

  it("allows frozen literal values to configure fresh Babylon visuals", async () => {
    expect((await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
      const NAMES = Object.freeze({ root: "ridge-root" });
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const root = new TransformNode(NAMES.root, context.scene);
          root.position.x = 1;
        },
      });
    `)).outcome).toBe("passed");

    expect((await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { Color3 } from "@babylonjs/core/Maths/math.color.js";
      import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
      const PALETTE = Object.freeze({ r: 0.2, g: 0.4, b: 0.6 });
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const material = new StandardMaterial("ridge", context.scene);
          const color = new Color3(PALETTE.r, PALETTE.g, PALETTE.b);
          material.diffuseColor = color;
        },
      });
    `)).outcome).toBe("passed");
  }, 30_000);

  it("allows an ordinary local constructor to receive a false third argument", async () => {
    expect((await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import type { Scene } from "@babylonjs/core/scene.js";
      type LocalConstructor = new (
        name: string,
        scene: Scene,
        flag: boolean,
      ) => object;
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const Local = function(_name: string, _scene: Scene, _flag: boolean) {
            return {};
          } as unknown as LocalConstructor;
          void new Local("local", context.scene, false);
        },
      });
    `)).outcome).toBe("passed");
  }, 15_000);

  it("allows statically expanded registration-preserving Babylon flags", async () => {
    expect((await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
      import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
      import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const nodeArgs = ["root", context.scene, true] as const;
          const lightArgs = ["sun", Vector3.Up(), context.scene, false] as const;
          new TransformNode(...nodeArgs);
          new HemisphericLight(...lightArgs);
        },
      });
    `)).outcome).toBe("passed");
  }, 15_000);

  it("uses the dedicated build-return diagnostic for a value returned by build", async () => {
    expect(await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() { return 1; },
      });
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_BUILD_RETURN_INVALID",
    });
  }, 15_000);

  it("rejects user classes and runtime exports while allowing local loop variables and frozen tables", async () => {
    expect(await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      class HiddenController {}
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() { void HiddenController; },
      });
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN",
    });

    expect(await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export const extra = 1;
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() {},
      });
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_RUNTIME_EXPORT_INVALID",
    });

    expect((await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      const TABLE = Object.freeze([1, 2, 3] as const);
      function sum(): number {
        let total = 0;
        for (const value of TABLE) total += value;
        return total;
      }
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() { const value = sum(); void value; },
      });
    `)).outcome).toBe("passed");
  }, 30_000);

  it("rejects a shallow-frozen nested module table", async () => {
    expect(await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      const TABLE = Object.freeze({ nested: {} });
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) { (TABLE.nested as { retained?: unknown }).retained = context; },
      });
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);

  it("admits a recursively frozen nested module table", async () => {
    expect((await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      const TABLE = Object.freeze({
        nested: Object.freeze({ values: Object.freeze([1, 2, 3] as const) }),
      });
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build() { void TABLE.nested.values[0]; },
      });
    `)).outcome).toBe("passed");
  }, 15_000);

  it("rejects writes through a recursively frozen nested module table", async () => {
    expect(await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      const TABLE = Object.freeze({
        nested: Object.freeze({ values: Object.freeze([1, 2, 3] as const) }),
      });
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          (TABLE.nested as { retained?: unknown }).retained = context;
        },
      });
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);

  it("rejects type-erased aliases of recursively frozen nested module tables", async () => {
    expect(await admittedCode(`
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      const TABLE = Object.freeze({ nested: Object.freeze({ value: 1 }) });
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: "native-source-test",
        build(context) {
          const alias: { retained?: unknown } = TABLE.nested;
          alias.retained = context;
        },
      });
    `)).toMatchObject({
      outcome: "rejected",
      code: "WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN",
    });
  }, 15_000);
});
