import {
  createCoreControlFeatureFactoryV1,
  createCoreSemanticActionFeatureFactoryV1,
  createMountedRelationshipFeatureFactoryV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import {
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  type GameplayDiagnosticV1,
} from "@whitebox-world/gameplay-contracts";
import {
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  BabylonRuntimeResidencyV1,
  BabylonWorldRuntime,
  createBabylonGameplayWorldPortV1,
  wrapBabylonRuntimeOwnedGameplayWorldPortV1,
  type BabylonNativeSceneModuleLoaderV1,
  type BabylonRuntimeProjectionV1,
  type BabylonWorldRuntimeInitializationStageV1,
  type SubjectAssetResolverV1,
} from "@whitebox-world/runtime-babylon";
import {
  RuntimeHost,
  runtimeWorldConfigurationFromVerifiedWorldPackageV1,
  type GameplayWorldAdapterFactoryV1,
  type GameplayWorldPortV1,
  type RuntimeCandidatePublicationGateInputV1,
  type RuntimeWorldAdapterDescriptorV1,
} from "@whitebox-world/runtime-host";
import type {
  BabylonNativeSceneContributionV1,
  BabylonNativeSceneModuleBundleManifestV1,
  FixedInputV1,
} from "@whitebox-world/runtime-contracts";
import type {
  BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import type {
  VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package/runtime-contract";
import { isEqual, isNil } from "lodash-es";

const PARTICIPANT_ID = "native-scene-participant";
const CONTROLLER_ENTITY_ID = "native-scene-controller";
const CONTROLLER_DEFINITION_REF =
  "worldkit://controller-definition/native-scene-playground.local@1";
const CONTROLLER_DEFINITION_HASH = sha256CanonicalJson({
  kind: "controller-definition",
  id: "native-scene-playground.local",
  version: 1,
  inputMode: "human",
  controlModel: "single-possessed-entity",
});
const GAMEPLAY_MODE_REF =
  "worldkit://gameplay-mode/native-scene.exploration@1";

interface RuntimeHandleV1 {
  readonly canvas: HTMLCanvasElement;
  readonly runtime: BabylonWorldRuntime;
  readonly port: GameplayWorldPortV1;
  readonly nativeAdmission: Readonly<{
    contribution: BabylonNativeSceneContributionV1;
    contributionHash: `sha256:${string}`;
  }>;
}

interface NativeRuntimeLifecycleEvidenceV1 {
  successfulRuntimeCreateCount: number;
}

export interface CreateNativeRuntimeHostOptionsV1 {
  readonly runtimeSessionId: string;
  readonly canvasHost: HTMLElement;
  readonly verifiedWorldPackage:
    VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly loadedSceneModule: BabylonNativeSceneModuleV1;
  readonly loadedSceneModuleBundleContentHash: Sha256HashV1;
  readonly subjectAssetResolver: SubjectAssetResolverV1;
  readonly onInitializationStage?: (
    stage: BabylonWorldRuntimeInitializationStageV1,
  ) => void;
}

function gameplayModeFactory(): GameplayModeV1 {
  return Object.freeze({
    gameplayModeRef: GAMEPLAY_MODE_REF,
    evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
  });
}

function diagnostic(
  code: GameplayDiagnosticV1["code"],
  message: string,
): GameplayDiagnosticV1 {
  return Object.freeze({ code, message });
}

function exactModuleLoader(
  verified: VerifiedBabylonNativeWorldPackageDirectoryV1,
  module: BabylonNativeSceneModuleV1,
  loadedModuleBundleContentHash: Sha256HashV1,
): BabylonNativeSceneModuleLoaderV1 {
  return Object.freeze({
    async load(
      request: Parameters<BabylonNativeSceneModuleLoaderV1["load"]>[0],
    ) {
      const manifest: BabylonNativeSceneModuleBundleManifestV1 =
        request.sceneModuleBundleManifest;
      if (
        request.sceneModuleBundleRef !== verified.sceneModuleBundleRef ||
        manifest.sceneModuleBundleRef !== verified.sceneModuleBundleRef ||
        !isEqual(manifest, verified.sceneModuleBundleManifest) ||
        manifest.bundleContentHash !== loadedModuleBundleContentHash ||
        sha256Bytes(request.sceneModuleBundleBytes) !==
          loadedModuleBundleContentHash
      ) {
        throw new Error("WORLDKIT_NATIVE_SCENE_MODULE_BUNDLE_MISMATCH");
      }
      return module;
    },
  });
}

export class NativeRuntimeHostV1 {
  private constructor(
    private readonly host: RuntimeHost,
    private readonly handles: BabylonRuntimeResidencyV1<RuntimeHandleV1>,
    private readonly lifecycleEvidence: NativeRuntimeLifecycleEvidenceV1,
    readonly controlledEntityId: string,
  ) {}

  static async create(
    options: CreateNativeRuntimeHostOptionsV1,
  ): Promise<NativeRuntimeHostV1> {
    const verified = options.verifiedWorldPackage;
    if (
      options.loadedSceneModuleBundleContentHash !==
        verified.sceneModuleBundleManifest.bundleContentHash
    ) {
      throw new Error("WORLDKIT_NATIVE_SCENE_MODULE_BUNDLE_MISMATCH");
    }
    const initialWorld =
      runtimeWorldConfigurationFromVerifiedWorldPackageV1(verified);
    const packageByRef = new Map([
      [initialWorld.worldBuildIdentity.worldPackageRef, verified] as const,
    ]);
    const handles = new BabylonRuntimeResidencyV1<RuntimeHandleV1>();
    const lifecycleEvidence: NativeRuntimeLifecycleEvidenceV1 = {
      successfulRuntimeCreateCount: 0,
    };
    const moduleLoader = exactModuleLoader(
      verified,
      options.loadedSceneModule,
      options.loadedSceneModuleBundleContentHash,
    );
    const adapterFactory: GameplayWorldAdapterFactoryV1 = Object.freeze({
      preflightConcurrentResidency(
        current: RuntimeWorldAdapterDescriptorV1,
        candidate: RuntimeWorldAdapterDescriptorV1,
      ) {
        if (!handles.canRetainCandidate(
          current.worldSessionId,
          candidate.worldSessionId,
        )) {
          return Object.freeze({
            status: "rejected" as const,
            diagnostic: diagnostic(
              "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
              "The Native Playground cannot retain another Candidate.",
            ),
          });
        }
        return Object.freeze({ status: "accepted" as const });
      },
      async create(descriptor: RuntimeWorldAdapterDescriptorV1) {
        const candidatePackage = packageByRef.get(
          descriptor.worldBuildIdentity.worldPackageRef,
        );
        if (isNil(candidatePackage)) {
          throw new Error("WORLDKIT_NATIVE_WORLD_PACKAGE_REF_UNRESOLVED");
        }
        const canvas = options.canvasHost.ownerDocument.createElement(
          "canvas",
        );
        canvas.setAttribute(
          "aria-label",
          "Babylon Native Package scene",
        );
        canvas.tabIndex = 0;
        canvas.hidden = handles.size > 0;
        options.canvasHost.prepend(canvas);
        let nativeAdmission: RuntimeHandleV1["nativeAdmission"] | undefined;
        let runtime: BabylonWorldRuntime;
        try {
          runtime = await BabylonWorldRuntime.create({
            worldRuntimeBootstrap: descriptor.worldRuntimeBootstrap,
            gameplayBootstrap: descriptor.gameplayBootstrap,
            sceneSource: {
              kind: "babylon-native-scene",
              descriptor,
              verifiedWorldPackage: candidatePackage,
              moduleLoader,
            },
            runtimeSessionId: descriptor.runtimeSessionId,
            canvas,
            autoStartRenderLoop: false,
            subjectAssetResolver: options.subjectAssetResolver,
            ...(isNil(options.onInitializationStage)
              ? {}
              : { onInitializationStage: options.onInitializationStage }),
            onNativeSceneAdmission(admission) {
              nativeAdmission = admission;
            },
          });
        } catch (error) {
          canvas.remove();
          throw error;
        }
        try {
          if (isNil(nativeAdmission)) {
            throw new Error("WORLDKIT_NATIVE_SCENE_ADMISSION_AUDIT_UNAVAILABLE");
          }
          let handle: RuntimeHandleV1;
          const ownedPort = wrapBabylonRuntimeOwnedGameplayWorldPortV1(
            createBabylonGameplayWorldPortV1(runtime, CONTROLLER_ENTITY_ID),
            () => {
              if (handles.release(descriptor.worldSessionId, handle)) {
                handle.canvas.remove();
              }
            },
          );
          handle = Object.freeze({
            canvas,
            runtime,
            port: ownedPort,
            nativeAdmission,
          });
          handles.retain(descriptor.worldSessionId, handle);
          lifecycleEvidence.successfulRuntimeCreateCount += 1;
          return ownedPort;
        } catch (error) {
          await runtime.dispose().catch(() => undefined);
          canvas.remove();
          throw error;
        }
      },
      async awaitCandidatePublicationReady(
        input: RuntimeCandidatePublicationGateInputV1,
      ) {
        const handle = handles.get(input.worldSessionId);
        if (isNil(handle)) {
          throw new Error("WORLDKIT_NATIVE_RUNTIME_HANDLE_NOT_FOUND");
        }
        await handle.runtime.renderFrameWhenReady();
      },
    });
    let worldSessionIndex = 0;
    const featureFactories = [
      createCoreControlFeatureFactoryV1(),
      createCoreSemanticActionFeatureFactoryV1(),
      createMountedRelationshipFeatureFactoryV1(),
    ].filter(({ manifest }) =>
      initialWorld.gameplayBootstrap.featureResourceLocks.some(
        ({ resourceRef }) => resourceRef === manifest.resourceRef,
      ));
    const host = await RuntimeHost.create({
      runtimeSessionId: options.runtimeSessionId,
      initialWorld,
      participantStates: [{ id: PARTICIPANT_ID, mode: "active" }],
      controllerStates: [{
        id: CONTROLLER_ENTITY_ID,
        kind: "controller-entity-state",
        controllerDefinitionRef: CONTROLLER_DEFINITION_REF,
        controllerDefinitionHash: CONTROLLER_DEFINITION_HASH,
        participantId: PARTICIPANT_ID,
        lifecycleMode: "active",
        inputMode: "human",
      }],
      fixedInputControllerEntityId: CONTROLLER_ENTITY_ID,
      gameplayModeFactory,
      gameplayFeatureFactories: featureFactories,
      gameplayCapacityBudget: {
        ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
        maximumRelationshipStateCount: Math.max(
          DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1.maximumRelationshipStateCount,
          initialWorld.gameplayBootstrap.entityDescriptors.length + 1,
        ),
      },
      runtimeHostCapacityBudget: {
        maximumWorldSessionCount: 1_024,
        maximumRuntimeActivityRecordCount: 256,
      },
      initialControlBinding: {
        controllerEntityId: CONTROLLER_ENTITY_ID,
        controlledEntityId:
          initialWorld.worldRuntimeBootstrap.initialControlledEntityId,
      },
      adapterFactory,
      worldSessionIdFactory: () =>
        `${options.runtimeSessionId}.world.${worldSessionIndex += 1}`,
    });
    const coordinator = new NativeRuntimeHostV1(
      host,
      handles,
      lifecycleEvidence,
      initialWorld.worldRuntimeBootstrap.initialControlledEntityId,
    );
    try {
      coordinator.activateCurrentCanvas();
      return coordinator;
    } catch (error) {
      await host.dispose().catch(() => undefined);
      throw error;
    }
  }

  runtime(): BabylonWorldRuntime {
    return this.activeHandle().runtime;
  }

  canvas(): HTMLCanvasElement {
    return this.activeHandle().canvas;
  }

  snapshot(): BabylonRuntimeProjectionV1 {
    return this.runtime().snapshot();
  }

  async runFixedInput(input: FixedInputV1): Promise<BabylonRuntimeProjectionV1> {
    await this.host.runFixedInput(input);
    return this.snapshot();
  }

  async reset(): Promise<BabylonRuntimeProjectionV1> {
    await this.host.resetWithInitialControlBinding({
      controllerEntityId: CONTROLLER_ENTITY_ID,
      controlledEntityId: this.controlledEntityId,
    });
    this.activateCurrentCanvas();
    return this.snapshot();
  }

  audit(): Readonly<{
    contributionHash: `sha256:${string}`;
    worldSessionId: string;
    successfulRuntimeCreateCount: number;
    spawnMarkerId: string;
    colliderIds: readonly string[];
    colliderSubshapeIds: readonly string[];
  }> {
    const admission = this.activeHandle().nativeAdmission;
    return Object.freeze({
      contributionHash: admission.contributionHash,
      worldSessionId: this.host.currentWorldSessionId,
      successfulRuntimeCreateCount:
        this.lifecycleEvidence.successfulRuntimeCreateCount,
      spawnMarkerId: admission.contribution.spawnMarker.id,
      colliderIds: Object.freeze(
        admission.contribution.staticColliders.map(({ id }) => id),
      ),
      colliderSubshapeIds: Object.freeze(
        admission.contribution.staticColliders.map(
          ({ colliderSubshapeId }) => colliderSubshapeId,
        ),
      ),
    });
  }

  dispose(): Promise<void> {
    return this.host.dispose();
  }

  private activeHandle(): RuntimeHandleV1 {
    return this.handles.active(this.host.currentWorldSessionId);
  }

  private activateCurrentCanvas(): void {
    const active = this.activeHandle();
    for (const handle of this.handles.values()) {
      handle.canvas.hidden = handle !== active;
    }
    active.runtime.resize();
  }
}
