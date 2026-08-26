import type { OutdoorSceneDefinition } from "@whitebox-world/world";

import { artifactWriteHeaders, loadArtifactWriteCapability } from "./artifact-write-capability.js";
import { BabylonWorldAdapter } from "./babylon-world-adapter.js";
import { loadOutdoorGameplaySceneV1 } from "./outdoor-scene-gameplay-loader.js";
import type {
  FeatureInspection,
  OpeningCompositionReport,
  PlanningViewKind,
  PlaygroundArtifactRenderer,
  PlaygroundWorldMetadataV1,
} from "./playground-world.js";
import {
  createFetchSubjectAssetResolver,
  PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1,
} from "./worldkit-asset-resolver.js";

export class BabylonArtifactRenderer implements PlaygroundArtifactRenderer {
  readonly name: string;
  private disposePromise: Promise<void> | null = null;

  private constructor(
    private readonly adapter: BabylonWorldAdapter,
    private readonly metadata: PlaygroundWorldMetadataV1,
  ) {
    this.name = `babylon-artifact/${metadata.sceneCatalogId}`;
    this.adapter.setPaused(true);
  }

  static async createArtifactRenderer(
    sceneDefinition: OutdoorSceneDefinition,
    sceneCatalogId: string,
  ): Promise<BabylonArtifactRenderer> {
    const loaded = await loadOutdoorGameplaySceneV1(sceneDefinition, {
      sceneCatalogId,
    });
    if (
      !loaded.ok ||
      loaded.runtimeWorldConfiguration === undefined ||
      loaded.playgroundMetadata === undefined
    ) {
      throw new Error(
        `WORLDKIT_BABYLON_ARTIFACT_LOAD_FAILED: ${loaded.diagnostics
          .map((diagnostic) => diagnostic.code)
          .join(",")}`,
      );
    }
    const adapter = await BabylonWorldAdapter.create(
      loaded.runtimeWorldConfiguration,
      {
        playgroundMetadata: loaded.playgroundMetadata,
        ...(loaded.gameplayActionRequestResolver === undefined
          ? {}
          : {
              gameplayActionRequestResolver:
                loaded.gameplayActionRequestResolver,
            }),
        subjectAssetResolver: createFetchSubjectAssetResolver(
          PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1,
        ),
      },
    );
    return new BabylonArtifactRenderer(adapter, loaded.playgroundMetadata);
  }

  /** Test seam for lifecycle ownership; production construction stays validated above. */
  static fromAdapterForTest(
    adapter: BabylonWorldAdapter,
    metadata: PlaygroundWorldMetadataV1,
  ): BabylonArtifactRenderer {
    return new BabylonArtifactRenderer(adapter, metadata);
  }

  get canvas(): HTMLCanvasElement {
    return this.adapter.canvas;
  }

  mount(container: HTMLElement): void {
    this.adapter.mount(container);
  }

  render(): void {
    this.adapter.render();
  }

  restoreOpeningView(): void {
    this.adapter.resetCameraViewRuntime();
    this.adapter.render();
  }

  captureScreenshot(): string {
    return this.adapter.captureScreenshot();
  }

  captureCompositionMask(): string {
    return this.adapter.captureCompositionMask();
  }

  analyzeOpeningComposition(): OpeningCompositionReport | null {
    return this.adapter.analyzeOpeningComposition();
  }

  async exportOpeningFrame(report?: OpeningCompositionReport): Promise<string> {
    const worldSpec = this.getWorldSpec();
    if (worldSpec === null) throw new Error("WorldSpec is unavailable.");
    this.restoreOpeningView();
    const resolvedReport = report ?? this.analyzeOpeningComposition();
    if (resolvedReport === null) throw new Error("Opening composition guide is unavailable.");
    const capability = await loadArtifactWriteCapability();
    const response = await fetch("/__whitebox/write-opening-frame", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: artifactWriteHeaders(capability),
      body: JSON.stringify({
        sceneId: worldSpec.id,
        dataUrl: this.adapter.captureOpeningFrameDataUrl(),
        report: resolvedReport,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to export opening frame: ${await response.text()}`);
    }
    return (await response.json() as { path: string }).path;
  }

  getWorldSpec() {
    return this.adapter.getWorldSpec();
  }

  getPlanArtifacts() {
    return this.adapter.getPlanArtifacts();
  }

  capturePlanningView(kind: PlanningViewKind): string {
    return this.adapter.capturePlanningView(kind);
  }

  getVisualPrototypes() {
    return this.adapter.getVisualPrototypes();
  }

  captureWhiteboxTriview(prototypeId: string): string {
    return this.adapter.captureWhiteboxTriview(prototypeId);
  }

  async exportWhiteboxTriviews(): Promise<readonly string[]> {
    const worldSpec = this.getWorldSpec();
    if (worldSpec === null) throw new Error("WorldSpec is unavailable.");
    const capability = await loadArtifactWriteCapability();
    const paths: string[] = [];
    for (const prototype of worldSpec.entityCatalog.prototypes) {
      const response = await fetch("/__whitebox/write-triview", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: artifactWriteHeaders(capability),
        body: JSON.stringify({
          sceneId: worldSpec.id,
          prototypeId: prototype.id,
          dataUrl: this.captureWhiteboxTriview(prototype.id),
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to export ${prototype.id}: ${await response.text()}`);
      }
      paths.push((await response.json() as { path: string }).path);
    }
    return paths;
  }

  inspectFeatures(): readonly FeatureInspection[] {
    return this.metadata.featureInspections;
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== null) return this.disposePromise;
    this.disposePromise = this.adapter.disposeRuntime();
    return this.disposePromise;
  }
}
