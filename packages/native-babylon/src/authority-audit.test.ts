import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { Buffer } from "@babylonjs/core/Buffers/buffer.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { parseBabylonNativeSceneBootstrapV1 } from
  "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

import {
  defineBabylonNativeScene,
  type BabylonNativeLockedAssetResolverV1,
} from "./index.js";
import {
  admitBabylonNativeSceneCandidateV1,
  type BabylonNativeSceneCandidateAdmissionResultV1,
} from "./host.js";
import {
  BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1,
  BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1,
  BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1,
  BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1,
  BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_SETTER_KEYS_V1,
  BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1,
  BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1,
  BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1,
  BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1,
  BABYLON_NATIVE_FORBIDDEN_SCENE_INPUT_CAMERA_METHOD_KEYS_V1,
  BABYLON_NATIVE_FORBIDDEN_SCENE_PHYSICS_METHOD_KEYS_V1,
} from "./authority-audit.js";
import {
  BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
} from "./import-profile.js";

const retainedEngines: NullEngine[] = [];

const BOOTSTRAP = parseBabylonNativeSceneBootstrapV1({
  kind: "babylon-native-scene-bootstrap",
  schemaVersion: 1,
  id: "authority-audit-native",
  sceneModuleRef: "worldkit://native-scene/authority-audit@1",
  nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
  nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.standard@1",
  gameplayBootstrapRef: "worldkit://gameplay-bootstrap/g-bot@1",
  initialControlledEntityId: "player",
  gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
  initialCamera: {
    mode: "third-person",
    pitchRadians: 0.1,
    distanceMeters: 5,
    fovDegrees: 55,
    targetHeightMeters: 1.2,
  },
  seed: 20260829,
  spawnMarkerId: "player-spawn",
});

const ASSETS: BabylonNativeLockedAssetResolverV1 = Object.freeze({
  async resolve() {
    throw new Error("No asset is selected by this audit test.");
  },
});

function createCandidate(): Readonly<{ engine: NullEngine; scene: Scene }> {
  const engine = new NullEngine({
    renderWidth: 320,
    renderHeight: 180,
    textureSize: 128,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  retainedEngines.push(engine);
  return Object.freeze({ engine, scene: new Scene(engine) });
}

function errorCode(
  result: BabylonNativeSceneCandidateAdmissionResultV1,
): string | undefined {
  return result.outcome === "passed"
    ? undefined
    : result.diagnostics.find(({ severity }) => severity === "error")?.code;
}

async function admit(
  candidate: Readonly<{ engine: NullEngine; scene: Scene }>,
  build: Parameters<typeof defineBabylonNativeScene>[0]["build"],
): Promise<BabylonNativeSceneCandidateAdmissionResultV1> {
  return admitBabylonNativeSceneCandidateV1({
    candidate,
    bootstrap: BOOTSTRAP,
    module: defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "authority-audit-test",
      build,
    }),
    assets: ASSETS,
    budget: {
      maximumStaticColliderCount: 8,
      maximumStaticColliderVertexCount: 512,
      maximumStaticColliderTriangleCount: 256,
    },
  });
}

function registerSpawn(
  context: Parameters<Parameters<typeof defineBabylonNativeScene>[0]["build"]>[0],
): void {
  context.registration.registerSpawnMarker({
    id: "player-spawn",
    positionMetersXYZ: [0, 1, 0],
    facingRadians: 0,
  });
}

describe("installed Babylon runtime-kind authority audit", () => {
  it("uses the AbstractMesh callback surface for an InstancedMesh added by Babylon", async () => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      const source = MeshBuilder.CreateBox(
        "instance-source",
        { size: 1 },
        candidate.scene,
      );
      source.createInstance("installed-instance");
      registerSpawn(context);
    });

    expect(result.outcome).toBe("passed");
  });
});

function invokeObservableControl(
  observable: Record<string, unknown>,
  key: string,
  ...args: readonly unknown[]
): unknown {
  const method = observable[key];
  if (typeof method !== "function") {
    throw new TypeError(`Observable control '${key}' is unavailable.`);
  }
  return Reflect.apply(method, observable, args);
}

function createAuthorityProfileProgram(): Readonly<{
  checker: ts.TypeChecker;
  profileSource: ts.SourceFile;
  program: ts.Program;
}> {
  const fixturePath = fileURLToPath(
    new URL("__authority-profile.fixture.ts", import.meta.url),
  );
  const source = `
    import { Buffer } from "@babylonjs/core/Buffers/buffer.js";
    import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
    import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
    import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
    import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
    import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
    import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
    import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
    import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
    import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
    import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
    import { Scene } from "@babylonjs/core/scene.js";

    export type SceneInstance = Scene;
    export type EngineInstance = ReturnType<Scene["getEngine"]>;
    export type NodeInstance = TransformNode;
    export type TransformNodeInstance = TransformNode;
    export type AbstractMeshInstance = Mesh;
    export type MeshInstance = Mesh;
    export type MaterialInstance = StandardMaterial;
    export type StandardMaterialInstance = StandardMaterial;
    export type GeometryInstance = Scene["geometries"][number];
    export type BufferInstance = Buffer;
    export type HemisphericLightInstance = HemisphericLight;
    export type DirectionalLightInstance = DirectionalLight;
    export type PointLightInstance = PointLight;
    export type ImageProcessingConfigurationInstance =
      Scene["imageProcessingConfiguration"];
    export type PostProcessManagerInstance = Scene["postProcessManager"];
    export type ProfileValueWitness =
      | Color3 | Color4 | Vector2 | Vector3 | VertexData | typeof MeshBuilder;
    export type StandardMaterialConstructor = typeof StandardMaterial;
  `;
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) =>
    fileName === fixturePath || originalFileExists(fileName);
  host.readFile = (fileName) =>
    fileName === fixturePath ? source : originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion) =>
    fileName === fixturePath
      ? ts.createSourceFile(
          fixturePath,
          source,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : originalGetSourceFile(fileName, languageVersion);
  const program = ts.createProgram({ rootNames: [fixturePath], options, host });
  return Object.freeze({
    checker: program.getTypeChecker(),
    profileSource: program.getSourceFile(fixturePath)!,
    program,
  });
}

function profileType(
  checker: ts.TypeChecker,
  profileSource: ts.SourceFile,
  aliasName: string,
): ts.Type {
  const alias = profileSource.statements.find((statement) =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === aliasName
  );
  if (typeof alias === "undefined" || !ts.isTypeAliasDeclaration(alias)) {
    throw new TypeError(`Missing authority profile alias '${aliasName}'.`);
  }
  return checker.getTypeFromTypeNode(alias.type);
}

afterEach(() => {
  while (retainedEngines.length > 0) retainedEngines.pop()?.dispose();
});

describe("Babylon Native Candidate authority precondition", () => {
  it("accepts the two single Engine observers installed by Babylon browser input", async () => {
    const candidate = createCandidate();
    candidate.engine.onEndFrameObservable.add(() => undefined);
    candidate.engine.onDisposeObservable.add(() => undefined);

    const result = await admit(candidate, registerSpawn);

    expect(result.outcome).toBe("passed");
  });

  it("rejects an additional observer on a Babylon provider-owned Engine surface", async () => {
    const candidate = createCandidate();
    candidate.engine.onEndFrameObservable.add(() => undefined);
    candidate.engine.onEndFrameObservable.add(() => undefined);
    let buildCalled = false;

    const result = await admit(candidate, () => {
      buildCalled = true;
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_PRECONDITION_INVALID",
    );
    expect(buildCalled).toBe(false);
  });

  it.each([
    ["disposed Scene", (candidate: ReturnType<typeof createCandidate>) => candidate.scene.dispose()],
    ["disposed Engine", (candidate: ReturnType<typeof createCandidate>) => candidate.engine.dispose()],
    ["active camera", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.activeCamera = new FreeCamera("camera", Vector3.Zero(), candidate.scene);
    }],
    ["active camera list", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.activeCameras = [new FreeCamera("camera", Vector3.Zero(), candidate.scene)];
    }],
    ["Scene action manager", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.actionManager = new ActionManager(candidate.scene);
    }],
    ["Scene action-manager collection", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.actionManagers.push(new ActionManager(candidate.scene));
    }],
    ["Mesh action manager", (candidate: ReturnType<typeof createCandidate>) => {
      MeshBuilder.CreateBox("mesh", { size: 1 }, candidate.scene).actionManager =
        new ActionManager(candidate.scene);
    }],
    ["preexisting observer", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.onBeforeRenderObservable.add(() => undefined);
    }],
    ["unexpected Scene identity", (candidate: ReturnType<typeof createCandidate>) => {
      new Scene(candidate.engine);
    }],
  ] as const)("rejects %s before exposing Registration", async (_label, mutate) => {
    const candidate = createCandidate();
    mutate(candidate);
    let buildCalled = false;
    const result = await admit(candidate, () => {
      buildCalled = true;
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_PRECONDITION_INVALID",
    );
    expect(buildCalled).toBe(false);
  });

  it("rejects a mismatched Candidate Engine before Build", async () => {
    const candidate = createCandidate();
    const other = createCandidate();
    let buildCalled = false;
    const result = await admit(
      { scene: candidate.scene, engine: other.engine },
      () => {
        buildCalled = true;
      },
    );

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_PRECONDITION_INVALID",
    );
    expect(buildCalled).toBe(false);
  });

  it("rejects public physics-enabled state before Build", async () => {
    const candidate = createCandidate();
    Object.defineProperty(candidate.scene, "isPhysicsEnabled", {
      configurable: true,
      value: () => true,
    });
    let buildCalled = false;
    const result = await admit(candidate, () => {
      buildCalled = true;
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_PRECONDITION_INVALID",
    );
    expect(buildCalled).toBe(false);
  });
});

describe("Babylon Native Candidate post-Build authority audit", () => {
  it.each([
    ["active camera", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.activeCamera = new FreeCamera(
        "module-camera",
        Vector3.Zero(),
        candidate.scene,
      );
    }],
    ["Scene Observable", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.onBeforeRenderObservable.add(() => undefined);
    }],
    ["Scene direct callback", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.customRenderFunction = () => undefined;
    }],
    ["Scene retained method", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.registerBeforeRender(() => undefined);
    }],
    ["Engine animation frame owner", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.engine.customAnimationFrameRequester = {
        requestAnimationFrame: () => 1,
      } as never;
    }],
    ["Mesh ActionManager", (candidate: ReturnType<typeof createCandidate>) => {
      MeshBuilder.CreateBox("owned-mesh", { size: 1 }, candidate.scene)
        .actionManager = new ActionManager(candidate.scene);
    }],
    ["Scene disposal", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.dispose();
    }],
  ] as const)("rejects %s mutation", async (_label, mutate) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      registerSpawn(context);
      mutate(candidate);
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it("allows visual-only Scene state and supported Babylon objects", async () => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      candidate.scene.clearColor = new Color4(0.1, 0.2, 0.3, 1);
      candidate.scene.fogEnabled = true;
      candidate.scene.fogColor = new Color3(0.2, 0.3, 0.4);
      const root = new TransformNode("root", candidate.scene);
      const mesh = MeshBuilder.CreateBox("visual", { size: 1 }, candidate.scene);
      mesh.parent = root;
      mesh.material = new StandardMaterial("material", candidate.scene);
      new HemisphericLight("light", Vector3.Up(), candidate.scene);
      new Geometry("geometry", candidate.scene);
      registerSpawn(context);
    });

    expect(result.outcome, JSON.stringify(result)).toBe("passed");
  });

  it.each([
    ["Observable add", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.onBeforeRenderObservable.add(() => undefined);
    }],
    ["direct callback assignment", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.customRenderFunction = () => undefined;
    }],
    ["retained Scene method", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.executeWhenReady(() => undefined);
    }],
    ["active camera list", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.activeCameras = [];
    }],
    ["Scene ActionManager", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.actionManager = new ActionManager(candidate.scene);
    }],
    ["Engine render loop", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.engine.runRenderLoop(() => undefined);
    }],
    ["Engine animation frame owner", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.engine.customAnimationFrameRequester = {
        requestAnimationFrame: () => 1,
      } as never;
    }],
    ["Scene lifecycle", (candidate: ReturnType<typeof createCandidate>) => {
      candidate.scene.dispose();
    }],
  ] as const)("retains a caught instrumentation failure (%s)", async (_label, mutate) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      try {
        mutate(candidate);
      } catch {
        // Module code cannot erase a Host authority violation.
      }
      registerSpawn(context);
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it("preserves and sorts both Build and authority diagnostics", async () => {
    const candidate = createCandidate();
    const result = await admit(candidate, () => {
      candidate.scene.executeWhenReady(() => undefined);
    });

    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") return;
    expect(result.diagnostics.map(({ stage, code }) => [stage, code])).toEqual([
      ["authority-audit", "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN"],
      ["build", "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED"],
    ]);
  });

  it.each(["passed", "authority-rejected", "build-rejected"] as const)(
    "restores every Host instrumentation descriptor after %s admission",
    async (mode) => {
      const candidate = createCandidate();
      const sceneRecord = candidate.scene as unknown as Record<string, unknown>;
      const engineRecord = candidate.engine as unknown as Record<string, unknown>;
      const materialConstructor = Object.getPrototypeOf(StandardMaterial) as
        Record<string, unknown>;
      const descriptorTargets = [
        [sceneRecord, "addMesh"],
        [sceneRecord, "addMaterial"],
        [sceneRecord, "customRenderFunction"],
        [sceneRecord, "activeCamera"],
        [sceneRecord, "cameras"],
        [engineRecord, "runRenderLoop"],
        [engineRecord, "customAnimationFrameRequester"],
        [candidate.scene.onBeforeRenderObservable as unknown as Record<string, unknown>, "add"],
        [candidate.scene.onBeforeRenderObservable as unknown as Record<string, unknown>, "notifyIfTriggered"],
        [candidate.scene.onBeforeRenderObservable.observers as unknown as Record<string, unknown>, "push"],
        [materialConstructor.OnEventObservable as Record<string, unknown>, "add"],
        [candidate.scene.imageProcessingConfiguration.onUpdateParameters as unknown as Record<string, unknown>, "add"],
        [candidate.scene.postProcessManager.onBeforeRenderObservable as unknown as Record<string, unknown>, "add"],
      ] as const;
      const before = descriptorTargets.map(([owner, key]) =>
        Object.getOwnPropertyDescriptor(owner, key)
      );
      let createdMesh: ReturnType<typeof MeshBuilder.CreateBox> | undefined;
      const result = await admit(candidate, (context) => {
        createdMesh = MeshBuilder.CreateBox("restored-mesh", { size: 1 }, candidate.scene);
        if (mode === "authority-rejected") {
          try {
            candidate.scene.registerBeforeRender(() => undefined);
          } catch {
            // Probe restoration must not depend on a successful Build.
          }
        }
        registerSpawn(context);
        if (mode === "build-rejected") throw new Error("expected Build failure");
      });
      expect(result.outcome).toBe(mode === "passed" ? "passed" : "rejected");
      expect(descriptorTargets.map(([owner, key]) =>
        Object.getOwnPropertyDescriptor(owner, key)
      )).toEqual(before);
      expect(createdMesh).toBeDefined();
      if (typeof createdMesh !== "undefined") {
        expect(Object.hasOwn(createdMesh, "registerBeforeRender")).toBe(false);
        expect(Object.hasOwn(createdMesh, "dispose")).toBe(false);
        expect(Object.getOwnPropertyDescriptor(createdMesh, "actionManager"))
          .toEqual({
            configurable: true,
            enumerable: true,
            value: null,
            writable: true,
          });
        expect(Object.hasOwn(createdMesh, "physicsBody")).toBe(false);
      }
    },
  );

  it.each([
    ["TransformNode direct callback", (scene: Scene) => {
      new TransformNode("callback-transform", scene).customMarkAsDirty =
        () => undefined;
    }],
    ["Mesh Observable", (scene: Scene) => {
      MeshBuilder.CreateBox("callback-mesh", { size: 1 }, scene)
        .onBeforeRenderObservable.add(() => undefined);
    }],
    ["Mesh callback setter", (scene: Scene) => {
      MeshBuilder.CreateBox("callback-mesh", { size: 1 }, scene).onBeforeDraw =
        () => undefined;
    }],
    ["Mesh direct callback", (scene: Scene) => {
      MeshBuilder.CreateBox("callback-mesh", { size: 1 }, scene)
        .onLODLevelSelection = () => undefined;
    }],
    ["Mesh retained render callback", (scene: Scene) => {
      MeshBuilder.CreateBox("callback-mesh", { size: 1 }, scene)
        .registerBeforeRender(() => undefined);
    }],
    ["Node Behavior", (scene: Scene) => {
      MeshBuilder.CreateBox("behavior-mesh", { size: 1 }, scene).addBehavior({
        name: "module-behavior",
        attachedNode: null,
        init() {},
        attach() {},
        detach() {},
      });
    }],
    ["StandardMaterial direct callback", (scene: Scene) => {
      new StandardMaterial("callback-material", scene).onCompiled =
        () => undefined;
    }],
    ["StandardMaterial provider callback replacement", (scene: Scene) => {
      new StandardMaterial("callback-material", scene)
        .getRenderTargetTextures = () => null as never;
    }],
    ["Light inherited callback", (scene: Scene) => {
      new HemisphericLight("callback-light", Vector3.Up(), scene).onReady =
        () => undefined;
    }],
    ["Geometry direct callback", (scene: Scene) => {
      const mesh = MeshBuilder.CreateBox(
        "callback-geometry-mesh",
        { size: 1 },
        scene,
      );
      new Geometry(
        "callback-geometry",
        scene,
        undefined,
        false,
        mesh,
      ).onGeometryUpdated = () => undefined;
    }],
  ] as const)("rejects a caught created-object callback (%s)", async (_label, mutate) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      try {
        mutate(candidate.scene);
      } catch {
        // Constructor-time probes retain the violation before Module receives it.
      }
      registerSpawn(context);
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it("rejects a created-object direct callback replaced through defineProperty", async () => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      const mesh = MeshBuilder.CreateBox(
        "callback-bypass",
        { size: 1 },
        candidate.scene,
      );
      Object.defineProperty(mesh, "onLODLevelSelection", {
        configurable: true,
        value: () => undefined,
        writable: true,
      });
      registerSpawn(context);
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it.each(BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1)(
    "rejects every Scene callback property (%s)",
    async (key) => {
      const candidate = createCandidate();
      const result = await admit(candidate, (context) => {
        try {
          (candidate.scene as unknown as Record<string, unknown>)[key] =
            () => undefined;
        } catch {
          // The Host retains the callback replacement attempt.
        }
        registerSpawn(context);
      });
      expect(errorCode(result)).toBe(
        "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
      );
    },
  );

  it.each(BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_SETTER_KEYS_V1)(
    "rejects every Scene callback setter (%s)",
    async (key) => {
      const candidate = createCandidate();
      const result = await admit(candidate, (context) => {
        try {
          (candidate.scene as unknown as Record<string, unknown>)[key] =
            () => undefined;
        } catch {
          // The Host retains the callback setter attempt.
        }
        registerSpawn(context);
      });
      expect(errorCode(result)).toBe(
        "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
      );
    },
  );

  it("rejects a Scene callback setter replaced through defineProperty", async () => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      Object.defineProperty(candidate.scene, "beforeRender", {
        configurable: true,
        value: () => undefined,
        writable: true,
      });
      registerSpawn(context);
    });
    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it.each([
    ["camera collection push/pop", (scene: Scene) => {
      const cameras = scene.cameras as unknown[];
      cameras.push({});
      cameras.pop();
    }],
    ["action-manager collection push/pop", (scene: Scene) => {
      const actionManagers = scene.actionManagers as unknown[];
      actionManagers.push({});
      actionManagers.pop();
    }],
    ["Mesh ActionManager set/reset", (scene: Scene) => {
      const mesh = MeshBuilder.CreateBox("action-reset", { size: 1 }, scene);
      mesh.actionManager = new ActionManager(scene);
      mesh.actionManager = null;
    }],
    ["Mesh PhysicsBody set/reset", (scene: Scene) => {
      const mesh = MeshBuilder.CreateBox("physics-reset", { size: 1 }, scene);
      (mesh as unknown as Record<string, unknown>).physicsBody = {};
      (mesh as unknown as Record<string, unknown>).physicsBody = undefined;
    }],
  ] as const)("retains transient authority mutation (%s)", async (_label, mutate) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      try {
        mutate(candidate.scene);
      } catch {
        // A caught Host probe still rejects the Candidate.
      }
      registerSpawn(context);
    });
    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it.each([
    ...BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1.map((key) =>
      ["Scene", key] as const
    ),
    ...BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1.map((key) =>
      ["Engine", key] as const
    ),
  ])("rejects installation of declared lazy %s authority (%s)", async (owner, key) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      try {
        const record = (owner === "Scene" ? candidate.scene : candidate.engine) as
          unknown as Record<string, unknown>;
        record[key] = {};
      } catch {
        // The Profile declares the key, but this runtime does not install it.
      }
      registerSpawn(context);
    });
    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it.each(BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1)(
    "rejects every retained Scene method (%s)",
    async (key) => {
      const candidate = createCandidate();
      const result = await admit(candidate, (context) => {
        try {
          const method = (candidate.scene as unknown as
            Record<string, (...args: readonly unknown[]) => unknown>)[key];
          method?.(() => undefined);
        } catch {
          // The Host retains the retained method call.
        }
        registerSpawn(context);
      });
      expect(errorCode(result)).toBe(
        "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
      );
    },
  );

  it.each(BABYLON_NATIVE_FORBIDDEN_SCENE_PHYSICS_METHOD_KEYS_V1)(
    "rejects every Scene physics ownership method (%s)",
    async (key) => {
      const candidate = createCandidate();
      const result = await admit(candidate, (context) => {
        try {
          const sceneRecord = candidate.scene as unknown as
            Record<string, unknown>;
          if (typeof sceneRecord[key] !== "function") {
            sceneRecord[key] = () => undefined;
          }
          (sceneRecord[key] as (...args: readonly unknown[]) => unknown)();
        } catch {
          // The Host retains the physics ownership attempt.
        }
        registerSpawn(context);
      });
      expect(errorCode(result)).toBe(
        "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
      );
    },
  );

  it.each(BABYLON_NATIVE_FORBIDDEN_SCENE_INPUT_CAMERA_METHOD_KEYS_V1)(
    "rejects every Scene input/camera ownership method (%s)",
    async (key) => {
      const candidate = createCandidate();
      const result = await admit(candidate, (context) => {
        try {
          const method = (candidate.scene as unknown as
            Record<string, (...args: readonly unknown[]) => unknown>)[key];
          method?.();
        } catch {
          // The Host retains the input/camera ownership attempt.
        }
        registerSpawn(context);
      });
      expect(errorCode(result)).toBe(
        "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
      );
    },
  );

  it("rejects Material static callback ownership", async () => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      const materialConstructor = Object.getPrototypeOf(StandardMaterial) as
        Record<string, { add(callback: () => void): unknown } | undefined>;
      const materialEventObservable = materialConstructor.OnEventObservable;
      if (typeof materialEventObservable === "undefined") {
        throw new TypeError("Material.OnEventObservable is unavailable.");
      }
      try {
        materialEventObservable.add(() => undefined);
      } catch {
        // Static provider authority stays Host-owned.
      }
      registerSpawn(context);
    });
    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it.each([
    ...BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1.map((key) =>
      ["Scene", key] as const
    ),
    ...BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1.map((key) =>
      ["Engine", key] as const
    ),
  ])("rejects caught add() on every %s Observable (%s)", async (owner, key) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      const record = (owner === "Scene" ? candidate.scene : candidate.engine) as
        unknown as Record<string, { add(callback: () => void): unknown }>;
      try {
        record[key]!.add(() => undefined);
      } catch {
        // The Host retains the first Observable authority violation.
      }
      registerSpawn(context);
    });

    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it.each([
    ["addOnce", (observable: Record<string, unknown>) => invokeObservableControl(observable, "addOnce", () => undefined)],
    ["remove", (observable: Record<string, unknown>) => invokeObservableControl(observable, "remove", {})],
    ["removeCallback", (observable: Record<string, unknown>) => invokeObservableControl(observable, "removeCallback", () => undefined)],
    ["clear", (observable: Record<string, unknown>) => invokeObservableControl(observable, "clear")],
    ["notifyObserver", (observable: Record<string, unknown>) => invokeObservableControl(observable, "notifyObserver", {})],
    ["notifyObservers", (observable: Record<string, unknown>) => invokeObservableControl(observable, "notifyObservers")],
    ["makeObserverTopPriority", (observable: Record<string, unknown>) => invokeObservableControl(observable, "makeObserverTopPriority", {})],
    ["makeObserverBottomPriority", (observable: Record<string, unknown>) => invokeObservableControl(observable, "makeObserverBottomPriority", {})],
    ["cleanLastNotifiedState", (observable: Record<string, unknown>) => invokeObservableControl(observable, "cleanLastNotifiedState")],
    ["clone", (observable: Record<string, unknown>) => invokeObservableControl(observable, "clone")],
    ["live observers", (observable: Record<string, unknown>) => {
      (observable.observers as unknown[]).push({});
    }],
    ["notifyIfTriggered", (observable: Record<string, unknown>) => {
      observable.notifyIfTriggered = true;
    }],
  ] as const)("rejects caught Observable control: %s", async (_label, mutate) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      try {
        mutate(candidate.scene.onBeforeRenderObservable as unknown as
          Record<string, never>);
      } catch {
        // The Module cannot undo a trapped Observable control call.
      }
      registerSpawn(context);
    });
    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });

  it.each([
    ["image observer", (scene: Scene) => {
      scene.imageProcessingConfiguration.onUpdateParameters.add(() => undefined);
    }],
    ["post-process observer", (scene: Scene) => {
      scene.postProcessManager.onBeforeRenderObservable.add(() => undefined);
    }],
    ["second StandardMaterial image observer", (scene: Scene) => {
      new StandardMaterial("nested-material", scene);
      scene.imageProcessingConfiguration.onUpdateParameters.add(() => undefined);
    }],
    ["image-processing object replacement", (scene: Scene) => {
      Object.defineProperty(scene, "imageProcessingConfiguration", {
        configurable: true,
        value: {},
      });
    }],
    ["post-process object replacement", (scene: Scene) => {
      Object.defineProperty(scene, "postProcessManager", {
        configurable: true,
        value: { dispose() {} },
      });
    }],
    ["image-processing Observable replacement", (scene: Scene) => {
      Object.defineProperty(
        scene.imageProcessingConfiguration,
        "onUpdateParameters",
        { configurable: true, value: scene.onBeforeRenderObservable },
      );
    }],
    ["post-process Observable replacement", (scene: Scene) => {
      Object.defineProperty(
        scene.postProcessManager,
        "onBeforeRenderObservable",
        { configurable: true, value: scene.onBeforeRenderObservable },
      );
    }],
  ] as const)("rejects caught nested authority mutation (%s)", async (_label, mutate) => {
    const candidate = createCandidate();
    const result = await admit(candidate, (context) => {
      try {
        mutate(candidate.scene);
      } catch {
        // Nested authority remains Host-owned.
      }
      registerSpawn(context);
    });
    expect(errorCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    );
  });
});

describe("Babylon 9.23.0 authority surface constants", () => {
  it("matches the exact installed Scene and Engine Observable declarations", async () => {
    const extractObservableKeys = (source: string): readonly string[] =>
      [...source.matchAll(
        /^\s{4}(?:readonly )?([A-Za-z0-9_]+)(?:\??): Observable</gm,
      )].map((match) => match[1]!);
    const babylonRoot = new URL(
      "../../../node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/",
      import.meta.url,
    );
    const [sceneDeclaration, sceneHelperDeclaration, engineDeclaration] =
      await Promise.all([
        readFile(new URL("scene.pure.d.ts", babylonRoot), "utf8"),
        readFile(
          new URL("Helpers/sceneHelpers.types.d.ts", babylonRoot),
          "utf8",
        ),
        readFile(
          new URL("Engines/abstractEngine.pure.d.ts", babylonRoot),
          "utf8",
        ),
      ]);

    expect(BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1).toEqual(
      extractObservableKeys(sceneDeclaration),
    );
    expect(BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1).toEqual([
      "onBeforePhysicsObservable",
      "onAfterPhysicsObservable",
      "onBeforeSpritesRenderingObservable",
      "onAfterSpritesRenderingObservable",
    ]);
    expect(BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1).toEqual(
      extractObservableKeys(engineDeclaration),
    );
    expect(BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1).toEqual([
      "onBeforeViewRenderObservable",
      "onAfterViewRenderObservable",
    ]);
    expect(BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1).toHaveLength(17);
    expect(BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_SETTER_KEYS_V1).toHaveLength(5);
    expect(BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1).toHaveLength(12);
    expect(BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1).toHaveLength(2);
    expect(BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1).toHaveLength(10);
    const inputCameraAuthorityEvidenceByKey = new Map<string, string>([
      ["attachControl", "this._inputManager.attachControl("],
      ["detachControl", "this._inputManager.detachControl()"],
      ["addCamera", "this.cameras.push(newCamera)"],
      ["switchActiveCamera", "this.activeCamera = newCamera"],
      ["setActiveCameraById", "const camera = this.getCameraById(id)"],
      ["setActiveCameraByName", "const camera = this.getCameraByName(name)"],
      ["setActiveCameraByID", "return this.setActiveCameraById(id)"],
    ]);
    const optionalInputCameraAuthorityEvidenceByKey = new Map<string, string>([
      [
        "createDefaultCamera",
        '_MissingSideEffect("Scene", "createDefaultCamera")',
      ],
      [
        "createDefaultCameraOrLight",
        '_MissingSideEffect("Scene", "createDefaultCameraOrLight")',
      ],
      [
        "createDefaultVRExperience",
        '_MissingSideEffect("Scene", "createDefaultVRExperience")',
      ],
      [
        "createDefaultXRExperienceAsync",
        '_MissingSideEffect("Scene", "createDefaultXRExperienceAsync")',
      ],
    ]);
    expect(BABYLON_NATIVE_FORBIDDEN_SCENE_INPUT_CAMERA_METHOD_KEYS_V1).toEqual(
      [
        ...inputCameraAuthorityEvidenceByKey.keys(),
        ...optionalInputCameraAuthorityEvidenceByKey.keys(),
      ],
    );
    const sceneSource = await readFile(
      new URL("scene.pure.js", babylonRoot),
      "utf8",
    );
    for (const [key, evidence] of inputCameraAuthorityEvidenceByKey) {
      expect(sceneDeclaration, key).toMatch(new RegExp(`\\b${key}\\s*\\(`));
      expect(sceneSource, key).toContain(`${key}(`);
      expect(sceneSource, key).toContain(evidence);
    }
    for (const [key, evidence] of optionalInputCameraAuthorityEvidenceByKey) {
      expect(sceneHelperDeclaration, key).toMatch(
        new RegExp(`\\b${key}\\s*\\(`),
      );
      expect(sceneSource, key).toContain(evidence);
    }
  });

  it("matches the effective 12-import TypeScript authority profile", () => {
    const { checker, profileSource, program } = createAuthorityProfileProgram();
    const errors = ts.getPreEmitDiagnostics(program).filter(
      ({ category }) => category === ts.DiagnosticCategory.Error,
    );
    expect(errors.map(({ code }) => code)).toEqual([]);
    const specifiers = profileSource.statements
      .filter(ts.isImportDeclaration)
      .map(({ moduleSpecifier }) =>
        (moduleSpecifier as ts.StringLiteral).text
      );
    expect(specifiers).toEqual(BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1);

    const sceneType = profileType(checker, profileSource, "SceneInstance");
    const engineType = profileType(checker, profileSource, "EngineInstance");
    const observableProperties = (type: ts.Type): readonly string[] =>
      checker.getPropertiesOfType(type)
        .filter((symbol) => {
          const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
          if (typeof declaration === "undefined") return false;
          const propertyType = checker.getTypeOfSymbolAtLocation(
            symbol,
            declaration,
          );
          return propertyType.getSymbol()?.getName() === "Observable";
        })
        .map(({ name }) => name);
    expect(observableProperties(sceneType)).toEqual([
      ...BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1,
      ...BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1,
    ]);
    expect(observableProperties(engineType)).toEqual([
      ...BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1,
      ...BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1,
    ]);

    const callableProperties = checker.getPropertiesOfType(sceneType)
      .filter((symbol) => {
        const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
        if (
          typeof declaration === "undefined" ||
          (!ts.isPropertyDeclaration(declaration) &&
            !ts.isGetAccessorDeclaration(declaration) &&
            !ts.isSetAccessorDeclaration(declaration))
        ) return false;
        const propertyType = checker.getNonNullableType(
          checker.getTypeOfSymbolAtLocation(symbol, declaration),
        );
        return checker.getSignaturesOfType(
          propertyType,
          ts.SignatureKind.Call,
        ).length > 0;
      })
      .map(({ name }) => name)
      .sort();
    expect(callableProperties).toEqual([
      ...BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1,
      ...BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_SETTER_KEYS_V1,
    ].sort());

    const aliasByKind = new Map<string, string>([
      ["node", "NodeInstance"],
      ["transform-node", "TransformNodeInstance"],
      ["abstract-mesh", "AbstractMeshInstance"],
      ["mesh", "MeshInstance"],
      ["material", "MaterialInstance"],
      ["standard-material", "StandardMaterialInstance"],
      ["light", "HemisphericLightInstance"],
      ["hemispheric-light", "HemisphericLightInstance"],
      ["directional-light", "DirectionalLightInstance"],
      ["point-light", "PointLightInstance"],
      ["geometry", "GeometryInstance"],
      ["buffer", "BufferInstance"],
    ]);
    for (const surface of
      BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1) {
      const alias = aliasByKind.get(surface.kind)!;
      const type = profileType(checker, profileSource, alias);
      for (const key of [
        ...surface.observableKeys,
        ...surface.callbackSetterKeys,
        ...surface.directCallbackKeys,
        ...surface.retainedCollectionKeys,
        ...surface.forbiddenMethodKeys,
      ]) {
        expect(checker.getPropertyOfType(type, key), `${surface.kind}.${key}`)
          .toBeDefined();
      }
    }
    const standardMaterialConstructor = profileType(
      checker,
      profileSource,
      "StandardMaterialConstructor",
    );
    expect(checker.getPropertyOfType(
      standardMaterialConstructor,
      "OnEventObservable",
    )).toBeDefined();
    const imageProcessingType = profileType(
      checker,
      profileSource,
      "ImageProcessingConfigurationInstance",
    );
    expect(checker.getPropertyOfType(
      imageProcessingType,
      "onUpdateParameters",
    )).toBeDefined();
    const postProcessType = profileType(
      checker,
      profileSource,
      "PostProcessManagerInstance",
    );
    expect(checker.getPropertyOfType(
      postProcessType,
      "onBeforeRenderObservable",
    )).toBeDefined();
  });

  it("matches the runtime surface of every constructible profile type", () => {
    const candidate = createCandidate();
    const transform = new TransformNode("runtime-transform", candidate.scene);
    const mesh = MeshBuilder.CreateBox(
      "runtime-mesh",
      { size: 1 },
      candidate.scene,
    );
    const material = new StandardMaterial("runtime-material", candidate.scene);
    const hemisphericLight = new HemisphericLight(
      "runtime-hemi",
      Vector3.Up(),
      candidate.scene,
    );
    const directionalLight = new DirectionalLight(
      "runtime-directional",
      Vector3.Down(),
      candidate.scene,
    );
    const pointLight = new PointLight(
      "runtime-point",
      Vector3.Zero(),
      candidate.scene,
    );
    const buffer = new Buffer(
      candidate.engine,
      [0, 0, 0],
      false,
      3,
      true,
    );
    const geometry = mesh.geometry;
    expect(geometry).not.toBeNull();
    const objectByKind = new Map<string, Record<string, unknown>>([
      ["node", transform as unknown as Record<string, unknown>],
      ["transform-node", transform as unknown as Record<string, unknown>],
      ["abstract-mesh", mesh as unknown as Record<string, unknown>],
      ["mesh", mesh as unknown as Record<string, unknown>],
      ["material", material as unknown as Record<string, unknown>],
      ["standard-material", material as unknown as Record<string, unknown>],
      ["light", hemisphericLight as unknown as Record<string, unknown>],
      ["hemispheric-light", hemisphericLight as unknown as Record<string, unknown>],
      ["directional-light", directionalLight as unknown as Record<string, unknown>],
      ["point-light", pointLight as unknown as Record<string, unknown>],
      ["geometry", geometry as unknown as Record<string, unknown>],
      ["buffer", buffer as unknown as Record<string, unknown>],
    ]);
    for (const surface of
      BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1) {
      const object = objectByKind.get(surface.kind)!;
      for (const key of surface.observableKeys) {
        const observable = object[key] as { observers?: unknown };
        expect(Array.isArray(observable?.observers), `${surface.kind}.${key}`)
          .toBe(true);
      }
      for (const key of [
        ...surface.callbackSetterKeys,
        ...surface.retainedCollectionKeys,
        ...surface.forbiddenMethodKeys,
      ]) {
        expect(key in object, `${surface.kind}.${key}`).toBe(true);
      }
      for (const key of surface.directCallbackKeys) {
        const value = object[key];
        expect(
          isNil(value) || typeof value === "function",
          `${surface.kind}.${key}`,
        ).toBe(true);
      }
    }
    const materialConstructor = Object.getPrototypeOf(StandardMaterial) as
      Record<string, unknown>;
    expect(Array.isArray((materialConstructor.OnEventObservable as
      { observers: unknown }).observers)).toBe(true);
    expect(Array.isArray(
      candidate.scene.imageProcessingConfiguration.onUpdateParameters.observers,
    )).toBe(true);
    expect(Array.isArray(
      candidate.scene.postProcessManager.onBeforeRenderObservable.observers,
    )).toBe(true);
    buffer.dispose();
  });

  it("discovers only source-approved eager nested authority without side effects", () => {
    const candidate = createCandidate();
    const collectionLengths = Object.freeze({
      cameras: candidate.scene.cameras.length,
      geometries: candidate.scene.geometries.length,
      lights: candidate.scene.lights.length,
      materials: candidate.scene.materials.length,
      meshes: candidate.scene.meshes.length,
      transformNodes: candidate.scene.transformNodes.length,
    });
    const directObserverLists = new Map(
      BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1.map((key) => {
        const observable = (candidate.scene as unknown as
          Record<string, { observers: readonly unknown[] }>)[key]!;
        return [key, observable.observers.slice()] as const;
      }),
    );
    const materialEventObservable = (Object.getPrototypeOf(StandardMaterial) as
      Record<string, { observers: readonly unknown[] } | undefined>)
      .OnEventObservable;
    if (typeof materialEventObservable === "undefined") {
      throw new TypeError("Material.OnEventObservable is unavailable.");
    }
    const materialObservers = materialEventObservable.observers.slice();
    const visited = new Set<object>();
    const discoveredPaths: string[] = [];
    for (const surface of BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1) {
      const object = surface.objectPath === "scene.imageProcessingConfiguration"
        ? candidate.scene.imageProcessingConfiguration
        : candidate.scene.postProcessManager;
      if (!visited.has(object)) visited.add(object);
      const observable = (object as unknown as
        Record<string, { observers?: unknown }>)[surface.observableKey];
      if (Array.isArray(observable?.observers)) {
        discoveredPaths.push(`${surface.objectPath}.${surface.observableKey}`);
      }
    }
    expect(discoveredPaths).toEqual(
      BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1.map(
        ({ objectPath, observableKey }) => `${objectPath}.${observableKey}`,
      ),
    );
    expect(visited.size).toBe(2);
    expect({
      cameras: candidate.scene.cameras.length,
      geometries: candidate.scene.geometries.length,
      lights: candidate.scene.lights.length,
      materials: candidate.scene.materials.length,
      meshes: candidate.scene.meshes.length,
      transformNodes: candidate.scene.transformNodes.length,
    }).toEqual(collectionLengths);
    for (const [key, observers] of directObserverLists) {
      expect((candidate.scene as unknown as
        Record<string, { observers: readonly unknown[] }>)[key]!.observers)
        .toEqual(observers);
    }
    expect(materialEventObservable.observers).toEqual(materialObservers);
  });

  it("freezes the installed source semantics of all forbidden Scene methods", async () => {
    const babylonRoot = new URL(
      "../../../node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/",
      import.meta.url,
    );
    const source = await readFile(new URL("scene.pure.js", babylonRoot), "utf8");
    const retainedEvidenceByKey = new Map<string, string>([
      ["registerBeforeRender", "this.onBeforeRenderObservable.add(func)"],
      ["registerAfterRender", "this.onAfterRenderObservable.add(func)"],
      ["executeOnceBeforeRender", "this._executeOnceBeforeRender(func)"],
      ["executeWhenReady", "this.onReadyObservable.addOnce(func)"],
      ["whenReadyAsync", "this.executeWhenReady(() =>"],
      ["addIsReadyCheck", "this._isReadyChecks.push(isReadyCheck)"],
      ["freezeActiveMeshes", "this._activeMeshesFrozen = true"],
      ["setRenderingOrder", "this._renderingManager.setRenderingOrder("],
      ["addExternalData", "this._externalData.add(key, data)"],
      ["getOrAddExternalDataWithFactory", "this._externalData.getOrAddWithFactory(key, factory)"],
    ]);
    expect([...retainedEvidenceByKey.keys()]).toEqual(
      BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1,
    );
    for (const [key, evidence] of retainedEvidenceByKey) {
      expect(source, key).toContain(`${key}(`);
      expect(source, key).toContain(evidence);
    }
  });

  it("freezes synchronous insertion and deferred notification provider order", async () => {
    const babylonRoot = new URL(
      "../../../node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/",
      import.meta.url,
    );
    const [
      sceneSource,
      abstractMeshSource,
      transformNodeSource,
      lightSource,
      geometrySource,
      materialSource,
      standardMaterialSource,
      imageProcessingSource,
    ] = await Promise.all([
      readFile(new URL("scene.pure.js", babylonRoot), "utf8"),
      readFile(new URL("Meshes/abstractMesh.pure.js", babylonRoot), "utf8"),
      readFile(new URL("Meshes/transformNode.pure.js", babylonRoot), "utf8"),
      readFile(new URL("Lights/light.js", babylonRoot), "utf8"),
      readFile(new URL("Meshes/geometry.js", babylonRoot), "utf8"),
      readFile(new URL("Materials/material.pure.js", babylonRoot), "utf8"),
      readFile(new URL("Materials/standardMaterial.pure.js", babylonRoot), "utf8"),
      readFile(new URL("Materials/imageProcessing.js", babylonRoot), "utf8"),
    ]);

    expect(abstractMeshSource).toContain("scene.addMesh(this)");
    expect(transformNodeSource).toContain("this.getScene().addTransformNode(this)");
    expect(lightSource).toContain("this.getScene().addLight(this)");
    expect(geometrySource).toContain("this._scene.pushGeometry(this)");
    expect(materialSource).toContain("this._scene.addMaterial(this)");
    for (const notification of [
      "onNewMeshAddedObservable.notifyObservers(newMesh)",
      "onNewMaterialAddedObservable.notifyObservers(newMaterial)",
      "onNewLightAddedObservable.notifyObservers(newLight)",
      "onNewGeometryAddedObservable.notifyObservers(geometry)",
    ]) {
      const notificationIndex = sceneSource.indexOf(notification);
      expect(notificationIndex, notification).toBeGreaterThan(-1);
      expect(
        sceneSource.lastIndexOf("TimingTools.SetImmediate", notificationIndex),
        notification,
      ).toBeGreaterThan(-1);
    }
    expect(materialSource.indexOf("this._scene.addMaterial(this)")).toBeLessThan(
      materialSource.indexOf("OnEventObservable.notifyObservers(this"),
    );
    expect(standardMaterialSource.indexOf(
      "this._attachImageProcessingConfiguration(null)",
    )).toBeLessThan(standardMaterialSource.indexOf(
      "this.getRenderTargetTextures = () =>",
    ));
    expect(imageProcessingSource).toContain(
      "this._imageProcessingConfiguration.onUpdateParameters.add(() =>",
    );
  });
});
