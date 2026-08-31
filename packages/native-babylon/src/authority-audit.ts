import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  parseNativeSceneDiagnosticV1,
  type NativeSceneDiagnosticV1,
} from "@whitebox-world/runtime-contracts";
import { isEmpty, isNil } from "lodash-es";

export const BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1 = Object.freeze([
  "onClearColorChangedObservable",
  "onScenePerformancePriorityChangedObservable",
  "onDisposeObservable",
  "onBeforeRenderObservable",
  "onAfterRenderObservable",
  "onAfterRenderCameraObservable",
  "onBeforeAnimationsObservable",
  "onAfterAnimationsObservable",
  "onBeforeDrawPhaseObservable",
  "onAfterDrawPhaseObservable",
  "onReadyObservable",
  "onBeforeCameraRenderObservable",
  "onAfterCameraRenderObservable",
  "onBeforeActiveMeshesEvaluationObservable",
  "onAfterActiveMeshesEvaluationObservable",
  "onBeforeParticlesRenderingObservable",
  "onAfterParticlesRenderingObservable",
  "onDataLoadedObservable",
  "onNewCameraAddedObservable",
  "onCameraRemovedObservable",
  "onNewLightAddedObservable",
  "onLightRemovedObservable",
  "onNewGeometryAddedObservable",
  "onGeometryRemovedObservable",
  "onNewTransformNodeAddedObservable",
  "onTransformNodeRemovedObservable",
  "onNewMeshAddedObservable",
  "onMeshRemovedObservable",
  "onNewSkeletonAddedObservable",
  "onSkeletonRemovedObservable",
  "onNewParticleSystemAddedObservable",
  "onParticleSystemRemovedObservable",
  "onNewAnimationGroupAddedObservable",
  "onAnimationGroupRemovedObservable",
  "onNewMaterialAddedObservable",
  "onNewMultiMaterialAddedObservable",
  "onMaterialRemovedObservable",
  "onMultiMaterialRemovedObservable",
  "onNewTextureAddedObservable",
  "onTextureRemovedObservable",
  "onNewFrameGraphAddedObservable",
  "onFrameGraphRemovedObservable",
  "onNewObjectRendererAddedObservable",
  "onObjectRendererRemovedObservable",
  "onNewPostProcessAddedObservable",
  "onPostProcessRemovedObservable",
  "onNewEffectLayerAddedObservable",
  "onEffectLayerRemovedObservable",
  "onBeforeRenderTargetsRenderObservable",
  "onAfterRenderTargetsRenderObservable",
  "onBeforeStepObservable",
  "onAfterStepObservable",
  "onActiveCameraChanged",
  "onActiveCamerasChanged",
  "onBeforeRenderingGroupObservable",
  "onAfterRenderingGroupObservable",
  "onMeshImportedObservable",
  "onAnimationFileImportedObservable",
  "onEnvironmentTextureChangedObservable",
  "onMeshUnderPointerUpdatedObservable",
  "onPrePointerObservable",
  "onPointerObservable",
  "onPreKeyboardObservable",
  "onKeyboardObservable",
  "onReadyTimeoutObservable",
] as const);

export const BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1 =
  Object.freeze([
    "onBeforePhysicsObservable",
    "onAfterPhysicsObservable",
    "onBeforeSpritesRenderingObservable",
    "onAfterSpritesRenderingObservable",
  ] as const);

export const BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1 = Object.freeze([
  "onCanvasBlurObservable",
  "onCanvasFocusObservable",
  "onNewSceneAddedObservable",
  "onResizeObservable",
  "onCanvasPointerOutObservable",
  "onEffectErrorObservable",
  "onBeforeTextureInitObservable",
  "onBeforeShaderCompilationObservable",
  "onAfterShaderCompilationObservable",
  "onBeginFrameObservable",
  "onEndFrameObservable",
  "onContextLostObservable",
  "onContextRestoredObservable",
  "onDisposeObservable",
  "onReleaseEffectsObservable",
] as const);

export const BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1 =
  Object.freeze([
    "onBeforeViewRenderObservable",
    "onAfterViewRenderObservable",
  ] as const);

export const BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1 =
  Object.freeze([
    "customLODSelector",
    "pointerDownPredicate",
    "pointerUpPredicate",
    "pointerMovePredicate",
    "onPointerMove",
    "onPointerDown",
    "onPointerUp",
    "onPointerPick",
    "pointerMoveTrianglePredicate",
    "pointerDownTrianglePredicate",
    "pointerUpTrianglePredicate",
    "getActiveMeshCandidates",
    "getActiveSubMeshCandidates",
    "getIntersectingSubMeshCandidates",
    "getCollidingSubMeshCandidates",
    "getDeterministicFrameTime",
    "customRenderFunction",
  ] as const);

export const BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_SETTER_KEYS_V1 =
  Object.freeze([
    "onDispose",
    "beforeRender",
    "afterRender",
    "beforeCameraRender",
    "afterCameraRender",
  ] as const);

export const BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1 =
  Object.freeze([
    "registerBeforeRender",
    "registerAfterRender",
    "executeOnceBeforeRender",
    "executeWhenReady",
    "whenReadyAsync",
    "addIsReadyCheck",
    "freezeActiveMeshes",
    "setRenderingOrder",
    "addExternalData",
    "getOrAddExternalDataWithFactory",
  ] as const);

export const BABYLON_NATIVE_FORBIDDEN_SCENE_PHYSICS_METHOD_KEYS_V1 =
  Object.freeze([
    "enablePhysics",
    "disablePhysicsEngine",
    "deleteCompoundImpostor",
  ] as const);

export const BABYLON_NATIVE_FORBIDDEN_SCENE_INPUT_CAMERA_METHOD_KEYS_V1 =
  Object.freeze([
    "attachControl",
    "detachControl",
    "addCamera",
    "switchActiveCamera",
    "setActiveCameraById",
    "setActiveCameraByName",
    "setActiveCameraByID",
    "createDefaultCamera",
    "createDefaultCameraOrLight",
    "createDefaultVRExperience",
    "createDefaultXRExperienceAsync",
  ] as const);

export const BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1 =
  Object.freeze([
    Object.freeze({
      kind: "node",
      extendsKind: undefined,
      observableKeys: Object.freeze([
        "onAccessibilityTagChangedObservable",
        "onDisposeObservable",
        "onEnabledStateChangedObservable",
        "onEffectiveEnabledStateChangedObservable",
        "onClonedObservable",
      ]),
      callbackSetterKeys: Object.freeze(["onDispose"]),
      directCallbackKeys: Object.freeze(["onReady"]),
      retainedCollectionKeys: Object.freeze(["behaviors"]),
      forbiddenMethodKeys: Object.freeze(["addBehavior"]),
    }),
    Object.freeze({
      kind: "transform-node",
      extendsKind: "node",
      observableKeys: Object.freeze(["onAfterWorldMatrixUpdateObservable"]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze(["customMarkAsDirty"]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "abstract-mesh",
      extendsKind: "transform-node",
      observableKeys: Object.freeze([
        "onCollideObservable",
        "onCollisionPositionChangeObservable",
        "onMaterialChangedObservable",
        "onRebuildObservable",
      ]),
      callbackSetterKeys: Object.freeze([
        "onCollide",
        "onCollisionPositionChange",
      ]),
      directCallbackKeys: Object.freeze([]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "mesh",
      extendsKind: "abstract-mesh",
      observableKeys: Object.freeze([
        "onMeshReadyObservable",
        "onBeforeRenderObservable",
        "onBeforeBindObservable",
        "onAfterRenderObservable",
        "onBetweenPassObservable",
        "onBeforeDrawObservable",
      ]),
      callbackSetterKeys: Object.freeze(["onBeforeDraw"]),
      directCallbackKeys: Object.freeze(["onLODLevelSelection"]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([
        "registerBeforeRender",
        "registerAfterRender",
      ]),
    }),
    Object.freeze({
      kind: "material",
      extendsKind: undefined,
      observableKeys: Object.freeze([
        "onDisposeObservable",
        "onBindObservable",
        "onUnBindObservable",
        "onEffectCreatedObservable",
      ]),
      callbackSetterKeys: Object.freeze(["onDispose", "onBind"]),
      directCallbackKeys: Object.freeze([
        "customShaderNameResolve",
        "onCompiled",
        "onError",
        "getRenderTargetTextures",
      ]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "standard-material",
      extendsKind: "material",
      observableKeys: Object.freeze([]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze([]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "light",
      extendsKind: "node",
      observableKeys: Object.freeze([]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze([]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "hemispheric-light",
      extendsKind: "light",
      observableKeys: Object.freeze([]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze([]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "directional-light",
      extendsKind: "light",
      observableKeys: Object.freeze([]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze([]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "point-light",
      extendsKind: "light",
      observableKeys: Object.freeze([]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze([]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "geometry",
      extendsKind: undefined,
      observableKeys: Object.freeze([]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze(["onGeometryUpdated"]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
    Object.freeze({
      kind: "buffer",
      extendsKind: undefined,
      observableKeys: Object.freeze([]),
      callbackSetterKeys: Object.freeze([]),
      directCallbackKeys: Object.freeze([]),
      retainedCollectionKeys: Object.freeze([]),
      forbiddenMethodKeys: Object.freeze([]),
    }),
  ] as const);

export const BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1 =
  Object.freeze([
    Object.freeze({
      objectPath: "scene.imageProcessingConfiguration",
      observableKey: "onUpdateParameters",
      providerTransition: "standard-material-image-processing",
    }),
    Object.freeze({
      objectPath: "scene.postProcessManager",
      observableKey: "onBeforeRenderObservable",
      providerTransition: undefined,
    }),
  ] as const);

export const BABYLON_NATIVE_ALLOWED_PROVIDER_CALLBACK_TRANSITIONS_V1 =
  Object.freeze([
    Object.freeze({
      kind: "standard-material-image-processing",
      materialConstructorName: "StandardMaterial",
      observablePath:
        "scene.imageProcessingConfiguration.onUpdateParameters",
      directCallbackKey: "getRenderTargetTextures",
      observerAddCount: 1,
      directAssignmentCount: 1,
    }),
  ] as const);

export interface BabylonNativeSceneCandidateAuthorityV1 {
  readonly engine: ReturnType<Scene["getEngine"]>;
  readonly scene: Scene;
}

interface PublicObservableLikeV1 {
  readonly observers: readonly unknown[];
}

interface ObservableBaselineV1 {
  readonly observable: PublicObservableLikeV1;
  readonly observers: readonly unknown[];
}

interface NestedAuthorityBaselineV1 {
  readonly object: Record<string, unknown>;
  readonly observableKey: string;
  readonly observableBaseline: ObservableBaselineV1;
}

export interface BabylonNativeSceneAuthoritySnapshotV1 {
  readonly candidate: BabylonNativeSceneCandidateAuthorityV1;
  readonly sceneObservablesByKey: ReadonlyMap<string, ObservableBaselineV1>;
  readonly engineObservablesByKey: ReadonlyMap<string, ObservableBaselineV1>;
  readonly sceneCallbacksByKey: ReadonlyMap<string, unknown>;
  readonly declaredLazySceneAuthorityByKey: ReadonlyMap<string, unknown>;
  readonly declaredLazyEngineAuthorityByKey: ReadonlyMap<string, unknown>;
  readonly customAnimationFrameRequester: unknown;
  readonly materialEventObservable: ObservableBaselineV1;
  readonly nestedAuthorityByPath: ReadonlyMap<string, NestedAuthorityBaselineV1>;
}

export interface BabylonNativeSceneAuthorityProbeV1 {
  audit(): readonly NativeSceneDiagnosticV1[];
  restore(): void;
}

const OBSERVABLE_MUTATION_METHOD_KEYS_V1 = Object.freeze([
  "add",
  "addOnce",
  "remove",
  "removeCallback",
  "clear",
  "makeObserverTopPriority",
  "makeObserverBottomPriority",
  "cleanLastNotifiedState",
  "clone",
] as const);

const OBSERVABLE_NOTIFICATION_METHOD_KEYS_V1 = Object.freeze([
  "notifyObserver",
  "notifyObservers",
] as const);

const ARRAY_MUTATION_METHOD_KEYS_V1 = Object.freeze([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
] as const);

const SCENE_RETAINED_COLLECTION_KEYS_V1 = Object.freeze([
  "cameras",
  "actionManagers",
] as const);

// Babylon 9.23.0 Scene.attachControl() installs these provider observers when
// a browser canvas exists. They are part of the fresh Candidate baseline, not
// Module-owned scheduling or lifecycle authority. The post-Build snapshot
// still requires their exact ordered references to remain unchanged.
const MAXIMUM_PROVIDER_ENGINE_OBSERVER_COUNT_BY_KEY_V1: Readonly<
  Partial<Record<typeof BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1[number], number>>
> = Object.freeze({
  onEndFrameObservable: 1,
  onDisposeObservable: 1,
});

const ABSTRACT_MESH_RUNTIME_AUTHORITY_KEYS_V1 = Object.freeze([
  "actionManager",
  "physicsBody",
] as const);

const MATERIAL_CONSTRUCTOR_V1 = Object.getPrototypeOf(StandardMaterial) as
  Record<string, unknown>;

function isPublicObservableLike(input: unknown): input is PublicObservableLikeV1 {
  try {
    return typeof input === "object" &&
      !isNil(input) &&
      Array.isArray((input as PublicObservableLikeV1).observers);
  } catch {
    return false;
  }
}

function invalidCandidateDiagnostic(): NativeSceneDiagnosticV1 {
  return parseNativeSceneDiagnosticV1({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: "native-candidate.candidate-precondition-invalid",
    severity: "error",
    stage: "authority-audit",
    code: "WORLDKIT_NATIVE_SCENE_CANDIDATE_PRECONDITION_INVALID",
    location: { kind: "none" },
    measurement: { kind: "none" },
    message: "Candidate Scene and Engine must begin with no gameplay authority.",
    repairHint: "Create one fresh isolated Candidate before Native Scene admission.",
  });
}

function authorityMutationDiagnostic(): NativeSceneDiagnosticV1 {
  return parseNativeSceneDiagnosticV1({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: "native-candidate.authority-mutation-forbidden",
    severity: "error",
    stage: "authority-audit",
    code: "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
    location: { kind: "none" },
    measurement: { kind: "none" },
    message: "Native Scene Module mutated Host-owned runtime authority.",
    repairHint: "Keep camera, physics, actions, callbacks, scheduling, and lifecycle under SDK ownership.",
  });
}

function hasPublicPhysicsAuthority(scene: Scene): boolean {
  const physicsScene = scene as Scene & Readonly<{
    getPhysicsEngine?: () => unknown;
    isPhysicsEnabled?: () => boolean;
  }>;
  try {
    return (
      typeof physicsScene.isPhysicsEnabled === "function" &&
      physicsScene.isPhysicsEnabled()
    ) || (
      typeof physicsScene.getPhysicsEngine === "function" &&
      !isNil(physicsScene.getPhysicsEngine())
    );
  } catch {
    return true;
  }
}

function hasPreexistingObservers(
  owner: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  try {
    return keys.some((key) => {
      const observable = owner[key];
      return !isPublicObservableLike(observable) ||
        !isEmpty(observable.observers);
    });
  } catch {
    return true;
  }
}

function hasUnexpectedPreexistingEngineObservers(
  owner: Record<string, unknown>,
): boolean {
  try {
    return BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1.some((key) => {
      const observable = owner[key];
      if (!isPublicObservableLike(observable)) return true;
      const maximumCount =
        MAXIMUM_PROVIDER_ENGINE_OBSERVER_COUNT_BY_KEY_V1[key] ?? 0;
      return observable.observers.length > maximumCount;
    });
  } catch {
    return true;
  }
}

export function validateBabylonNativeSceneCandidatePreconditionV1(
  candidate: BabylonNativeSceneCandidateAuthorityV1,
): readonly NativeSceneDiagnosticV1[] {
  try {
    const { engine, scene } = candidate;
    const sceneRecord = scene as unknown as Record<string, unknown>;
    const engineRecord = engine as unknown as Record<string, unknown>;
    const engineScenes = engine.scenes;
    const meshes = scene.meshes;
    const invalid =
      scene.getEngine() !== engine ||
      scene.isDisposed ||
      engine.isDisposed ||
      engineScenes.length !== 1 ||
      engineScenes[0] !== scene ||
      !isNil(scene.activeCamera) ||
      (!isNil(scene.activeCameras) && !isEmpty(scene.activeCameras)) ||
      !isEmpty(scene.cameras) ||
      !isNil(scene.actionManager) ||
      !isEmpty(scene.actionManagers) ||
      meshes.some((mesh) => !isNil(mesh.actionManager) || !isNil(mesh.physicsBody)) ||
      hasPublicPhysicsAuthority(scene) ||
      hasPreexistingObservers(
        sceneRecord,
        BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1,
      ) ||
      hasUnexpectedPreexistingEngineObservers(engineRecord) ||
      BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1.some(
        (key) => !isNil(sceneRecord[key]),
      ) ||
      BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1.some(
        (key) => !isNil(engineRecord[key]),
      );
    return invalid ? Object.freeze([invalidCandidateDiagnostic()]) : Object.freeze([]);
  } catch {
    return Object.freeze([invalidCandidateDiagnostic()]);
  }
}

function captureObservableBaselines(
  owner: Record<string, unknown>,
  keys: readonly string[],
): ReadonlyMap<string, ObservableBaselineV1> {
  const baselines = new Map<string, ObservableBaselineV1>();
  for (const key of keys) {
    const observable = owner[key];
    if (!isPublicObservableLike(observable)) {
      throw new TypeError(`Missing public Observable '${key}'.`);
    }
    baselines.set(key, Object.freeze({
      observable,
      observers: Object.freeze(observable.observers.slice()),
    }));
  }
  return baselines;
}

function captureObservableBaseline(input: unknown): ObservableBaselineV1 {
  if (!isPublicObservableLike(input)) {
    throw new TypeError("Expected one public Babylon Observable.");
  }
  return Object.freeze({
    observable: input,
    observers: Object.freeze(input.observers.slice()),
  });
}

function publicObject(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input)) {
    throw new TypeError("Expected one eager public Babylon object.");
  }
  return input as Record<string, unknown>;
}

function sameOrderedReferences(
  left: readonly unknown[],
  right: readonly unknown[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function observablesMatch(
  owner: Record<string, unknown>,
  baselines: ReadonlyMap<string, ObservableBaselineV1>,
): boolean {
  try {
    for (const [key, baseline] of baselines) {
      const current = owner[key];
      if (
        current !== baseline.observable ||
        !isPublicObservableLike(current) ||
        !sameOrderedReferences(current.observers, baseline.observers)
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function captureBabylonNativeSceneAuthoritySnapshotV1(
  candidate: BabylonNativeSceneCandidateAuthorityV1,
): BabylonNativeSceneAuthoritySnapshotV1 {
  const sceneRecord = candidate.scene as unknown as Record<string, unknown>;
  const engineRecord = candidate.engine as unknown as Record<string, unknown>;
  const imageProcessingConfiguration = publicObject(
    sceneRecord.imageProcessingConfiguration,
  );
  const postProcessManager = publicObject(sceneRecord.postProcessManager);
  return Object.freeze({
    candidate,
    sceneObservablesByKey: captureObservableBaselines(
      sceneRecord,
      BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1,
    ),
    engineObservablesByKey: captureObservableBaselines(
      engineRecord,
      BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1,
    ),
    sceneCallbacksByKey: new Map(
      [
        ...BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1,
        ...BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_SETTER_KEYS_V1,
      ].map((key) => [key, sceneRecord[key]] as const),
    ),
    declaredLazySceneAuthorityByKey: new Map(
      BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1.map((key) =>
        [key, sceneRecord[key]] as const
      ),
    ),
    declaredLazyEngineAuthorityByKey: new Map(
      BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1.map((key) =>
        [key, engineRecord[key]] as const
      ),
    ),
    customAnimationFrameRequester: engineRecord.customAnimationFrameRequester,
    materialEventObservable: captureObservableBaseline(
      MATERIAL_CONSTRUCTOR_V1.OnEventObservable,
    ),
    nestedAuthorityByPath: new Map<string, NestedAuthorityBaselineV1>([
      [
        "scene.imageProcessingConfiguration",
        Object.freeze({
          object: imageProcessingConfiguration,
          observableKey: "onUpdateParameters",
          observableBaseline: captureObservableBaseline(
            imageProcessingConfiguration.onUpdateParameters,
          ),
        }),
      ],
      [
        "scene.postProcessManager",
        Object.freeze({
          object: postProcessManager,
          observableKey: "onBeforeRenderObservable",
          observableBaseline: captureObservableBaseline(
            postProcessManager.onBeforeRenderObservable,
          ),
        }),
      ],
    ]),
  });
}

export function auditBabylonNativeSceneAuthoritySnapshotV1(
  snapshot: BabylonNativeSceneAuthoritySnapshotV1,
): readonly NativeSceneDiagnosticV1[] {
  try {
    const { engine, scene } = snapshot.candidate;
    const sceneRecord = scene as unknown as Record<string, unknown>;
    const engineRecord = engine as unknown as Record<string, unknown>;
    const callbacksMatch = [...snapshot.sceneCallbacksByKey].every(
      ([key, value]) => sceneRecord[key] === value,
    );
    const lazyAuthorityMatches = [
      ...[...snapshot.declaredLazySceneAuthorityByKey].map(
        ([key, value]) => sceneRecord[key] === value,
      ),
      ...[...snapshot.declaredLazyEngineAuthorityByKey].map(
        ([key, value]) => engineRecord[key] === value,
      ),
    ].every(Boolean);
    const imageProcessingBaseline = snapshot.nestedAuthorityByPath.get(
      "scene.imageProcessingConfiguration",
    )!;
    const postProcessBaseline = snapshot.nestedAuthorityByPath.get(
      "scene.postProcessManager",
    )!;
    const imageProcessingConfiguration = sceneRecord.imageProcessingConfiguration;
    const postProcessManager = sceneRecord.postProcessManager;
    const materialEventObservable = MATERIAL_CONSTRUCTOR_V1.OnEventObservable;
    const invalid =
      scene.getEngine() !== engine ||
      scene.isDisposed ||
      engine.isDisposed ||
      engine.scenes.length !== 1 ||
      engine.scenes[0] !== scene ||
      !isNil(scene.activeCamera) ||
      (!isNil(scene.activeCameras) && !isEmpty(scene.activeCameras)) ||
      !isEmpty(scene.cameras) ||
      !isNil(scene.actionManager) ||
      !isEmpty(scene.actionManagers) ||
      scene.meshes.some((mesh) =>
        !isNil(mesh.actionManager) || !isNil(mesh.physicsBody)
      ) ||
      hasPublicPhysicsAuthority(scene) ||
      !observablesMatch(
        sceneRecord,
        snapshot.sceneObservablesByKey,
      ) ||
      !observablesMatch(
        engineRecord,
        snapshot.engineObservablesByKey,
      ) ||
      !callbacksMatch ||
      !lazyAuthorityMatches ||
      engineRecord.customAnimationFrameRequester !==
        snapshot.customAnimationFrameRequester ||
      materialEventObservable !== snapshot.materialEventObservable.observable ||
      !isPublicObservableLike(materialEventObservable) ||
      !sameOrderedReferences(
        materialEventObservable.observers,
        snapshot.materialEventObservable.observers,
      ) ||
      imageProcessingConfiguration !== imageProcessingBaseline.object ||
      imageProcessingBaseline.object[imageProcessingBaseline.observableKey] !==
        imageProcessingBaseline.observableBaseline.observable ||
      postProcessManager !== postProcessBaseline.object ||
      postProcessBaseline.object[postProcessBaseline.observableKey] !==
        postProcessBaseline.observableBaseline.observable ||
      !isPublicObservableLike(
        postProcessBaseline.object[postProcessBaseline.observableKey],
      ) ||
      !sameOrderedReferences(
        postProcessBaseline.observableBaseline.observable.observers,
        postProcessBaseline.observableBaseline.observers,
      );
    return invalid ? Object.freeze([authorityMutationDiagnostic()]) : Object.freeze([]);
  } catch {
    return Object.freeze([authorityMutationDiagnostic()]);
  }
}

function installOwnMethodGuard(
  owner: Record<string, unknown>,
  key: string,
  recordViolation: () => never,
  restorers: Array<() => void>,
  allowCall?: (args: readonly unknown[]) => boolean,
): void {
  const originalOwnDescriptor = Object.getOwnPropertyDescriptor(owner, key);
  const originalMethod = owner[key];
  if (typeof originalMethod !== "function") return;
  Object.defineProperty(owner, key, {
    configurable: true,
    enumerable: originalOwnDescriptor?.enumerable ?? false,
    value: function guardedAuthorityMethod(
      this: unknown,
      ...args: readonly unknown[]
    ): unknown {
      if (allowCall?.(args)) {
        return Reflect.apply(originalMethod, this, args);
      }
      return recordViolation();
    },
    writable: true,
  });
  restorers.push(() => {
    if (typeof originalOwnDescriptor === "undefined") {
      Reflect.deleteProperty(owner, key);
    } else {
      Object.defineProperty(owner, key, originalOwnDescriptor);
    }
  });
}

function installOwnValueGuard(
  owner: Record<string, unknown>,
  key: string,
  recordViolation: () => never,
  restorers: Array<() => void>,
): void {
  const originalOwnDescriptor = Object.getOwnPropertyDescriptor(owner, key);
  const originalValue = owner[key];
  Object.defineProperty(owner, key, {
    configurable: true,
    enumerable: originalOwnDescriptor?.enumerable ?? true,
    get: () => originalValue,
    set: recordViolation,
  });
  restorers.push(() => {
    if (typeof originalOwnDescriptor === "undefined") {
      Reflect.deleteProperty(owner, key);
    } else {
      Object.defineProperty(owner, key, originalOwnDescriptor);
    }
  });
}

type CreatedObjectSurfaceV1 =
  typeof BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1[number];

interface EffectiveCreatedObjectSurfaceV1 {
  readonly observableKeys: readonly string[];
  readonly callbackSetterKeys: readonly string[];
  readonly directCallbackKeys: readonly string[];
  readonly retainedCollectionKeys: readonly string[];
  readonly forbiddenMethodKeys: readonly string[];
}

interface CreatedObjectAuditRecordV1 {
  readonly object: Record<string, unknown>;
  readonly surface: EffectiveCreatedObjectSurfaceV1;
  readonly observableBaselinesByKey: Map<string, ObservableBaselineV1>;
  readonly allowedObserversByKey: Map<string, readonly unknown[]>;
  readonly directValuesByKey: Map<string, () => unknown>;
  readonly retainedCollectionsByKey: Map<string, readonly unknown[]>;
}

interface StandardMaterialTransitionV1 {
  readonly material: Record<string, unknown>;
  observer: unknown;
  providerFunction: unknown;
  observerAddCount: number;
  directAssignmentCount: number;
  createdRecord?: CreatedObjectAuditRecordV1;
}

const CREATED_OBJECT_SURFACE_BY_KIND_V1 = new Map(
  BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1.map((surface) =>
    [surface.kind, surface] as const
  ),
);

function effectiveCreatedObjectSurface(
  kind: CreatedObjectSurfaceV1["kind"],
): EffectiveCreatedObjectSurfaceV1 {
  const surfaces: CreatedObjectSurfaceV1[] = [];
  let currentKind: CreatedObjectSurfaceV1["kind"] | undefined = kind;
  while (typeof currentKind !== "undefined") {
    const current = CREATED_OBJECT_SURFACE_BY_KIND_V1.get(currentKind);
    if (typeof current === "undefined") {
      throw new TypeError(`Unknown created-object surface '${currentKind}'.`);
    }
    surfaces.unshift(current);
    currentKind = current.extendsKind;
  }
  const flatten = (
    select: (surface: CreatedObjectSurfaceV1) => readonly string[],
  ): readonly string[] => Object.freeze(surfaces.flatMap(select));
  return Object.freeze({
    observableKeys: flatten(({ observableKeys }) => observableKeys),
    callbackSetterKeys: flatten(({ callbackSetterKeys }) => callbackSetterKeys),
    directCallbackKeys: flatten(({ directCallbackKeys }) => directCallbackKeys),
    retainedCollectionKeys: flatten(
      ({ retainedCollectionKeys }) => retainedCollectionKeys,
    ),
    forbiddenMethodKeys: flatten(({ forbiddenMethodKeys }) => forbiddenMethodKeys),
  });
}

function inheritedPropertyDescriptor(
  owner: object,
  key: string,
): PropertyDescriptor | undefined {
  let current: object | null = owner;
  while (!isNil(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (typeof descriptor !== "undefined") return descriptor;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
}

function instrumentObserverArray(
  observers: readonly unknown[],
  recordViolation: () => never,
  restorers: Array<() => void>,
  allowMutation: () => boolean,
): void {
  const record = observers as unknown as Record<string, unknown>;
  for (const key of ARRAY_MUTATION_METHOD_KEYS_V1) {
    installOwnMethodGuard(record, key, recordViolation, restorers, allowMutation);
  }
}

function instrumentObservable(
  baseline: ObservableBaselineV1,
  recordViolation: () => never,
  restorers: Array<() => void>,
  options: Readonly<{
    allowMutation?: () => boolean;
    allowNotification?: (args: readonly unknown[]) => boolean;
    guardNotifications?: boolean;
    skipAdd?: boolean;
  }> = {},
): void {
  const observableRecord = baseline.observable as unknown as
    Record<string, unknown>;
  const allowMutation = options.allowMutation ?? (() => false);
  const allowMutationCall = (): boolean => allowMutation();
  for (const key of OBSERVABLE_MUTATION_METHOD_KEYS_V1) {
    if (options.skipAdd && key === "add") continue;
    installOwnMethodGuard(
      observableRecord,
      key,
      recordViolation,
      restorers,
      allowMutationCall,
    );
  }
  if (options.guardNotifications) {
    for (const key of OBSERVABLE_NOTIFICATION_METHOD_KEYS_V1) {
      installOwnMethodGuard(
        observableRecord,
        key,
        recordViolation,
        restorers,
        options.allowNotification,
      );
    }
  }
  installOwnValueGuard(
    observableRecord,
    "notifyIfTriggered",
    recordViolation,
    restorers,
  );
  instrumentObserverArray(
    baseline.observable.observers,
    recordViolation,
    restorers,
    allowMutation,
  );
}

function installObservableSurfaceAccessor(
  owner: Record<string, unknown>,
  key: string,
  recordViolation: () => never,
  restorers: Array<() => void>,
  baselinesByKey: Map<string, ObservableBaselineV1>,
  allowNotification: (args: readonly unknown[]) => boolean,
  allowMutation: () => boolean,
  allowProviderAssignment: boolean,
): void {
  const originalOwnDescriptor = Object.getOwnPropertyDescriptor(owner, key);
  const descriptor = inheritedPropertyDescriptor(owner, key);
  let baseline: ObservableBaselineV1 | undefined;
  let providerAssignmentAvailable =
    allowProviderAssignment && key === "onMeshReadyObservable";
  let hasProviderAssignedValue = false;
  let providerAssignedValue: unknown;
  const readProviderValue = (): unknown => {
    if (hasProviderAssignedValue) return providerAssignedValue;
    if (typeof originalOwnDescriptor !== "undefined") {
      return "value" in originalOwnDescriptor
        ? originalOwnDescriptor.value
        : originalOwnDescriptor.get?.call(owner);
    }
    return descriptor?.get?.call(owner);
  };
  Object.defineProperty(owner, key, {
    configurable: true,
    enumerable: originalOwnDescriptor?.enumerable ?? descriptor?.enumerable ?? false,
    get(): unknown {
      const observable = readProviderValue();
      if (typeof baseline === "undefined") {
        baseline = captureObservableBaseline(observable);
        baselinesByKey.set(key, baseline);
        instrumentObservable(
          baseline,
          recordViolation,
          restorers,
          { allowMutation, allowNotification, guardNotifications: true },
        );
      }
      return observable;
    },
    set(value: unknown): void {
      if (providerAssignmentAvailable) {
        providerAssignmentAvailable = false;
        if (typeof descriptor?.set === "function") {
          descriptor.set.call(owner, value);
        } else {
          hasProviderAssignedValue = true;
          providerAssignedValue = value;
        }
        const observable = readProviderValue();
        baseline = captureObservableBaseline(observable);
        baselinesByKey.set(key, baseline);
        instrumentObservable(
          baseline,
          recordViolation,
          restorers,
          { allowMutation, allowNotification, guardNotifications: true },
        );
        return;
      }
      recordViolation();
    },
  });
  restorers.push(() => {
    if (typeof originalOwnDescriptor === "undefined") {
      Reflect.deleteProperty(owner, key);
      if (hasProviderAssignedValue) {
        Object.defineProperty(owner, key, {
          configurable: true,
          enumerable: true,
          value: providerAssignedValue,
          writable: true,
        });
      }
    } else {
      Object.defineProperty(owner, key, originalOwnDescriptor);
    }
  });
}

function installCreatedDirectValueGuard(
  owner: Record<string, unknown>,
  key: string,
  recordViolation: () => never,
  restorers: Array<() => void>,
  allowAssignment?: (value: unknown) => boolean,
): () => unknown {
  const originalOwnDescriptor = Object.getOwnPropertyDescriptor(owner, key);
  let value = owner[key];
  let changed = false;
  Object.defineProperty(owner, key, {
    configurable: true,
    enumerable: originalOwnDescriptor?.enumerable ?? true,
    get: () => value,
    set(nextValue: unknown): void {
      if (allowAssignment?.(nextValue)) {
        value = nextValue;
        changed = true;
        return;
      }
      recordViolation();
    },
  });
  restorers.push(() => {
    if (typeof originalOwnDescriptor === "undefined") {
      Reflect.deleteProperty(owner, key);
      if (changed) {
        Object.defineProperty(owner, key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      }
    } else if ("value" in originalOwnDescriptor) {
      Object.defineProperty(owner, key, { ...originalOwnDescriptor, value });
    } else {
      Object.defineProperty(owner, key, originalOwnDescriptor);
    }
  });
  return () => value;
}

function createdObjectKind(
  insertionKey: string,
  object: Record<string, unknown>,
): CreatedObjectSurfaceV1["kind"] {
  if (insertionKey === "addMesh") {
    return object instanceof Mesh ? "mesh" : "abstract-mesh";
  }
  if (insertionKey === "addTransformNode") return "transform-node";
  if (insertionKey === "addMaterial") {
    return object instanceof StandardMaterial ? "standard-material" : "material";
  }
  if (insertionKey === "pushGeometry") return "geometry";
  if (insertionKey === "addLight") {
    const name = object.constructor?.name;
    if (name === "HemisphericLight") return "hemispheric-light";
    if (name === "DirectionalLight") return "directional-light";
    if (name === "PointLight") return "point-light";
    return "light";
  }
  throw new TypeError(`Unknown Candidate collection insertion '${insertionKey}'.`);
}

export function beginBabylonNativeSceneAuthorityProbeV1(
  candidate: BabylonNativeSceneCandidateAuthorityV1,
): BabylonNativeSceneAuthorityProbeV1 {
  const snapshot = captureBabylonNativeSceneAuthoritySnapshotV1(candidate);
  const restorers: Array<() => void> = [];
  const createdObjects: CreatedObjectAuditRecordV1[] = [];
  const standardMaterialTransitions: StandardMaterialTransitionV1[] = [];
  const guardedPhysicsMethodsByKey = new Map<string, unknown>();
  let providerMutationDepth = 0;
  let violated = false;
  let restored = false;
  const recordViolation = (): never => {
    violated = true;
    throw new Error("WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN");
  };

  const sceneRecord = candidate.scene as unknown as Record<string, unknown>;
  const engineRecord = candidate.engine as unknown as Record<string, unknown>;
  for (const key of SCENE_RETAINED_COLLECTION_KEYS_V1) {
    const collection = sceneRecord[key];
    if (!Array.isArray(collection)) {
      throw new TypeError(`Scene.${key} is not a public collection.`);
    }
    instrumentObserverArray(collection, recordViolation, restorers, () => false);
    installOwnValueGuard(sceneRecord, key, recordViolation, restorers);
  }
  for (const [key, baseline] of snapshot.sceneObservablesByKey) {
    instrumentObservable(baseline, recordViolation, restorers, {
      allowNotification: (args) =>
        key === "onClearColorChangedObservable" ||
        createdObjects.some(({ object }) => args[0] === object),
      guardNotifications: true,
    });
    installOwnValueGuard(sceneRecord, key, recordViolation, restorers);
  }
  for (const [key, baseline] of snapshot.engineObservablesByKey) {
    instrumentObservable(baseline, recordViolation, restorers, {
      guardNotifications: true,
    });
    installOwnValueGuard(engineRecord, key, recordViolation, restorers);
  }
  for (const key of BABYLON_NATIVE_DECLARED_LAZY_SCENE_AUTHORITY_KEYS_V1) {
    installOwnValueGuard(sceneRecord, key, recordViolation, restorers);
  }
  for (const key of BABYLON_NATIVE_DECLARED_LAZY_ENGINE_AUTHORITY_KEYS_V1) {
    installOwnValueGuard(engineRecord, key, recordViolation, restorers);
  }
  instrumentObservable(
    snapshot.materialEventObservable,
    recordViolation,
    restorers,
    {
      allowNotification: (args) => createdObjects.some(
        ({ object }) => args[0] === object,
      ),
      guardNotifications: true,
    },
  );

  const postProcessBaseline = snapshot.nestedAuthorityByPath.get(
    "scene.postProcessManager",
  )!;
  instrumentObservable(
    postProcessBaseline.observableBaseline,
    recordViolation,
    restorers,
    { guardNotifications: true },
  );
  const imageProcessingBaseline = snapshot.nestedAuthorityByPath.get(
    "scene.imageProcessingConfiguration",
  )!;
  const imageProcessingObservableRecord =
    imageProcessingBaseline.observableBaseline.observable as unknown as
      Record<string, unknown>;
  const imageProcessingAddOwnDescriptor = Object.getOwnPropertyDescriptor(
    imageProcessingObservableRecord,
    "add",
  );
  const imageProcessingAdd = imageProcessingObservableRecord.add;
  if (typeof imageProcessingAdd !== "function") {
    throw new TypeError("ImageProcessingConfiguration Observable has no add().");
  }
  Object.defineProperty(imageProcessingObservableRecord, "add", {
    configurable: true,
    enumerable: imageProcessingAddOwnDescriptor?.enumerable ?? false,
    value: function guardedProviderAdd(
      this: unknown,
      ...args: readonly unknown[]
    ): unknown {
      const transition = standardMaterialTransitions.find(
        ({ observerAddCount }) => observerAddCount === 0,
      );
      if (typeof transition === "undefined") return recordViolation();
      providerMutationDepth += 1;
      try {
        const observer = Reflect.apply(imageProcessingAdd, this, args);
        transition.observer = observer;
        transition.observerAddCount += 1;
        return observer;
      } finally {
        providerMutationDepth -= 1;
      }
    },
    writable: true,
  });
  restorers.push(() => {
    if (typeof imageProcessingAddOwnDescriptor === "undefined") {
      Reflect.deleteProperty(imageProcessingObservableRecord, "add");
    } else {
      Object.defineProperty(
        imageProcessingObservableRecord,
        "add",
        imageProcessingAddOwnDescriptor,
      );
    }
  });
  instrumentObservable(
    imageProcessingBaseline.observableBaseline,
    recordViolation,
    restorers,
    {
      allowMutation: () => providerMutationDepth > 0,
      guardNotifications: true,
      skipAdd: true,
    },
  );

  const instrumentCreatedObject = (
    insertionKey: string,
    input: unknown,
    isExisting = false,
  ): void => {
    const object = publicObject(input);
    const kind = createdObjectKind(insertionKey, object);
    const surface = effectiveCreatedObjectSurface(kind);
    const transition: StandardMaterialTransitionV1 | undefined =
      kind === "standard-material" && !isExisting
      ? {
          material: object,
          observer: undefined,
          providerFunction: undefined,
          observerAddCount: 0,
          directAssignmentCount: 0,
        }
      : undefined;
    if (typeof transition !== "undefined") {
      standardMaterialTransitions.push(transition);
    }
    const record: CreatedObjectAuditRecordV1 = {
      object,
      surface,
      observableBaselinesByKey: new Map(),
      allowedObserversByKey: new Map(),
      directValuesByKey: new Map(),
      retainedCollectionsByKey: new Map(),
    };
    if (typeof transition !== "undefined") transition.createdRecord = record;
    let providerObjectMutationDepth = 0;
    const originalDisposeOwnDescriptor = Object.getOwnPropertyDescriptor(
      object,
      "dispose",
    );
    const originalDispose = object.dispose;
    if (typeof originalDispose === "function") {
      Object.defineProperty(object, "dispose", {
        configurable: true,
        enumerable: originalDisposeOwnDescriptor?.enumerable ?? false,
        value: function providerLifecycleDispose(
          this: unknown,
          ...args: readonly unknown[]
        ): unknown {
          providerObjectMutationDepth += 1;
          try {
            return Reflect.apply(originalDispose, this, args);
          } finally {
            providerObjectMutationDepth -= 1;
          }
        },
        writable: true,
      });
      restorers.push(() => {
        if (typeof originalDisposeOwnDescriptor === "undefined") {
          Reflect.deleteProperty(object, "dispose");
        } else {
          Object.defineProperty(object, "dispose", originalDisposeOwnDescriptor);
        }
      });
    }
    for (const key of surface.observableKeys) {
      installObservableSurfaceAccessor(
        object,
        key,
        recordViolation,
        restorers,
        record.observableBaselinesByKey,
        (args) => args[0] === object,
        () => {
          return providerObjectMutationDepth > 0 || (
            typeof transition !== "undefined" &&
            transition.directAssignmentCount === 0
          );
        },
        !isExisting,
      );
    }
    for (const key of surface.directCallbackKeys) {
      record.directValuesByKey.set(
        key,
        installCreatedDirectValueGuard(
          object,
          key,
          recordViolation,
          restorers,
          key === "getRenderTargetTextures" &&
              typeof transition !== "undefined"
            ? (value) => {
                if (
                  transition.observerAddCount !== 1 ||
                  transition.directAssignmentCount !== 0 ||
                  typeof value !== "function"
                ) return false;
                transition.providerFunction = value;
                transition.directAssignmentCount += 1;
                for (const [observableKey, baseline] of
                  transition.createdRecord?.observableBaselinesByKey ?? []) {
                  transition.createdRecord?.allowedObserversByKey.set(
                    observableKey,
                    Object.freeze(baseline.observable.observers.slice()),
                  );
                }
                return true;
              }
            : undefined,
        ),
      );
    }
    if (kind === "abstract-mesh" || kind === "mesh") {
      for (const key of ABSTRACT_MESH_RUNTIME_AUTHORITY_KEYS_V1) {
        record.directValuesByKey.set(
          key,
          installCreatedDirectValueGuard(
            object,
            key,
            recordViolation,
            restorers,
          ),
        );
      }
    }
    for (const key of surface.retainedCollectionKeys) {
      const value = object[key];
      if (!Array.isArray(value)) return recordViolation();
      record.retainedCollectionsByKey.set(key, Object.freeze(value.slice()));
    }
    for (const key of surface.forbiddenMethodKeys) {
      installOwnMethodGuard(object, key, recordViolation, restorers);
    }
    createdObjects.push(record);
  };

  for (const transformNode of candidate.scene.transformNodes) {
    instrumentCreatedObject("addTransformNode", transformNode, true);
  }
  for (const mesh of candidate.scene.meshes) {
    instrumentCreatedObject("addMesh", mesh, true);
  }
  for (const material of candidate.scene.materials) {
    instrumentCreatedObject("addMaterial", material, true);
  }
  for (const light of candidate.scene.lights) {
    instrumentCreatedObject("addLight", light, true);
  }
  for (const geometry of candidate.scene.geometries) {
    instrumentCreatedObject("pushGeometry", geometry, true);
  }

  for (const insertionKey of [
    "addMesh",
    "addTransformNode",
    "addMaterial",
    "addLight",
    "pushGeometry",
  ] as const) {
    const originalOwnDescriptor = Object.getOwnPropertyDescriptor(
      sceneRecord,
      insertionKey,
    );
    const originalMethod = sceneRecord[insertionKey];
    if (typeof originalMethod !== "function") {
      throw new TypeError(`Scene.${insertionKey} is unavailable.`);
    }
    Object.defineProperty(sceneRecord, insertionKey, {
      configurable: true,
      enumerable: originalOwnDescriptor?.enumerable ?? false,
      value: function instrumentedCollectionInsertion(
        this: unknown,
        object: unknown,
        ...args: readonly unknown[]
      ): unknown {
        instrumentCreatedObject(insertionKey, object);
        return Reflect.apply(originalMethod, this, [object, ...args]);
      },
      writable: true,
    });
    restorers.push(() => {
      if (typeof originalOwnDescriptor === "undefined") {
        Reflect.deleteProperty(sceneRecord, insertionKey);
      } else {
        Object.defineProperty(sceneRecord, insertionKey, originalOwnDescriptor);
      }
    });
  }

  for (const key of BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1) {
    installOwnValueGuard(sceneRecord, key, recordViolation, restorers);
  }
  for (const key of BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_SETTER_KEYS_V1) {
    installOwnValueGuard(sceneRecord, key, recordViolation, restorers);
  }
  for (const key of BABYLON_NATIVE_FORBIDDEN_SCENE_PHYSICS_METHOD_KEYS_V1) {
    installOwnValueGuard(sceneRecord, key, recordViolation, restorers);
  }
  for (const key of ["activeCamera", "activeCameras", "actionManager"] as const) {
    installOwnValueGuard(sceneRecord, key, recordViolation, restorers);
  }
  installOwnValueGuard(
    engineRecord,
    "customAnimationFrameRequester",
    recordViolation,
    restorers,
  );
  for (const key of [
    ...BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1,
    ...BABYLON_NATIVE_FORBIDDEN_SCENE_PHYSICS_METHOD_KEYS_V1,
    ...BABYLON_NATIVE_FORBIDDEN_SCENE_INPUT_CAMERA_METHOD_KEYS_V1,
    "dispose",
  ]) {
    installOwnMethodGuard(sceneRecord, key, recordViolation, restorers);
  }
  for (const key of BABYLON_NATIVE_FORBIDDEN_SCENE_PHYSICS_METHOD_KEYS_V1) {
    guardedPhysicsMethodsByKey.set(key, sceneRecord[key]);
  }
  for (const key of ["runRenderLoop", "stopRenderLoop", "dispose"] as const) {
    installOwnMethodGuard(engineRecord, key, recordViolation, restorers);
  }

  return Object.freeze({
    audit(): readonly NativeSceneDiagnosticV1[] {
      const diagnostics = auditBabylonNativeSceneAuthoritySnapshotV1(snapshot);
      let createdObjectInvalid = false;
      for (const record of createdObjects) {
        for (const key of record.surface.observableKeys) {
          const observable = record.object[key];
          const baseline = record.observableBaselinesByKey.get(key);
          if (
            typeof baseline === "undefined" ||
            observable !== baseline.observable ||
            !isPublicObservableLike(observable) ||
            !sameOrderedReferences(
              observable.observers,
              record.allowedObserversByKey.get(key) ?? baseline.observers,
            )
          ) createdObjectInvalid = true;
        }
        for (const [key, baseline] of record.retainedCollectionsByKey) {
          const current = record.object[key];
          if (
            !Array.isArray(current) ||
            !isEmpty(current) ||
            !sameOrderedReferences(current, baseline)
          ) createdObjectInvalid = true;
        }
        for (const [key, readExpectedValue] of record.directValuesByKey) {
          if (record.object[key] !== readExpectedValue()) {
            createdObjectInvalid = true;
          }
        }
      }
      const expectedImageObservers = [
        ...imageProcessingBaseline.observableBaseline.observers,
        ...standardMaterialTransitions.map(({ observer }) => observer),
      ];
      const providerTransitionInvalid = standardMaterialTransitions.some(
        ({ observer, providerFunction, observerAddCount, directAssignmentCount }) =>
          isNil(observer) ||
          typeof providerFunction !== "function" ||
          observerAddCount !== 1 ||
          directAssignmentCount !== 1,
      ) || !sameOrderedReferences(
        imageProcessingBaseline.observableBaseline.observable.observers,
        expectedImageObservers,
      );
      const physicsGuardInvalid = [...guardedPhysicsMethodsByKey].some(
        ([key, expected]) => sceneRecord[key] !== expected,
      );
      return (
        violated ||
        createdObjectInvalid ||
        providerTransitionInvalid ||
        physicsGuardInvalid
      ) && isEmpty(diagnostics)
        ? Object.freeze([authorityMutationDiagnostic()])
        : diagnostics;
    },
    restore(): void {
      if (restored) return;
      restored = true;
      for (const restore of restorers.reverse()) restore();
    },
  });
}
