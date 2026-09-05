import "./style.css";
import { createFormalCaptureStartupReporterV1, type FormalCaptureStartupStageV1 } from "@whitebox-world/runtime-babylon";

import { createSubjectPresetCandidateFromSelectionsV1 } from "@whitebox-world/authoring";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import type {
  CameraTuningParameterNameV1,
  CameraTuningV1,
  CompatibleProfileSummaryV1,
  ControlTuningV1,
  MotionKernelSummaryV1,
  VisualCaptureGroupV1,
  SemanticInputActionV1,
  SubjectDefinitionSummaryV1,
  WorldRuntimeSnapshotV4,
  WorldRuntimeSubjectStateV4,
  WorldkitBrowserApiV5,
} from "@whitebox-world/runtime-contracts";
import { CAMERA_TUNING_SAFETY_LIMITS_V1 } from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

import { CanvasRecorder } from "./canvas-recorder.js";
import { installFeatureListWindow } from "./feature-list-window.js";
import {
  installRecordingWorkbench,
  recordingWorkbenchSceneId,
} from "./recording-workbench.js";
import type {
  FeatureInspection,
  OpeningCompositionReport,
  PlanningViewKind,
  PlaygroundArtifactAutomationApiV1,
  PlaygroundArtifactRenderer,
  PlaygroundAutomationApi,
  PlaygroundWorldAdapter,
  WorldSnapshot,
} from "./playground-world.js";
import type { BabylonWorldAdapter } from "./babylon-world-adapter.js";
import type { CapabilityDemoHostOverlayV1 } from "./authoring-loader.js";
import { withCapabilityDemoHarnessScope, loadTrustedSourceCommitV1 } from "./authoring-export.js";
import { createFetchSubjectAssetResolver, PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1 } from "./worldkit-asset-resolver.js";
import {
  installDeferredWorldkitBrowserApi,
  listSubjectPresetAuthoringProfilesV1,
  type DeferredWorldkitBrowserRuntimeAdapterV1,
} from "./worldkit-browser-api.js";
import {
  createSubjectPresetLocalRepository,
  type SubjectPresetLocalBaselineV1,
  type SubjectPresetWorkingDraftV1,
} from "./subject-preset-local.js";
import {
  applySubjectPresetWorkingDraftTransactionV1,
  cameraPreviewRequestFromDraftV1,
  createSubjectPresetWorkbenchDraftV1,
  subjectPresetTuningRequestFromDraftV1,
} from "./subject-preset-workbench.js";
import {
  resolvePlaygroundRuntimeRoute,
  type PlaygroundViewerSourceAuthorityV1,
} from "./playground-runtime-route.js";
import { sceneCatalog } from "./scenes/index.js";
import { createGameplayPageLifecycle } from "./gameplay-page-lifecycle.js";
import { createAndStartArtifactRenderer } from "./artifact-renderer-lifecycle.js";
import { installPageExitDisposal } from "./page-exit-lifecycle.js";
import { installWorldkitAuthoringCaptureApi } from "./worldkit-authoring-capture-api.js";
import { initializePlaygroundAdapterV1 } from "./playground-adapter-startup.js";
import { createIndexedDbWorldPackageStoreV1 } from "./indexeddb-world-package-store.js";
import {
  loadViewerBootstrapV1,
  viewerSceneSelectionUrlV1,
  type ViewerBootstrapV1,
} from "./viewer-bootstrap.js";

declare const __WORLDKIT_VIEWER_SOURCE_AUTHORITY__:
  PlaygroundViewerSourceAuthorityV1;

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("Missing #app container");
const urlParameters = new URLSearchParams(window.location.search);
const hostStudioWorldId = document
  .querySelector<HTMLMetaElement>('meta[name="worldkit-studio-world-id"]')
  ?.content;
const runtimeRoute = resolvePlaygroundRuntimeRoute(
  window.location.search,
  sceneCatalog,
  __WORLDKIT_VIEWER_SOURCE_AUTHORITY__,
  hostStudioWorldId,
);
const viewerMode = runtimeRoute.mode === "viewer";
let cameraViewCommandSequence = 0;

async function executeCameraPreference(
  api: WorldkitBrowserApiV5,
  preference?: import("@whitebox-world/runtime-contracts").CameraViewPreferenceV1,
): Promise<void> {
  const snapshot = api.getSnapshot();
  if (snapshot.view.camera.mode !== "tracking") {
    throw new Error("CAMERA_ENTITY_STALE");
  }
  cameraViewCommandSequence += 1;
  const receipt = await api.executeCameraViewCommand({
    type: preference === undefined
      ? "view.camera-preference.reset"
      : "view.camera-preference.set",
    schemaVersion: 1,
    id: `browser-camera-view-command-${cameraViewCommandSequence}`,
    runtimeSessionId: snapshot.runtimeSessionId,
    worldSessionId: snapshot.worldSessionId,
    cameraEntityId: snapshot.view.camera.id,
    ...(preference === undefined ? {} : { cameraViewPreference: preference }),
  } as import("@whitebox-world/runtime-contracts").CameraViewCommandV1);
  if (receipt.status !== "committed") throw new Error(receipt.diagnostic.code);
}

function createAuthoringPanelRuntimeApi(
  publicApi: WorldkitBrowserApiV5,
  adapter: DeferredWorldkitBrowserRuntimeAdapterV1,
): WorldkitBrowserApiV5 {
  const setupApi: WorldkitBrowserApiV5 = {
    ...publicApi,
    getSnapshot: () => adapter.runtimeSnapshot(),
    executeCameraViewCommand: (command) =>
      adapter.executeCameraViewCommandRuntime(command),
    resetCameraView: () => adapter.resetCameraViewRuntime(),
    getCameraPreviewState: () => adapter.getCameraPreviewStateRuntime(),
    applyCameraPreview: (request) => adapter.applyCameraPreviewRuntime(request),
    applySubjectPresetTuning: (request) =>
      adapter.applySubjectPresetTuningRuntime(request),
    setMotionProfile: (subjectEntityId, motionProfileRef) =>
      adapter.setMotionProfileRuntime(subjectEntityId, motionProfileRef),
    runHarness: (subjectEntityId) => adapter.runSubjectHarness(subjectEntityId),
    getSubjectSnapshot: (subjectEntityId) =>
      adapter.runtimeSnapshot().world.subjectStatesByEntityId[subjectEntityId],
    getCameraSnapshot: () => adapter.runtimeSnapshot().view.camera,
  };
  return Object.freeze(setupApi);
}

interface AuthoringStartupDebugV1 {
  stage: string;
  errorName: string;
  errorMessage: string;
}

let authoringStartupDebug: AuthoringStartupDebugV1 | undefined;

app.innerHTML = `
  <main class="shell${viewerMode ? " viewer-shell" : ""}">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <p class="eyebrow">AGENT WHITEBOX WORLD</p>
          <h1>${viewerMode ? "Runtime Playground" : "World Viewer"} <span>α</span></h1>
        </div>
      </div>
      <div class="topbar-actions">
        <label class="scene-picker" id="scene-picker" hidden>
          <span>场景</span><select id="scene-select" aria-label="选择调试场景"></select>
        </label>
        <span class="status"><i></i><span id="adapter-name">adapter</span></span>
        ${viewerMode ? '<button class="button button-tuning" id="open-tuning-button" type="button" aria-controls="tuning-layer" aria-expanded="false" hidden>调参台</button>' : ''}
        <button class="button button-subtle" id="reset-button" type="button">重置世界</button>
        <button class="button button-record" id="record-button" type="button" aria-pressed="false" title="仅录制 3D 渲染画面，不包含界面">
          <i class="record-dot" aria-hidden="true"></i><span id="record-label">录制画面</span>
        </button>
        <button class="button button-primary" id="capture-button" type="button">保存截图</button>
        ${viewerMode ? `
          <div class="topbar-more">
            <button class="button button-subtle" id="more-actions-button" type="button" aria-haspopup="menu" aria-expanded="false">更多 <span aria-hidden="true">⋮</span></button>
            <div class="topbar-more-menu" id="more-actions-menu" role="menu" hidden>
              <button type="button" role="menuitem" data-action-proxy="#smoke-button">固定输入 Smoke</button>
              <button type="button" role="menuitem" data-action-proxy="#composition-button">首帧构图验收</button>
              <button type="button" role="menuitem" data-action-proxy="#triview-button">导出白膜三视图</button>
            </div>
          </div>
        ` : ""}
      </div>
    </header>

    ${viewerMode ? `
      <section class="authoring-context-bar" id="authoring-context-bar" aria-label="3C 调试上下文" hidden>
        <label class="context-subject-field">
          <span>当前主体</span>
          <select id="subject-package-select" aria-label="当前主体"></select>
        </label>
        <div class="context-divider" aria-hidden="true"></div>
        <div class="context-camera-field">
          <span>相机视角</span>
          <div class="camera-mode-buttons" role="group" aria-label="相机视角">
            <button id="camera-third-person-button" type="button" aria-pressed="true">第三人称</button>
          </div>
          <select id="camera-preference-select" aria-label="相机预制"></select>
        </div>
        <div class="context-divider" aria-hidden="true"></div>
        <label class="context-viewport-field">
          <span>视窗比例</span>
          <select id="viewport-aspect-select" aria-label="视窗比例">
            <option value="free">自由</option>
            <option value="16:9">16:9</option>
            <option value="16:10">16:10</option>
            <option value="4:3">4:3</option>
            <option value="21:9">21:9</option>
          </select>
        </label>
        <div class="context-divider" aria-hidden="true"></div>
        <div class="context-preview-field">
          <div class="preview-mode-buttons" role="group" aria-label="预览状态">
            <button id="preview-baseline-button" type="button" aria-pressed="false">Baseline</button>
            <button id="preview-draft-button" type="button" aria-pressed="true">Draft</button>
          </div>
          <span class="draft-preview-status" id="draft-preview-status"><i aria-hidden="true"></i> Draft Preview</span>
        </div>
      </section>
    ` : ""}

    <section class="workspace${viewerMode ? " viewer-workspace" : ""}">
      <div class="viewport-panel">
        <div class="viewport-stage" id="viewport-stage">
          <div class="viewport" id="viewport">
          <div class="scene-badge">WHITEBOX / LOCAL PREVIEW</div>
          <div class="reticle" aria-hidden="true"></div>
          <div class="hud" aria-live="polite">
            <div class="hud-card"><span>FPS</span><strong id="fps">—</strong></div>
            <div class="hud-card"><span>TICK</span><strong id="tick">0</strong></div>
            <div class="hud-card hud-wide"><span id="controlled-entity-label">PLAYER</span><strong id="player-position">0.0 / 0.0 / 0.0</strong></div>
            <div class="hud-card"><span>ACTION</span><strong id="player-action">IDLE</strong></div>
          </div>
          <div class="controls-card" id="controls-card">
            <p>移动控制</p>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span></div>
            <div><kbd>⇧</kbd><span>奔跑</span><kbd>空格</kbd><span>跳跃</span></div>
            ${viewerMode
              ? '<div><span>右侧 Camera Preference</span><span>切换镜头</span></div>'
              : '<div><kbd>↑</kbd><kbd>↓</kbd><span>上下移动视角</span></div><div><span class="mouse-icon">↖</span><span>拖拽镜头</span></div><div><span class="wheel-icon">↕</span><span>滚轮缩放</span></div>'}
          </div>
          <div class="mounted-controls" id="mounted-controls" hidden></div>
          <button class="pause-button" id="pause-button" type="button" aria-label="暂停模拟">Ⅱ</button>
          <div class="recording-indicator" id="recording-indicator" aria-live="polite" hidden>
            <i aria-hidden="true"></i><span>REC</span><time id="recording-time">00:00</time>
          </div>
            <div class="recording-toast" id="recording-toast" role="status" hidden></div>
          </div>
        </div>
        ${viewerMode ? `
          <footer class="viewport-footer runtime-test-strip">
            <div class="runtime-quick-actions" aria-label="快速手感测试">
              <button id="quick-forward-button" type="button">前进</button>
              <button id="quick-run-button" type="button">奔跑</button>
              <button id="quick-turn-button" type="button">转向</button>
              <button id="quick-jump-button" type="button">跳跃</button>
              <button id="quick-recenter-button" type="button">相机回正</button>
            </div>
            <div class="runtime-telemetry" aria-live="polite">
              <span class="runtime-essential">FPS <strong id="runtime-fps">—</strong></span>
              <span>速度 <strong id="runtime-speed">0.0 m/s</strong></span>
              <strong id="runtime-gait">IDLE</strong>
              <strong id="runtime-medium">GROUND</strong>
              <strong id="runtime-support">SUPPORTED</strong>
              <span>FOV <strong id="runtime-fov">—</strong></span>
              <span>DIST <strong id="runtime-distance">—</strong></span>
              <span class="runtime-essential">VERSION <strong id="runtime-version">API —</strong></span>
            </div>
          </footer>
        ` : `
          <footer class="viewport-footer">
            <span><i class="dot terrain"></i> Terrain mesh</span>
            <span><i class="dot surface"></i> Water surface</span>
            <span><i class="dot collider"></i> Collider contract</span>
            <span class="footer-note">Protocol · Subject Definition · Babylon · Havok</span>
          </footer>
        `}
      </div>

      <aside class="inspector">
        <div id="recording-workbench-root"></div>
        <div class="inspector-heading">
          <div><p class="eyebrow">FEATURE GRAPH</p><h2>世界检查器</h2></div>
          <span id="feature-count">0 FEATURES</span>
        </div>
        <div class="feature-list" id="feature-list"></div>
        <div class="inspection" id="inspection">
          <p class="empty-state">选择一个 Feature 查看参数、资源归属与诊断。</p>
        </div>
        <div class="automation-card">
          <div><p>Automation API</p><code>window.__WHITEBOX_PLAYGROUND__</code></div>
          <button id="smoke-button" type="button">运行固定输入 Smoke</button>
          <button id="composition-button" type="button">运行首帧构图验收</button>
          <button id="triview-button" type="button">导出白膜三视图</button>
          <pre id="smoke-output">ready</pre>
          <img id="composition-mask" alt="Opening composition semantic mask" hidden />
        </div>
        <div class="capability-card" id="capability-card" hidden>
          <div class="capability-card-heading">
            <div><p>CAPABILITY AUTHORING</p><strong>主体 / 运动 / 相机</strong></div>
            <span>T0–T2</span>
          </div>
          ${viewerMode ? "" : '<label>Subject Package<select id="subject-package-select"></select></label>'}
          <div class="capability-context" id="capability-context"></div>
          ${viewerMode ? "" : '<label>Camera Preference<select id="camera-preference-select"></select></label>'}
          <div class="parameter-drafts" id="parameter-drafts"></div>
          <div class="capability-actions">
            ${viewerMode ? "" : '<button class="capability-open-button" id="open-tuning-panel-button" type="button">打开大尺寸调控台</button>'}
            <button id="fallback-button" type="button">注入 Safe Fallback</button>
            <button id="harness-button" type="button">运行 H01–H09</button>
            <button id="export-package-button" type="button">导出 Candidate JSON</button>
          </div>
          <pre id="harness-output">ready</pre>
        </div>
      </aside>
    </section>
  </main>
  ${viewerMode ? `
    <div class="tuning-layer" id="tuning-layer" hidden>
      <aside class="tuning-workbench" aria-labelledby="tuning-title">
        <header class="tuning-header">
          <h2 id="tuning-title">移动手感</h2>
          <button class="tuning-close" id="close-tuning-button" type="button" aria-label="收起调参台">⌃</button>
        </header>
        <nav class="tuning-nav" aria-label="调参类别" role="tablist">
          <button id="tuning-tab-movement" type="button" role="tab" aria-controls="tuning-panel-movement" aria-selected="true">移动</button>
          <button id="tuning-tab-camera" type="button" role="tab" aria-controls="tuning-panel-camera" aria-selected="false">相机</button>
        </nav>
        <div class="tuning-content">
          <section class="tuning-tab-panel" id="tuning-panel-movement" role="tabpanel" aria-labelledby="tuning-tab-movement">
            <div class="parameter-boundary" id="movement-parameter-boundary">
              <strong>候选配置</strong>
              <span>数值会保存到候选配置，导出并重新编译后生效；下方快捷操作体验当前 Runtime 配置。</span>
            </div>
            <section class="tuning-section" id="tuning-motion">
              <div class="friendly-slider-grid" id="tuning-motion-sliders"></div>
            </section>
            <details class="tuning-advanced">
              <summary>高级参数 <span>空中控制与跳跃容错</span></summary>
              <section class="tuning-section">
                <div class="friendly-slider-grid" id="tuning-motion-advanced-sliders"></div>
              </section>
            </details>
          </section>
          <section class="tuning-tab-panel" id="tuning-panel-camera" role="tabpanel" aria-labelledby="tuning-tab-camera" hidden>
            <section class="tuning-section" id="tuning-camera">
              <div class="tuning-section-heading"><div><h3>相机预览</h3><p>当前仅开放第三人称；镜头数值通过现有 Camera Preview 通道实时生效。</p></div></div>
            <div class="camera-instructions"><span>鼠标左键拖动</span>旋转 <span>滚轮</span>缩放 <button id="reset-camera-view-button" type="button">镜头回正</button></div>
            <div class="camera-card-grid" id="tuning-camera-cards"></div>
            <section class="camera-inspector-section" id="tuning-camera-basic" aria-labelledby="tuning-camera-basic-title"><h4 id="tuning-camera-basic-title">基础 · 取景与操控</h4><div class="friendly-slider-grid camera-tuning-grid"></div></section>
              <details class="tuning-advanced camera-advanced">
                <summary>高级参数 <span>响应 / Follow / Collision / Lag</span></summary>
                <section class="camera-inspector-section" id="tuning-camera-expert" aria-labelledby="tuning-camera-expert-title"><h4 id="tuning-camera-expert-title">专家 · Follow Arm / Collision / Lag</h4><div class="camera-expert-groups"></div></section>
                <section class="camera-inspector-section camera-runtime-diagnostics" id="tuning-camera-runtime" aria-labelledby="tuning-camera-runtime-title"><div class="camera-diagnostics-heading"><div><h4 id="tuning-camera-runtime-title">运行时诊断（只读）</h4><p>P1.5 只发布 ground / air；水面规则在当前运行时不可用。</p></div><button id="tuning-camera-overlay-toggle" type="button" aria-pressed="false">显示开发 Overlay</button></div><section aria-labelledby="tuning-camera-input-debug-title"><h5 id="tuning-camera-input-debug-title">Input Debug（只读）</h5><dl id="tuning-camera-input-debug"></dl></section><dl id="tuning-camera-diagnostics"></dl><div id="tuning-camera-overlay" hidden aria-live="polite"></div></section>
                <section class="camera-inspector-section camera-publish-boundary" id="tuning-camera-publish" aria-labelledby="tuning-camera-publish-title"><h4 id="tuning-camera-publish-title">发布边界</h4><p>相机偏好和微调保存在本地草稿；不会直接改写 Gameplay 或已锁定 Profile。</p></section>
              </details>
            </section>
          </section>
          <div class="tuning-support" hidden>
            <button id="open-tuning-panel-button" type="button">打开调参台</button>
            <select id="tuning-motion-select"></select>
            <section id="tuning-subject"><select id="tuning-subject-select" disabled></select><div id="tuning-subject-summary"></div></section>
            <section id="tuning-input"><div id="tuning-input-capabilities"></div><div id="tuning-input-status">等待试跑</div></section>
            <section id="tuning-versions"><input id="tuning-version-name" type="text"><textarea id="tuning-version-notes"></textarea><button id="tuning-save-version-button" type="button">保存</button><div id="tuning-version-list"></div></section>
            <section id="tuning-delivery"><button id="tuning-harness-button" type="button">运行自动检查</button><button id="tuning-export-button" type="button">导出 Candidate JSON</button><pre id="tuning-result">尚未运行检查</pre></section>
          </div>
        </div>
        <footer class="tuning-footer">
          <span id="tuning-save-status">候选配置会自动保存 · 导出后生效</span>
          <div><button id="tuning-reset-draft-button" type="button">重置草稿</button><button class="primary" id="tuning-export-footer-button" type="button">导出候选配置</button></div>
        </footer>
      </aside>
    </div>
  ` : ''}
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function syncContextCameraButtons(preference: string): void {
  if (!viewerMode) return;
  const thirdPerson = requiredElement<HTMLButtonElement>("#camera-third-person-button");
  thirdPerson.setAttribute(
    "aria-pressed",
    String(preference === CAMERA_CONSOLE_DEFAULT_PROFILE_REF),
  );
}

function syncContextPreviewMode(mode: "baseline" | "draft"): void {
  if (!viewerMode) return;
  const isDraft = mode === "draft";
  requiredElement<HTMLButtonElement>("#preview-baseline-button")
    .setAttribute("aria-pressed", String(!isDraft));
  requiredElement<HTMLButtonElement>("#preview-draft-button")
    .setAttribute("aria-pressed", String(isDraft));
  const status = requiredElement<HTMLSpanElement>("#draft-preview-status");
  status.classList.toggle("is-baseline", !isDraft);
  status.lastChild!.textContent = isDraft ? " Draft Preview" : " Baseline Preview";
}

function installViewerChrome(): void {
  if (!viewerMode) return;
  const moreButton = requiredElement<HTMLButtonElement>("#more-actions-button");
  const menu = requiredElement<HTMLDivElement>("#more-actions-menu");
  const setMenuOpen = (open: boolean): void => {
    menu.hidden = !open;
    moreButton.setAttribute("aria-expanded", String(open));
  };
  moreButton.addEventListener("click", () => setMenuOpen(menu.hidden));
  menu.querySelectorAll<HTMLButtonElement>("[data-action-proxy]").forEach((button) => {
    button.addEventListener("click", () => {
      const selector = button.dataset.actionProxy;
      if (selector !== undefined) document.querySelector<HTMLButtonElement>(selector)?.click();
      setMenuOpen(false);
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (menu.hidden || event.target instanceof Node && menu.contains(event.target)) return;
    if (event.target instanceof Node && moreButton.contains(event.target)) return;
    setMenuOpen(false);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") setMenuOpen(false);
  });

  const viewportStage = requiredElement<HTMLDivElement>("#viewport-stage");
  const viewport = requiredElement<HTMLDivElement>("#viewport");
  const aspectSelect = requiredElement<HTMLSelectElement>("#viewport-aspect-select");
  const aspectRatios: Readonly<Record<string, number | undefined>> = {
    free: undefined,
    "16:9": 16 / 9,
    "16:10": 16 / 10,
    "4:3": 4 / 3,
    "21:9": 21 / 9,
  };
  const storedAspect = readLocalDraft("worldkit.viewport-aspect-ratio");
  if (storedAspect !== null && Object.hasOwn(aspectRatios, storedAspect)) {
    aspectSelect.value = storedAspect;
  }
  const syncViewportAspect = (): void => {
    const ratio = aspectRatios[aspectSelect.value];
    if (ratio === undefined) {
      viewport.style.width = "100%";
      viewport.style.height = "100%";
      return;
    }
    const availableWidth = viewportStage.clientWidth;
    const availableHeight = viewportStage.clientHeight;
    const width = Math.min(availableWidth, availableHeight * ratio);
    viewport.style.width = `${width}px`;
    viewport.style.height = `${width / ratio}px`;
  };
  aspectSelect.addEventListener("change", () => {
    writeLocalDraft("worldkit.viewport-aspect-ratio", aspectSelect.value);
    syncViewportAspect();
  });
  new ResizeObserver(syncViewportAspect).observe(viewportStage);
  syncViewportAspect();
}

installViewerChrome();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readLocalDraft(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalDraft(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Authoring must remain usable when storage is blocked or full.
  }
}

function authoringActionFailure(): string {
  return JSON.stringify(
    {
      severity: "error",
      code: "WORLDKIT_AUTHORING_ACTION_FAILED",
      message: "The authoring action could not be completed. Runtime state was preserved.",
    },
    null,
    2,
  );
}

function captureAuthoringStartupFailure(stage: string, error: unknown): void {
  authoringStartupDebug = {
    stage,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}

function authoringStartupEvidence(
  api: WorldkitBrowserApiV5,
): { diagnostics: ReturnType<WorldkitBrowserApiV5["getDiagnostics"]>; developer: AuthoringStartupDebugV1 | null } {
  return {
    diagnostics: api.getDiagnostics(),
    developer: authoringStartupDebug ?? null,
  };
}

const viewport = requiredElement<HTMLDivElement>("#viewport");
const featureList = requiredElement<HTMLDivElement>("#feature-list");
const inspection = requiredElement<HTMLDivElement>("#inspection");

function installViewerSceneSelector(bootstrap: ViewerBootstrapV1): void {
  const picker = requiredElement<HTMLLabelElement>("#scene-picker");
  const select = requiredElement<HTMLSelectElement>("#scene-select");
  if (bootstrap.selection.kind !== "curated-preset") {
    picker.hidden = true;
    select.replaceChildren();
    return;
  }
  select.replaceChildren(...bootstrap.selection.entries.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.title;
    option.selected = entry.id === bootstrap.selection.selectedSceneId;
    return option;
  }));
  select.addEventListener("change", () => {
    window.location.assign(viewerSceneSelectionUrlV1(
      window.location.href,
      select.value,
      bootstrap.selection.kind === "curated-preset"
        ? bootstrap.selection.entries
        : [],
    ));
  }, { once: true });
  picker.hidden = false;
}

const FRIENDLY_MOTION_PARAMETERS: Readonly<Record<string, readonly [string, string]>> = {
  walkSpeedMetersPerSecond: ["行走速度", "不按 Shift 时的移动速度"],
  runSpeedMetersPerSecond: ["奔跑速度", "按住 Shift 时的移动速度"],
  forwardSpeedMetersPerSecond: ["最高前进速度", "持续向前时可以达到的速度"],
  reverseSpeedMetersPerSecond: ["最高倒退速度", "持续倒退时可以达到的速度"],
  maximumSpeedMetersPerSecond: ["最高速度", "限制主体不会无限加速"],
  minimumForwardSpeedMetersPerSecond: ["最低滑翔速度", "低于它时会更容易下坠"],
  maximumForwardSpeedMetersPerSecond: ["最高滑翔速度", "滑翔过程的速度上限"],
  jumpSpeedMetersPerSecond: ["跳跃力度", "数值越高，起跳高度越高"],
  accelerationMetersPerSecondSquared: ["加速度", "数值越高，达到目标速度越快"],
  driveAccelerationMetersPerSecondSquared: ["推进力度", "数值越高，滑行起步越快"],
  glideAccelerationMetersPerSecondSquared: ["滑翔加速", "向前滑翔时累积速度的快慢"],
  decelerationMetersPerSecondSquared: ["停止减速度", "松开方向键后停下来的快慢"],
  brakeMetersPerSecondSquared: ["制动力度", "按 Ctrl 或当前主体的制动键时停下来的快慢"],
  turnRateRadiansPerSecond: ["转向速度", "数值越高，转弯越灵敏"],
  moveResponseExponent: ["移动输入曲线", "数值越高，斜向或小幅输入越柔和，满输入仍保持最高速度"],
  lowSpeedTurnRateRadiansPerSecond: ["低速转向", "慢速时方向盘的灵敏度"],
  highSpeedTurnRateRadiansPerSecond: ["高速转向", "高速时方向盘的灵敏度"],
  steeringResponsePerSecond: ["方向输入渐变", "数值越低，按下 A/D 后方向越慢打满"],
  steeringReturnPerSecond: ["松手回正速度", "松开 A/D 后方向盘回到中间的速度"],
  fullSteeringAuthoritySpeedMetersPerSecond: ["完整转向所需车速", "车速达到这里后才获得完整转向权限"],
  turnRateSpeedCurveExponent: ["高低速转向曲线", "控制低速转向过渡到高速转向的节奏"],
  pitchRateRadiansPerSecond: ["俯仰速度", "抬头和俯冲的反应速度"],
  yawRateRadiansPerSecond: ["偏航速度", "左右改变飞行方向的反应速度"],
  rollRateRadiansPerSecond: ["倾斜速度", "机体左右倾斜的反应速度"],
  dragPerSecond: ["移动阻力", "数值越高，松手后越快慢下来"],
  surfaceFrictionPerSecond: ["地面摩擦", "数值越低，冰面滑行距离越长"],
  airControlRatio: ["空中控制力", "跳起后还能改变方向的程度"],
  gravityScale: ["重力影响", "数值越高，下坠越明显"],
  liftRatio: ["升力效率", "速度转换为升力的效率"],
  slopeGravityRatio: ["坡度影响", "斜坡对滑行加速的影响程度"],
  surfaceHoldStrengthPerSecond: ["贴水稳定度", "主体保持在水面附近的力度"],
  stallSpeedMetersPerSecond: ["失速速度", "低于它时升力明显不足"],
  boostMultiplier: ["Shift 加速倍率", "按住 Shift 后速度放大的倍数"],
  coyoteTimeSeconds: ["离地宽容时间", "刚离开台阶后仍允许跳跃的短暂时间"],
  jumpBufferSeconds: ["跳跃预输入时间", "落地前提前按跳跃时，系统可以记住输入多久"],
  variableJumpHoldSeconds: ["长按跳跃有效时间", "按住跳跃可以继续减弱重力的最长时间"],
  jumpHoldGravityScale: ["长按跳跃重力", "越低，按住空格时上升更持久"],
  jumpReleaseGravityScale: ["松开跳跃重力", "越高，提前松开空格后下落越干脆"],
  maximumSlopeDegrees: ["可行走最大坡度", "超过该坡度时不再当作正常地面"],
  stepHeightMeters: ["自动跨台阶高度", "主体无需跳跃即可跨过的小台阶高度"],
  minimumSteeringAuthorityRatio: ["最低转向权限", "低速仍保留的转向比例；设为 0 可完全禁止原地转向"],
  bodyLeanMaximumRadians: ["转弯身体倾斜", "四足等主体转向时视觉倾斜的上限；设为 0 关闭"],
  steeringDeadzoneRatio: ["转向输入死区", "忽略很小的方向输入，避免手柄漂移；键盘也复用同一规则"],
  steeringInputExponent: ["转向输入曲线", "大于 1 时小幅方向更精细，接近打满时仍可达到最大转向"],
  lateralGripPerSecond: ["车辆侧向抓地", "越高越贴路线，越低越容易侧滑"],
  handbrakeLateralGripPerSecond: ["手刹时侧向抓地", "按 Alt 手刹时保留多少抓地；越低越容易甩尾"],
  handbrakeTurnMultiplier: ["手刹转向倍率", "按 Alt 手刹时额外放大的转弯能力"],
  brakeToReverseDelaySeconds: ["刹车切倒挡延迟", "前进时按后退，先刹停再进入倒车的等待时间"],
  driveResponsePerSecond: ["滑行器推进响应", "油门改变后，推进力跟上的快慢"],
  lateralFrictionPerSecond: ["滑行横向摩擦", "越高越快消除横向漂移；设为 0 保留惯性"],
  maximumDriftAngleRadians: ["最大漂移夹角", "速度方向与主体面向允许偏离的最大角度"],
  turnAccelerationRadiansPerSecondSquared: ["水面转向加速度", "皮划艇开始转身时角速度建立的快慢"],
  turnDampingPerSecond: ["水面转向阻尼", "松开方向后皮划艇停止转动的快慢"],
  reverseTurnMultiplier: ["倒划转向倍率", "倒退划行时的转向能力比例"],
  surfaceVerticalSpeedLimitMetersPerSecond: ["水面上下速度上限", "限制水面约束修正时的垂直速度"],
  waterGravityScale: ["水面重力影响", "主体在水面附近仍保留的重力比例；设为 0 关闭"],
  maximumPitchRadians: ["滑翔最大俯仰", "滑翔伞抬头和俯冲的姿态上限"],
  maximumRollRadians: ["滑翔最大横滚", "滑翔伞左右倾斜的姿态上限"],
  pitchCenteringPerSecond: ["俯仰自动回正", "松开 W/S 后恢复中立俯仰的速度；设为 0 关闭"],
  rollCenteringPerSecond: ["横滚自动回正", "松开 A/D 后恢复水平的速度；设为 0 关闭"],
  yawRollCouplingRatio: ["转弯带倾斜", "偏航时自动带出横滚的比例；设为 0 解耦"],
  pitchToForwardSpeedRatio: ["俯冲换速度", "俯冲姿态对前向速度的影响比例"],
  pitchToVerticalSpeedMetersPerSecondPerRadian: ["俯仰升降效率", "俯仰角每变化一弧度带来的升降速度"],
  maximumSinkSpeedMetersPerSecond: ["最大下沉速度", "限制滑翔伞不会无限加速坠落"],
  maximumClimbSpeedMetersPerSecond: ["最大爬升速度", "限制滑翔伞靠姿态获得的向上速度"],
  verticalResponseMetersPerSecondSquared: ["垂直速度响应", "升降目标改变后实际垂直速度跟上的快慢"],
  stallSinkSpeedMetersPerSecond: ["失速下沉速度", "失速时目标下沉速度；配合失速速度一起调"],
};

const FRIENDLY_CAMERA_PROFILES: Readonly<Record<string, readonly [string, string]>> = {
  "worldkit://camera-profile/first-person.standard@1": ["第一人称", "从角色视点观察，适合沉浸和近距离检查"],
  "worldkit://camera-profile/orbit.medium@1": ["第三人称：自由环绕", "通用第三人称，可拖动查看主体四周"],
  "worldkit://camera-profile/follow.medium@1": ["稳定跟随", "跟在主体后方，转向变化更柔和"],
  "worldkit://camera-profile/chase.surface-fast@1": ["高速追逐", "速度越高看得越远，适合载具和滑行"],
  "worldkit://camera-profile/follow.water-surface@1": ["水面跟随", "变化较慢，尽量保留水面与地平线"],
  "worldkit://camera-profile/flight.glide@1": ["滑翔视角", "保持地平线稳定，同时预看飞行方向"],
  "worldkit://camera-profile/follow.mounted@1": ["乘坐跟随", "面向骑乘、驾驶和座位组合的中距离镜头"],
};

const CAMERA_CONSOLE_PROFILE_REFS = [
  "worldkit://camera-profile/orbit.medium@1",
] as const;
const CAMERA_CONSOLE_DEFAULT_PROFILE_REF =
  "worldkit://camera-profile/orbit.medium@1" as const;

function cameraParameterUnit(parameterName: CameraTuningParameterNameV1): string {
  if (parameterName === "speedFovDegreesPerMeterPerSecond") return "deg/(m/s)";
  if (parameterName.endsWith("SecondsSquared")) return "s²";
  if (parameterName.endsWith("MetersPerSecond")) return "m/s";
  if (parameterName.endsWith("Radians")) return "rad";
  if (parameterName.endsWith("Degrees")) return "deg";
  if (parameterName.endsWith("Seconds")) return "s";
  if (parameterName.endsWith("Ratio")) return "ratio";
  if (parameterName.endsWith("Meters")) return "m";
  if (parameterName.endsWith("PerSecond")) return "1/s";
  return "unitless";
}

const FRIENDLY_CAMERA_BASE_MODES: Readonly<Record<string, string>> = {
  "first-person": "第一人称",
  "free-orbit": "自由环绕",
  "stable-follow": "稳定跟随",
  "speed-chase": "速度追逐",
  "flight-horizon": "飞行地平线",
};

const FRIENDLY_CAMERA_MODIFIERS: Readonly<Record<string, string>> = {
  "worldkit://camera-modifier/water-stability@1": "水面稳定",
  "worldkit://camera-modifier/mounted-framing@1": "乘坐构图",
  "worldkit://camera-modifier/reverse-stability@1": "倒车稳定",
  "worldkit://camera-modifier/sprint-emphasis@1": "冲刺强调",
  "worldkit://camera-modifier/aim-framing@1": "越肩瞄准",
};

function subjectFriendlyName(definition: SubjectDefinitionSummaryV1): string {
  if (definition.semanticClassId.includes("humanoid")) return "G Bot 人形角色";
  if (definition.semanticClassId.includes("quadruped")) return "四足角色白膜";
  if (definition.semanticClassId.includes("four-wheel")) return "四轮载具白膜";
  if (definition.semanticClassId.includes("ice-skimmer")) return "冰面滑行器白膜";
  if (definition.semanticClassId.includes("kayak")) return "皮划艇白膜";
  if (definition.semanticClassId.includes("paraglider")) return "滑翔伞白膜";
  return definition.displayName;
}

function kernelFriendlyName(kernel: MotionKernelSummaryV1 | undefined): string {
  if (kernel === undefined) return "等待运行时确认";
  const names: Readonly<Record<string, string>> = {
    "worldkit://motion-kernel/free-ground@1": "自由地面移动",
    "worldkit://motion-kernel/forward-steer@1": "面向前方的行走与转向",
    "worldkit://motion-kernel/wheeled-arcade@1": "街机式四轮驾驶",
    "worldkit://motion-kernel/surface-slide@1": "低摩擦表面滑行",
    "worldkit://motion-kernel/water-surface@1": "水面推进与转向",
    "worldkit://motion-kernel/unpowered-glide@1": "无动力滑翔",
  };
  return names[kernel.resourceRef] ?? kernel.displayName;
}

function controlledEntityIdFromSnapshotV4(
  snapshot: WorldRuntimeSnapshotV4,
): string {
  const relationships = Object.values(
    snapshot.world.gameplayInspection.relationshipStatesById,
  ).filter((relationship) =>
    relationship.type === "possessedBy" &&
    relationship.controllerEntityId === "controller-primary"
  );
  if (relationships.length !== 1) {
    throw new Error("WORLDKIT_PLAYGROUND_CONTROL_BINDING_UNAVAILABLE");
  }
  const relationship = relationships[0];
  if (relationship?.type !== "possessedBy") {
    throw new Error("WORLDKIT_PLAYGROUND_CONTROL_BINDING_UNAVAILABLE");
  }
  return relationship.controlledEntityId;
}

function locomotionStateFromSubjectV4(
  subject: WorldRuntimeSubjectStateV4 | undefined,
) {
  return Object.values(subject?.capabilityStatesById ?? {}).find(
    (state) => state.kind === "locomotion-capability-state-v2",
  );
}

function activeActionFromSnapshotV4(
  snapshot: WorldRuntimeSnapshotV4,
  actorEntityId: string,
): string | undefined {
  return Object.values(
    snapshot.world.gameplayInspection.activeActionStatesById,
  ).find((state) => state.actorEntityId === actorEntityId)?.semanticActionRef;
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

interface TuningWorkbenchContextV1 {
  definitions: readonly SubjectDefinitionSummaryV1[];
  definition: SubjectDefinitionSummaryV1;
  activeKernel: MotionKernelSummaryV1 | undefined;
  motionProfiles: readonly CompatibleProfileSummaryV1[];
  controlFeelProfiles: readonly CompatibleProfileSummaryV1[];
  controlFeelProfile: CompatibleProfileSummaryV1 | undefined;
  controlProfile: CompatibleProfileSummaryV1 | undefined;
  cameraProfiles: readonly CompatibleProfileSummaryV1[];
  parameterDraft: Record<string, number | boolean>;
  motionDraftStorageKey: string;
  controlledEntityId: string;
  initialSubject: WorldRuntimeSubjectStateV4 | undefined;
  initialCamera: WorldRuntimeSnapshotV4["view"]["camera"];
  initialCameraPreference: string;
  hostOverlay?: CapabilityDemoHostOverlayV1;
}

interface TuningWorkbenchControllerV1 {
  setCameraPreferenceFromCompact(preference: string): void;
  setSelectedMotionProfileFromCompact(motionProfileRef: string): Promise<boolean>;
  reapplyWorkingDraftAfterSimulationReset(): Promise<void>;
  exportPublicationCandidate(): Promise<boolean>;
  bindAdapterDiagnostics(adapter: BabylonWorldAdapter): () => void;
}

function installTuningWorkbench(
  api: WorldkitBrowserApiV5,
  workbenchContext: TuningWorkbenchContextV1,
): TuningWorkbenchControllerV1 {
  const layer = requiredElement<HTMLDivElement>("#tuning-layer");
  const openButtons = [
    requiredElement<HTMLButtonElement>("#open-tuning-button"),
    requiredElement<HTMLButtonElement>("#open-tuning-panel-button"),
  ];
  const closeButton = requiredElement<HTMLButtonElement>("#close-tuning-button");
  const saveStatus = requiredElement<HTMLSpanElement>("#tuning-save-status");
  const runtimeVersion = requiredElement<HTMLElement>("#runtime-version");
  runtimeVersion.textContent = `API v${api.version}`;
  runtimeVersion.title = `WorldKit Browser API v${api.version}`;
  void loadTrustedSourceCommitV1().then((sourceCommit) => {
    runtimeVersion.textContent = `API v${api.version} · ${sourceCommit.slice(0, 7)}`;
    runtimeVersion.title = `WorldKit Browser API v${api.version} · Build ${sourceCommit}`;
  }).catch(() => {
    // The protocol version remains useful when the trusted Host build id is unavailable.
  });
  const primaryOpenButton = requiredElement<HTMLButtonElement>("#open-tuning-button");
  const setWorkbenchOpen = (open: boolean): void => {
    layer.hidden = !open;
    document.body.classList.toggle("tuning-open", open);
    primaryOpenButton.setAttribute("aria-expanded", String(open));
  };
  openButtons.forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", () => {
      setWorkbenchOpen(button === primaryOpenButton ? layer.hidden : true);
    });
  });
  closeButton.addEventListener("click", () => setWorkbenchOpen(false));
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && !layer.hidden) setWorkbenchOpen(false);
  });

  const tabButtons = [
    requiredElement<HTMLButtonElement>("#tuning-tab-movement"),
    requiredElement<HTMLButtonElement>("#tuning-tab-camera"),
  ];
  const tabPanels = [
    requiredElement<HTMLElement>("#tuning-panel-movement"),
    requiredElement<HTMLElement>("#tuning-panel-camera"),
  ];
  const workbenchTitle = requiredElement<HTMLHeadingElement>("#tuning-title");
  const selectTab = (selectedIndex: number): void => {
    workbenchTitle.textContent = selectedIndex === 0 ? "移动手感" : "相机手感";
    tabButtons.forEach((button, index) => {
      button.setAttribute("aria-selected", String(index === selectedIndex));
      button.tabIndex = index === selectedIndex ? 0 : -1;
      tabPanels[index]!.hidden = index !== selectedIndex;
    });
  };
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => selectTab(index));
  });
  selectTab(0);
  setWorkbenchOpen(true);

  const subjectSelect = requiredElement<HTMLSelectElement>("#tuning-subject-select");
  subjectSelect.replaceChildren(...workbenchContext.definitions.map((definition) =>
    new Option(
      `${subjectFriendlyName(definition)} · ${definition.authoringAvailability}`,
      definition.resourceRef,
      false,
      definition.resourceRef === workbenchContext.definition.resourceRef,
    )
  ));
  subjectSelect.disabled = true;
  const summary = requiredElement<HTMLDivElement>("#tuning-subject-summary");
  const currentSubject = workbenchContext.initialSubject;
  const currentLocomotionState = locomotionStateFromSubjectV4(currentSubject);
  summary.innerHTML = `
    <div><span>现在调的是</span><strong>${escapeHtml(subjectFriendlyName(workbenchContext.definition))}</strong></div>
    <div><span>移动方式</span><strong>${escapeHtml(kernelFriendlyName(workbenchContext.activeKernel))}</strong></div>
    <div><span>所在环境</span><strong>${currentLocomotionState?.locomotion.status === "active" && currentLocomotionState.locomotion.movementMedium === "air" ? "空中" : "地面"}</strong></div>
    <div><span>配置权限</span><strong>${workbenchContext.definition.authoringAvailability}</strong></div>
  `;

  const inputGrid = requiredElement<HTMLDivElement>("#tuning-input-capabilities");
  const inputStatus = requiredElement<HTMLDivElement>("#tuning-input-status");
  const commandKind = workbenchContext.activeKernel?.commandKind ?? "planar-vector";
  const forwardSteer = workbenchContext.activeKernel?.resourceRef.includes("forward-steer") === true;
  const wheeled = workbenchContext.activeKernel?.resourceRef.includes("wheeled-arcade") === true;
  const gliding = workbenchContext.activeKernel?.resourceRef.includes("unpowered-glide") === true;
  const inputItems: Array<{
    keyLabel: string;
    title: string;
    explanation: string;
    steps: readonly { actions: readonly SemanticInputActionV1[]; ticks: number }[];
  }> = [
    { keyLabel: "W", title: commandKind === "flight-attitude" ? "向下俯冲" : "向前", explanation: commandKind === "planar-vector" ? "按照镜头朝向前进" : "按照主体自身朝向前进", steps: [{ actions: ["move-forward"], ticks: 24 }] },
    { keyLabel: "S", title: commandKind === "flight-attitude" ? "抬头减速" : "向后", explanation: commandKind === "planar-vector" ? "按照镜头朝向后退" : "倒退或降低油门", steps: [{ actions: ["move-backward"], ticks: 18 }] },
    { keyLabel: "A / D", title: commandKind === "planar-vector" ? "横向移动" : "左右转向", explanation: commandKind === "flight-attitude" ? "偏航并带动机体倾斜" : "改变主体的移动方向", steps: [{ actions: ["move-left"], ticks: 18 }] },
    {
      keyLabel: "Shift",
      title: commandKind === "flight-attitude" ? "滑翔动作" : forwardSteer ? "冲刺" : commandKind === "throttle-steer" ? "增强推进" : "奔跑",
      explanation: commandKind === "flight-attitude" ? "提交滑翔主动作请求；可继续由动作表绑定展开" : "按住时使用配置表中的加速倍率",
      steps: [{ actions: ["move-forward", commandKind === "planar-vector" || forwardSteer ? "run" : "boost"], ticks: 30 }],
    },
    {
      keyLabel: "空格",
      title: commandKind === "planar-vector" || forwardSteer ? "跳跃" : gliding ? "滑翔主动作" : "制动",
      explanation: gliding ? "提交主动作请求，不会再被误当成制动" : commandKind === "throttle-steer" && !forwardSteer ? "按住时使用独立制动，不再和技能键混用" : "支持离地宽容、预输入和长短跳",
      steps: commandKind === "throttle-steer" && !forwardSteer
        ? [{ actions: ["move-forward"], ticks: 18 }, { actions: ["brake"], ticks: 12 }]
        : [{ actions: [gliding ? "primary-action" : "jump"], ticks: 2 }],
    },
    ...(commandKind === "throttle-steer" && !forwardSteer
      ? [{ keyLabel: "Ctrl", title: "脚刹 / 主制动", explanation: "连续制动，车辆会先减速再按配置延迟进入倒挡", steps: [{ actions: ["move-forward" as const], ticks: 18 }, { actions: ["brake" as const], ticks: 12 }] }]
      : []),
    ...(wheeled
      ? [{ keyLabel: "Alt", title: "手刹甩尾", explanation: "降低侧向抓地并放大转向；强度由车辆配表控制", steps: [{ actions: ["move-forward" as const, "move-left" as const, "handbrake" as const], ticks: 18 }] }]
      : []),
    { keyLabel: "E / Q", title: "主 / 次动作", explanation: "与移动、制动完全分离，供技能或互动动作表绑定", steps: [{ actions: ["primary-action"], ticks: 2 }] },
    { keyLabel: "F", title: "瞄准构图", explanation: "角色面向镜头方向，同时叠加越肩瞄准镜头；松开即恢复", steps: [{ actions: ["aim"], ticks: 12 }] },
    { keyLabel: "R", title: "镜头回正", explanation: "清除手动环绕偏移，平滑回到当前基础镜头方向", steps: [{ actions: ["camera-recenter"], ticks: 1 }] },
    { keyLabel: "C", title: "回头看", explanation: "只临时旋转镜头，不反转人物或载具的移动输入", steps: [{ actions: ["camera-look-back"], ticks: 18 }, { actions: [], ticks: 12 }] },
    { keyLabel: "V", title: "左右换肩", explanation: "切换越肩构图的观察侧，不改变主体运动", steps: [{ actions: ["camera-shoulder-swap"], ticks: 1 }] },
  ];
  inputGrid.replaceChildren(...inputItems.map((item) => {
    const card = document.createElement("article");
    card.innerHTML = `<kbd>${escapeHtml(item.keyLabel)}</kbd><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.explanation)}</p></div><button type="button">试一下</button>`;
    card.querySelector("button")!.addEventListener("click", async () => {
      inputStatus.textContent = `正在执行“${item.title}”…`;
      try {
        const after = await api.runFixedInput(item.steps);
        const controlledEntityId = controlledEntityIdFromSnapshotV4(after);
        inputStatus.textContent = `“${item.title}”已执行 · 当前动作：${activeActionFromSnapshotV4(after, controlledEntityId) ?? "已提交"}`;
      } catch {
        inputStatus.textContent = `“${item.title}”没有成功执行，世界状态已保留。`;
      }
    });
    return card;
  }));

  const motionSliderGrid = requiredElement<HTMLDivElement>("#tuning-motion-sliders");
  const advancedMotionSliderGrid = requiredElement<HTMLDivElement>(
    "#tuning-motion-advanced-sliders",
  );
  const cameraCards = requiredElement<HTMLDivElement>("#tuning-camera-cards");
  const cameraBasic = requiredElement<HTMLDivElement>("#tuning-camera-basic > div");
  const cameraExpert = requiredElement<HTMLDivElement>("#tuning-camera-expert > div");
  const cameraDiagnostics = requiredElement<HTMLDListElement>("#tuning-camera-diagnostics");
  const cameraInputDebug = requiredElement<HTMLDListElement>("#tuning-camera-input-debug");
  const cameraOverlay = requiredElement<HTMLDivElement>("#tuning-camera-overlay");
  const defaultMotion = workbenchContext.motionProfiles.find((row) => row.role === "default");
  const controlFeelProfiles = workbenchContext.controlFeelProfiles;
  const controlFeelProfile = workbenchContext.controlFeelProfile;
  const controlProfile = workbenchContext.controlProfile;
  const cameraRows = workbenchContext.cameraProfiles;
  const cameraConsoleRows = CAMERA_CONSOLE_PROFILE_REFS.flatMap((resourceRef) => {
    const profile = cameraRows.find((candidate) => candidate.resourceRef === resourceRef);
    return profile === undefined ? [] : [profile];
  });
  const isConsoleCameraProfileRef = (resourceRef: string): boolean =>
    CAMERA_CONSOLE_PROFILE_REFS.includes(
      resourceRef as typeof CAMERA_CONSOLE_PROFILE_REFS[number],
    );
  const recenterCameraParameterNames = new Set<CameraTuningParameterNameV1>([
    "recenterDelaySeconds",
    "recenterDurationSeconds",
    "recenterMinimumSpeedMetersPerSecond",
  ]);
  const isCameraParameterEffective = (
    profile: CompatibleProfileSummaryV1,
    name: string,
  ): boolean => {
    if (
      name === "targetHeightMeters" &&
      workbenchContext.definition.resourceRef ===
        "worldkit://subject-definition/humanoid.g-bot@2"
    ) return false;
    if (
      name === "minimumHeadingSpeedMetersPerSecond" &&
      profile.headingSource !== "target-velocity"
    ) return false;
    if (
      name === "velocityHeadingDampingPerSecond" &&
      profile.headingSource === "view"
    ) return false;
    if (
      recenterCameraParameterNames.has(name as CameraTuningParameterNameV1) &&
      profile.recenterMode === "off"
    ) return false;
    return true;
  };
  const sanitizeCameraTuning = (
    profile: CompatibleProfileSummaryV1,
    values: Readonly<Record<string, number>>,
  ): CameraTuningV1 => Object.fromEntries(
    Object.entries(values).filter(([name, value]) => {
      const range = profile.authoringRanges?.[name];
      return isCameraParameterEffective(profile, name) &&
        range !== undefined && Number.isFinite(value) &&
        value >= range.minimum && value <= range.maximum;
    }),
  ) as CameraTuningV1;

  const numericParameters = (
    parameters: Readonly<Record<string, number | boolean>> | undefined,
  ): Record<string, number> => Object.fromEntries(
    Object.entries(parameters ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
  const hiddenMotionParameterNames = workbenchContext.definition.resourceRef ===
      "worldkit://subject-definition/humanoid.g-bot@2"
    ? new Set(["turnRateRadiansPerSecond"])
    : new Set<string>();
  const editableMotionParameters = (
    parameters: Readonly<Record<string, number | boolean>> | undefined,
  ): Record<string, number | boolean> => Object.fromEntries(
    Object.entries(parameters ?? {}).filter(
      ([name]) => !hiddenMotionParameterNames.has(name),
    ),
  );
  for (const name of hiddenMotionParameterNames) {
    delete workbenchContext.parameterDraft[name];
  }
  const controlBaseParameters = numericParameters(controlProfile?.parameters);
  let controlTuning: ControlTuningV1 = { ...controlBaseParameters };
  const cameraTuningByProfileRef: Record<string, Record<string, number>> = Object.fromEntries(
    cameraConsoleRows.map((profile) => [profile.resourceRef, {}]),
  );
  let cameraPreference = isConsoleCameraProfileRef(workbenchContext.initialCameraPreference)
    ? workbenchContext.initialCameraPreference
    : CAMERA_CONSOLE_DEFAULT_PROFILE_REF;
  if (!isConsoleCameraProfileRef(cameraPreference)) {
    cameraPreference = CAMERA_CONSOLE_DEFAULT_PROFILE_REF;
  }
  let appliedCameraPreferenceRef: string | null = cameraPreference;
  let cameraTuning: CameraTuningV1 = {};
  let selectedControlFeelProfileRef = controlFeelProfile?.resourceRef ?? "";
  let selectedMotionProfileRef = defaultMotion?.resourceRef ?? "";
  let appliedGameplayProfileSelection = {
    motionProfileRef: selectedMotionProfileRef,
    controlFeelProfileRef: selectedControlFeelProfileRef,
  };
  const selectedControlFeelProfile = (): CompatibleProfileSummaryV1 | undefined =>
    controlFeelProfiles.find(
      (profile) => profile.resourceRef === selectedControlFeelProfileRef,
    ) ?? controlFeelProfile;

  const exactBaseline = api.getSubjectPresetBaseline?.(workbenchContext.definition.resourceRef);
  const defaultCameraProfileRef = exactBaseline?.defaultCameraRigProfileRef;
  const localBaseline: SubjectPresetLocalBaselineV1 | undefined =
    exactBaseline !== undefined &&
      defaultMotion !== undefined &&
      controlFeelProfile !== undefined &&
      controlProfile !== undefined &&
      defaultCameraProfileRef !== undefined
      ? {
          subjectDefinitionId: exactBaseline.closure.subjectDefinitionId,
          subjectDefinitionRef: exactBaseline.closure.subjectDefinitionRef,
          subjectDefinitionContentHash: exactBaseline.closure.subjectDefinitionContentHash,
          defaultMotionProfile: {
            resourceRef: defaultMotion.resourceRef,
            contentHash: defaultMotion.contentHash,
          },
          availableMotionProfiles: [...new Map(
            workbenchContext.motionProfiles.map((profile) => [
              profile.resourceRef,
              {
                resourceRef: profile.resourceRef,
                contentHash: profile.contentHash,
              },
            ]),
          ).values()],
          controlFeelProfile: {
            resourceRef: controlFeelProfile.resourceRef,
            contentHash: controlFeelProfile.contentHash,
          },
          availableControlFeelProfiles: controlFeelProfiles.map((profile) => ({
            resourceRef: profile.resourceRef,
            contentHash: profile.contentHash,
          })),
          controlProfile: {
            resourceRef: controlProfile.resourceRef,
            contentHash: controlProfile.contentHash,
          },
          cameraProfiles: cameraConsoleRows.map((profile) => ({
            resourceRef: profile.resourceRef,
            contentHash: profile.contentHash,
          })),
          defaultCameraProfileRef,
        }
      : undefined;
  const localRepository = localBaseline === undefined
    ? undefined
    : createSubjectPresetLocalRepository(localStorage);
  const normalizeCameraPreference = (preference: string): string =>
    isConsoleCameraProfileRef(preference)
      ? preference
      : CAMERA_CONSOLE_DEFAULT_PROFILE_REF;
  const syncCompactCameraSelect = (): void => {
    const compactCameraSelect = document.querySelector<HTMLSelectElement>(
      "#camera-preference-select",
    );
    if (compactCameraSelect !== null && [...compactCameraSelect.options].some(
      (option) => option.value === cameraPreference,
    )) {
      compactCameraSelect.value = cameraPreference;
    }
    syncContextCameraButtons(cameraPreference);
  };
  const draftCreatedAtIso = new Date().toISOString();
  let draftIdentity = {
    draftId: `draft-workbench-${globalThis.crypto.randomUUID()}`,
    createdAtIso: draftCreatedAtIso,
    updatedAtIso: draftCreatedAtIso,
  };

  const resetTuningStateToRegistry = (): void => {
    selectedControlFeelProfileRef = controlFeelProfile?.resourceRef ?? "";
    selectedMotionProfileRef = defaultMotion?.resourceRef ?? "";
    for (const name of Object.keys(workbenchContext.parameterDraft)) {
      delete workbenchContext.parameterDraft[name];
    }
    Object.assign(
      workbenchContext.parameterDraft,
      editableMotionParameters(selectedControlFeelProfile()?.parameters),
    );
    controlTuning = { ...controlBaseParameters };
    for (const profile of cameraConsoleRows) {
      cameraTuningByProfileRef[profile.resourceRef] = {};
    }
    cameraPreference = CAMERA_CONSOLE_DEFAULT_PROFILE_REF;
  };

  const loadDraftIntoTuningState = (draft: SubjectPresetWorkingDraftV1): void => {
    resetTuningStateToRegistry();
    if (controlFeelProfiles.some(
      (profile) => profile.resourceRef === draft.selectedControlFeelProfileRef,
    )) {
      selectedControlFeelProfileRef = draft.selectedControlFeelProfileRef;
      for (const name of Object.keys(workbenchContext.parameterDraft)) {
        delete workbenchContext.parameterDraft[name];
      }
      Object.assign(
        workbenchContext.parameterDraft,
        editableMotionParameters(selectedControlFeelProfile()?.parameters),
      );
    }
    if (workbenchContext.motionProfiles.some(
      (profile) => profile.resourceRef === draft.selectedMotionProfileRef,
    )) {
      selectedMotionProfileRef = draft.selectedMotionProfileRef;
    }
    draftIdentity = {
      draftId: draft.draftId,
      createdAtIso: draft.createdAtIso,
      updatedAtIso: draft.updatedAtIso,
    };
    const controlFeelValues = draft.controlFeelOverridesByProfileRef[
      selectedControlFeelProfileRef
    ]?.values ?? {};
    Object.assign(
      workbenchContext.parameterDraft,
      editableMotionParameters(controlFeelValues),
    );
    const controlValues = draft.controlOverridesByProfileRef[controlProfile?.resourceRef ?? ""]?.values ?? {};
    controlTuning = { ...controlBaseParameters, ...controlValues };
    for (const profile of cameraConsoleRows) {
      const values = draft.cameraOverridesByProfileRef[profile.resourceRef]?.values ?? {};
      cameraTuningByProfileRef[profile.resourceRef] = sanitizeCameraTuning(profile, values);
    }
    cameraPreference = draft.selectedCameraPreferenceRef !== null &&
        isConsoleCameraProfileRef(draft.selectedCameraPreferenceRef)
      ? draft.selectedCameraPreferenceRef
      : CAMERA_CONSOLE_DEFAULT_PROFILE_REF;
  };

  const createCurrentWorkingDraft = (): SubjectPresetWorkingDraftV1 | undefined => {
    if (localBaseline === undefined) return undefined;
    const activeControlFeelProfile = selectedControlFeelProfile();
    if (activeControlFeelProfile === undefined) return undefined;
    const updatedAtIso = new Date().toISOString();
    return createSubjectPresetWorkbenchDraftV1({
      baseline: localBaseline,
      draftIdentity: { ...draftIdentity, updatedAtIso },
      selectedMotionProfileRef,
      selectedControlFeelProfileRef: activeControlFeelProfile.resourceRef,
      selectedCameraPreferenceRef: cameraPreference,
      controlFeel: {
        baseParameters: activeControlFeelProfile.parameters ?? {},
        currentValues: numericParameters(workbenchContext.parameterDraft),
        ...(activeControlFeelProfile.runtimeParameterNames === undefined
          ? {}
          : { runtimeParameterNames: activeControlFeelProfile.runtimeParameterNames }),
      },
      control: {
        baseParameters: controlProfile?.parameters ?? {},
        currentValues: numericParameters(controlTuning),
        ...(controlProfile?.runtimeParameterNames === undefined
          ? {}
          : { runtimeParameterNames: controlProfile.runtimeParameterNames }),
      },
      cameraByProfileRef: Object.fromEntries(cameraConsoleRows.map((profile) => [
        profile.resourceRef,
        {
          baseParameters: profile.parameters ?? {},
          currentValues: cameraTuningByProfileRef[profile.resourceRef] ?? {},
        },
      ])),
    });
  };

  const persistWorkingDraft = (): SubjectPresetWorkingDraftV1 | undefined => {
    const draft = createCurrentWorkingDraft();
    if (draft === undefined || localRepository === undefined) return undefined;
    const receipt = localRepository.saveWorkingDraft(draft);
    draftIdentity = {
      draftId: receipt.value.draftId,
      createdAtIso: receipt.value.createdAtIso,
      updatedAtIso: receipt.value.updatedAtIso,
    };
    if (receipt.status === "memory-only") {
      saveStatus.textContent = "浏览器暂时不能写入磁盘；本次调参只保留到页面关闭前";
    }
    return receipt.value;
  };

  const applyCameraDraft = async (
    draft: SubjectPresetWorkingDraftV1,
  ): Promise<void> => {
    if (
      api.executeCameraViewCommand === undefined ||
      api.applyCameraPreview === undefined
    ) {
      throw new Error("SUBJECT_PRESET_CAMERA_CHANNEL_UNAVAILABLE");
    }
    if (draft.selectedCameraPreferenceRef === null) {
      await executeCameraPreference(api);
    } else {
      await executeCameraPreference(api, {
        mode: "camera-rig-profile",
        cameraRigProfileRef: draft.selectedCameraPreferenceRef,
      });
    }
    api.applyCameraPreview(cameraPreviewRequestFromDraftV1(draft));
    appliedCameraPreferenceRef = normalizeCameraPreference(
      draft.selectedCameraPreferenceRef ?? CAMERA_CONSOLE_DEFAULT_PROFILE_REF,
    );
  };

  const applyWorkingDraftAtomically = async (
    draft: SubjectPresetWorkingDraftV1,
    options: Readonly<{ preserveCameraForGoldenLock?: boolean }> = {},
  ): Promise<boolean> => {
    if (
      api.applySubjectPresetTuning === undefined ||
      api.getSubjectSnapshot === undefined ||
      api.getCameraPreviewState === undefined ||
      api.executeCameraViewCommand === undefined ||
      api.applyCameraPreview === undefined
    ) {
      return false;
    }
    const activeSubject = api.getSubjectSnapshot(workbenchContext.controlledEntityId);
    if (
      activeSubject === undefined ||
      activeSubject.entityState.entityDefinitionRef !== draft.baseSubjectDefinitionRef ||
      activeSubject.entityState.entityDefinitionHash.length === 0
    ) {
      saveStatus.textContent = "版本没有应用：当前主体与草稿锁定的定义不匹配";
      return false;
    }
    const result = await applySubjectPresetWorkingDraftTransactionV1({
      draft,
      subjectEntityId: workbenchContext.controlledEntityId,
      runtimeExpectedSubjectDefinitionHash: activeSubject.entityState.entityDefinitionHash,
      previousCameraPreferenceRef: appliedCameraPreferenceRef,
      previousGameplayProfileSelection: appliedGameplayProfileSelection,
      runtime: {
        getCameraPreviewState: () => api.getCameraPreviewState!(),
        setCameraRigProfile: (profileRef) => executeCameraPreference(api, {
          mode: "camera-rig-profile",
          cameraRigProfileRef: profileRef,
        }),
        resetCameraRigProfile: () => executeCameraPreference(api),
        applyCameraPreview: (request) => api.applyCameraPreview!(request),
        applySubjectPresetTuning: (request) => api.applySubjectPresetTuning!(request),
      },
    });
    if (result.status === "rejected") {
      if (
        options.preserveCameraForGoldenLock === true &&
        result.receipt.diagnostic?.code === "SUBJECT_PRESET_GOLDEN_RECOMPILE_REQUIRED"
      ) {
        try {
          await applyCameraDraft(draft);
          saveStatus.textContent = `镜头版本已应用；${result.receipt.diagnostic.message}`;
          return true;
        } catch {
          saveStatus.textContent = "镜头版本未能恢复；Runtime 已保留上一组稳定配置";
          return false;
        }
      }
      saveStatus.textContent = `版本没有应用：${result.receipt.diagnostic?.message ?? "配置与当前主体不匹配"}`;
      return false;
    }
    if (result.status === "rollback-failed") {
      saveStatus.textContent = "整套配置未能应用，自动回滚也未完整完成；请重置世界后重试";
      return false;
    }
    if (result.status === "failed") {
      saveStatus.textContent = "整套配置未能应用，当前主体仍使用上一组稳定配置";
      return false;
    }
    appliedCameraPreferenceRef = normalizeCameraPreference(
      draft.selectedCameraPreferenceRef ?? CAMERA_CONSOLE_DEFAULT_PROFILE_REF,
    );
    appliedGameplayProfileSelection = {
      motionProfileRef: draft.selectedMotionProfileRef,
      controlFeelProfileRef: draft.selectedControlFeelProfileRef,
    };
    const compactCameraSelect = document.querySelector<HTMLSelectElement>("#camera-preference-select");
    if (compactCameraSelect !== null) {
      compactCameraSelect.value = cameraPreference;
    }
    return true;
  };

  if (localRepository !== undefined && localBaseline !== undefined) {
    const localDefault = localRepository.resolveLocalDefault(localBaseline);
    const initialDraft = localDefault.status === "applicable"
      ? localRepository.restoreVersion(localDefault.pointer.localVersionId).value
      : localRepository.getWorkingDraft(localBaseline);
    if (initialDraft !== undefined) {
      loadDraftIntoTuningState(initialDraft);
      const normalizedDraft = persistWorkingDraft();
      if (normalizedDraft !== undefined) {
        void applyWorkingDraftAtomically(normalizedDraft, {
          preserveCameraForGoldenLock: true,
        }).then((applied) => {
          if (!applied) resetTuningStateToRegistry();
        });
      }
    }
  }

  const renderMotionSliders = (): void => {
    const activeControlFeelProfile = selectedControlFeelProfile();
    if (activeControlFeelProfile?.safetyLimits === undefined) {
      motionSliderGrid.innerHTML = '<p class="friendly-empty">当前主体没有开放可调的运动参数。</p>';
      advancedMotionSliderGrid.replaceChildren();
      return;
    }
    const parameterEntries = Object.entries(activeControlFeelProfile.safetyLimits)
      .filter(([name]) => !hiddenMotionParameterNames.has(name));
    const coreParameterNames = [
      "walkSpeedMetersPerSecond",
      "runSpeedMetersPerSecond",
      "accelerationMetersPerSecondSquared",
      "decelerationMetersPerSecondSquared",
      "turnRateRadiansPerSecond",
      "jumpSpeedMetersPerSecond",
    ];
    const coreEntries = coreParameterNames.flatMap((name) => {
      const entry = parameterEntries.find(([candidate]) => candidate === name);
      return entry === undefined ? [] : [entry];
    });
    const advancedEntries = parameterEntries.filter(
      ([name]) => !coreParameterNames.includes(name),
    );
    const unitForParameter = (name: string): string => {
      if (name.endsWith("MetersPerSecondSquared")) return "m/s²";
      if (name.endsWith("MetersPerSecond")) return "m/s";
      if (name.endsWith("RadiansPerSecond")) return "rad/s";
      if (name.endsWith("Seconds")) return "s";
      return "";
    };
    const createSliders = (
      entries: typeof parameterEntries,
    ): HTMLLabelElement[] => entries.flatMap(([name, safetyLimit]) => {
      const value = workbenchContext.parameterDraft[name];
      const range = activeControlFeelProfile.authoringRanges?.[name] ?? {
        ...safetyLimit,
        step: Math.max(0.01, (safetyLimit.maximum - safetyLimit.minimum) / 100),
      };
      if (typeof value !== "number" || range.minimum === range.maximum) return [];
      const [labelText, helpText] = FRIENDLY_MOTION_PARAMETERS[name] ?? [name, "安全范围内的运动参数"];
      const label = document.createElement("label");
      label.className = "friendly-slider";
      label.innerHTML = `<span><strong>${escapeHtml(labelText)}</strong><small>${escapeHtml(helpText)}；候选值导出并重新编译后生效</small></span>`;
      const control = document.createElement("div");
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(range.minimum);
      input.max = String(range.maximum);
      input.step = String(range.step);
      input.value = String(value);
      const output = document.createElement("output");
      output.textContent = value.toFixed(2);
      input.addEventListener("input", () => {
        const nextValue = Number(input.value);
        workbenchContext.parameterDraft[name] = nextValue;
        output.textContent = nextValue.toFixed(2);
        writeLocalDraft(workbenchContext.motionDraftStorageKey, JSON.stringify(workbenchContext.parameterDraft));
        persistWorkingDraft();
        syncContextPreviewMode("draft");
        saveStatus.textContent = `“${labelText}”候选值已保存；导出并重新编译后生效`;
      });
      control.append(input, output);
      const unit = unitForParameter(name);
      if (unit !== "") {
        control.classList.add("has-unit");
        const unitLabel = document.createElement("span");
        unitLabel.className = "friendly-unit";
        unitLabel.textContent = unit;
        control.append(unitLabel);
      }
      label.append(control);
      return [label];
    });
    motionSliderGrid.replaceChildren(...createSliders(coreEntries));
    advancedMotionSliderGrid.replaceChildren(...createSliders(advancedEntries));
  };

  const activeTunableCameraProfile = (): CompatibleProfileSummaryV1 | undefined => {
    return cameraConsoleRows.find((row) => row.resourceRef === cameraPreference) ??
      cameraConsoleRows.find(
        (row) => row.resourceRef === CAMERA_CONSOLE_DEFAULT_PROFILE_REF,
      ) ?? cameraConsoleRows[0];
  };

  const applyCameraTuning = (): void => {
    const profile = activeTunableCameraProfile();
    cameraTuning = profile === undefined
      ? {}
      : { ...(cameraTuningByProfileRef[profile.resourceRef] ?? {}) } as CameraTuningV1;
    try {
      api.applyCameraPreview?.({
        tuningByProfileRef: Object.fromEntries(cameraConsoleRows.map((candidate) => [
          candidate.resourceRef,
          sanitizeCameraTuning(
            candidate,
            cameraTuningByProfileRef[candidate.resourceRef] ?? {},
          ),
        ])),
      });
    } catch {
      saveStatus.textContent = "相机微调未能应用，原镜头设置已保留";
    }
  };

  const formatCameraVector = (value: readonly number[] | undefined): string =>
    value === undefined ? "—" : value.map((part) => part.toFixed(2)).join(" / ");
  const formatCameraData = (value: unknown): string => {
    if (value === undefined) return "未报告";
    if (typeof value === "number") return value.toFixed(3);
    if (typeof value === "boolean") return value ? "是" : "否";
    if (Array.isArray(value) && value.every((part) => typeof part === "number")) {
      return formatCameraVector(value);
    }
    if (typeof value === "string") return value;
    return JSON.stringify(value) ?? "未报告";
  };
  const cameraSnapshotForDisplay = () => {
    try {
      return api.getCameraSnapshot?.() ?? workbenchContext.initialCamera;
    } catch {
      return workbenchContext.initialCamera;
    }
  };
  const renderCameraDiagnostics = (): void => {
    const camera = cameraSnapshotForDisplay();
    const tracking = camera?.mode === "tracking" ? camera : undefined;
    const entries: ReadonlyArray<readonly [string, string, string]> = [
      ["Camera", formatCameraData(tracking?.id), "camera-id"],
      ["Target Entity", formatCameraData(tracking?.targetEntityId), "target-entity"],
      ["Active Profile", formatCameraData(tracking?.activeCameraProfileRef), "active-profile"],
      ["Active Rig", formatCameraData(tracking?.activeCameraRigRef), "active-rig"],
      ["Selection Rules", formatCameraData(tracking?.selectionDecision), "selection-rules"],
      ["Modifiers", formatCameraData(tracking?.activeCameraModifierRefs), "modifiers"],
      ["Safe Fallback", formatCameraData(tracking?.safeFallbackActive), "safe-fallback"],
      ["Camera Position", formatCameraData(tracking?.positionMetersXYZ), "camera-position"],
      ["View Yaw / Pitch / Distance", `${formatCameraData(tracking?.viewYawOffsetRadians)} / ${formatCameraData(tracking?.viewPitchOffsetRadians)} / ${formatCameraData(tracking?.viewDistanceOffsetMeters)}`, "view-offsets"],
      ["Socket", formatCameraData(tracking?.selectedTargetSocketId ?? (tracking?.isTargetSocketFallback ? "目标高度回退" : undefined)), "socket"],
      ["Socket Fallback", formatCameraData(tracking?.isTargetSocketFallback), "socket-fallback"],
      ["Socket Position", formatCameraData(tracking?.targetSocketPositionMetersXYZ), "socket-position"],
      ["Desired Target", formatCameraData(tracking?.desiredTargetPositionMetersXYZ), "desired-target"],
      ["Desired Position", formatCameraData(tracking?.desiredPositionMetersXYZ), "desired-position"],
      ["Actual Position", formatCameraData(tracking?.actualPositionMetersXYZ), "actual-position"],
      ["FOV", formatCameraData(tracking?.finalFovDegrees), "fov"],
      ["Requested Arm", formatCameraData(tracking?.requestedArmLengthMeters), "requested-arm"],
      ["Safe Arm", formatCameraData(tracking?.safeArmLengthMeters), "safe-arm"],
      ["Effective Arm", formatCameraData(tracking?.effectiveArmLengthMeters), "effective-arm"],
      ["Collision", formatCameraData(tracking?.isCollisionRetracted), "collision"],
      ["Collision Entity", formatCameraData(tracking?.collisionHitEntityId), "collision-entity"],
      ["Collision Position", formatCameraData(tracking?.collisionHitPositionXYZ), "collision-position"],
      ["Position Lag", formatCameraData(tracking?.positionLagXYZ), "position-lag"],
      ["Rotation Lag", formatCameraData(tracking?.rotationLagRadiansXYZ), "rotation-lag"],
    ["回正延迟倒计时", tracking?.recenterRemainingSeconds === undefined
        ? "回正关闭"
        : formatCameraData(tracking.recenterRemainingSeconds), "recenter-remaining"],
      ["Fixed Step Delta", formatCameraData(tracking?.fixedStepDeltaSeconds), "fixed-step-delta"],
      ["Resolved Parameters", formatCameraData(tracking?.resolvedParameters), "resolved-parameters"],
      ["Preview Parameters", formatCameraData(tracking?.previewParameterOverrides), "preview-parameters"],
      ["Transition", formatCameraData(tracking?.profileTransitionProgressRatio), "transition"],
      ["ViewControlFrame Forward", formatCameraData(tracking?.controlForwardXYZ), "control-forward"],
      ["Subject Forward", formatCameraData(tracking?.subjectForwardXYZ), "subject-forward"],
      ["Subject Velocity", formatCameraData(tracking?.subjectVelocityMetersPerSecondXYZ), "subject-velocity"],
    ];
    cameraDiagnostics.replaceChildren(...entries.flatMap(([label, value, name]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.dataset.cameraDiagnostic = name;
      description.textContent = value;
      return [term, description];
    }));
    cameraOverlay.textContent = [
      `target xyz: ${formatCameraVector(tracking?.targetSocketPositionMetersXYZ ?? tracking?.desiredTargetPositionMetersXYZ)}`,
      `desired xyz: ${formatCameraVector(tracking?.desiredPositionMetersXYZ)}`,
      `actual xyz: ${formatCameraVector(tracking?.actualPositionMetersXYZ ?? tracking?.positionMetersXYZ)}`,
      `arm requested / safe / effective: ${tracking?.requestedArmLengthMeters?.toFixed(2) ?? "—"} / ${tracking?.safeArmLengthMeters?.toFixed(2) ?? "—"} / ${tracking?.effectiveArmLengthMeters?.toFixed(2) ?? "—"}`,
      `collision: ${tracking?.isCollisionRetracted === true ? "retracted" : "clear"} · transition: ${tracking?.profileTransitionProgressRatio?.toFixed(2) ?? "—"}`,
      `ViewControlFrame forward: ${formatCameraVector(tracking?.controlForwardXYZ)}`,
      `Subject forward: ${formatCameraVector(tracking?.subjectForwardXYZ)}`,
    ].join("\n");
  };

  const renderCameraInputDebug = (
    diagnostics: ReturnType<BabylonWorldAdapter["getArrowInputDiagnosticSnapshot"]> | undefined,
  ): void => {
    const entries: ReadonlyArray<readonly [string, string]> = diagnostics === undefined
      ? [["状态", "Adapter 未绑定"]]
      : [
          ["最大偏航", `${diagnostics.maximumYawRadiansPerFixedTick.toFixed(3)} rad / fixed tick`],
          ["最大俯仰", `${diagnostics.maximumPitchRadiansPerFixedTick.toFixed(3)} rad / fixed tick`],
          ["加速", `${diagnostics.keyboardAccelerationSeconds.toFixed(2)} s`],
          ["减速", `${diagnostics.keyboardDecelerationSeconds.toFixed(2)} s`],
          ["当前偏航速度", `${diagnostics.yawRadiansPerFixedTick.toFixed(6)} rad / fixed tick`],
          ["当前俯仰速度", `${diagnostics.pitchRadiansPerFixedTick.toFixed(6)} rad / fixed tick`],
          ["最后清除", diagnostics.lastClearReason],
        ];
    cameraInputDebug.replaceChildren(...entries.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = `${label} `;
      const description = document.createElement("dd");
      description.dataset.cameraInputDiagnostic = label;
      description.textContent = value;
      return [term, description];
    }));
  };

  let unsubscribeAdapterDiagnostics: (() => void) | undefined;
  const bindAdapterDiagnostics = (adapter: BabylonWorldAdapter): (() => void) => {
    unsubscribeAdapterDiagnostics?.();
    const renderFromAdapter = (): void => {
      renderCameraInputDebug(adapter.getArrowInputDiagnosticSnapshot());
      renderCameraDiagnostics();
    };
    unsubscribeAdapterDiagnostics = adapter.subscribe(renderFromAdapter);
    return () => {
      unsubscribeAdapterDiagnostics?.();
      unsubscribeAdapterDiagnostics = undefined;
    };
  };

  const renderCameraSliders = (): void => {
    const profile = activeTunableCameraProfile();
    const base = profile?.parameters ?? {};
    cameraTuning = profile === undefined
      ? {}
      : { ...(cameraTuningByProfileRef[profile.resourceRef] ?? {}) } as CameraTuningV1;
    const settings: Array<{
      key: CameraTuningParameterNameV1;
      label: string;
      help: string;
      step: number;
      fallback: number;
    }> = [
      { key: "distanceMeters", label: "跟随距离", help: "镜头离主体有多远", step: 0.1, fallback: Number(base.distanceMeters ?? 5) },
      { key: "targetHeightMeters", label: "环绕焦点高度", help: "镜头围绕主体上方这个焦点旋转，不是相机自身高度；主体有 Camera Target 挂点时改由挂点决定。", step: 0.05, fallback: Number(base.targetHeightMeters ?? 1.2) },
      { key: "pitchRadians", label: "初始俯仰角", help: "决定镜头回正后的基础俯视或仰视角度；手动拖动仍可在此基础上自由环绕。", step: 0.01, fallback: Number(base.pitchRadians ?? 0.25) },
      { key: "positionDampingPerSecond", label: "整体位置阻尼", help: "未单独覆盖水平或垂直阻尼时，同时控制两个轴；轴向 Preview 值优先", step: 0.1, fallback: Number(base.positionDampingPerSecond ?? 12) },
      { key: "horizontalPositionDampingPerSecond", label: "水平跟随速度", help: "调低后主体会在画面左右/前后先行，调高后镜头更快追上", step: 0.1, fallback: Number(base.horizontalPositionDampingPerSecond ?? base.positionDampingPerSecond ?? 12) },
      { key: "verticalPositionDampingPerSecond", label: "垂直跟随速度", help: "单独控制跳跃、坡面和水面起伏时镜头上下跟随的快慢", step: 0.1, fallback: Number(base.verticalPositionDampingPerSecond ?? base.positionDampingPerSecond ?? 12) },
      { key: "maximumPositionLagMeters", label: "主体最多领先镜头的距离", help: "限制主体最多能冲到镜头前方多远；设为 0 时镜头位置紧跟", step: 0.1, fallback: Number(base.maximumPositionLagMeters ?? 4) },
      { key: "yawDampingPerSecond", label: "水平旋转跟随", help: "越高越快跟上主体转向，越低越有电影感", step: 0.1, fallback: Number(base.yawDampingPerSecond ?? base.rotationDampingPerSecond ?? 14) },
      { key: "pitchDampingPerSecond", label: "俯仰旋转跟随", help: "单独控制镜头上下抬落的平滑速度", step: 0.1, fallback: Number(base.pitchDampingPerSecond ?? base.rotationDampingPerSecond ?? 14) },
      { key: "rotationDampingPerSecond", label: "整体旋转阻尼", help: "未单独覆盖偏航或俯仰阻尼时，同时控制两个轴；轴向 Preview 值优先", step: 0.1, fallback: Number(base.rotationDampingPerSecond ?? 14) },
      { key: "lookSensitivityXRatio", label: "水平拖镜灵敏度", help: "鼠标水平拖动同样距离时，镜头左右旋转的倍率。", step: 0.05, fallback: Number(base.lookSensitivityXRatio ?? 1) },
      { key: "lookSensitivityYRatio", label: "垂直拖镜灵敏度", help: "鼠标垂直拖动同样距离时，镜头上下旋转的倍率。", step: 0.05, fallback: Number(base.lookSensitivityYRatio ?? 1) },
      { key: "collisionRadiusMeters", label: "Probe Size（球形 Sweep 半径）", help: "0 使用射线；正值使用 Havok 球形 Sweep。默认 0.12 米（12 cm），数值越大越早收臂。", step: 0.01, fallback: Number(base.collisionRadiusMeters ?? 0.12) },
      { key: "collisionRetractionMetersPerSecond", label: "遇墙缩近速度", help: "遮挡出现时镜头向主体收回的速度", step: 0.25, fallback: Number(base.collisionRetractionMetersPerSecond ?? 30) },
      { key: "collisionRecoveryMetersPerSecond", label: "离墙恢复速度", help: "遮挡消失后镜头慢慢回到原距离的速度", step: 0.25, fallback: Number(base.collisionRecoveryMetersPerSecond ?? 5) },
      { key: "lookAheadSeconds", label: "启动时镜头向前带", help: "主体移动时焦点沿前进方向预看；设为 0 完全关闭", step: 0.01, fallback: Number(base.lookAheadSeconds ?? 0.2) },
      { key: "accelerationLookAheadSecondsSquared", label: "加速预判", help: "急加速和急转时根据加速度额外预看；设为 0 关闭", step: 0.01, fallback: Number(base.accelerationLookAheadSecondsSquared ?? 0) },
      { key: "minimumHeadingSpeedMetersPerSecond", label: "速度镜头起效门槛", help: "低于该速度时保持最后稳定方向，避免停车或低速抖动", step: 0.1, fallback: Number(base.minimumHeadingSpeedMetersPerSecond ?? 0.5) },
      { key: "velocityHeadingDampingPerSecond", label: "追逐方向跟随速度", help: "速度方向改变后镜头旋转跟上的快慢", step: 0.25, fallback: Number(base.velocityHeadingDampingPerSecond ?? 10) },
      { key: "transitionSeconds", label: "镜头配置过渡时长", help: "仅在 Runtime 切换 Camera Profile 或上下文镜头时控制过渡时长，不影响手动自由环绕。", step: 0.05, fallback: Number(base.transitionSeconds ?? 0.35) },
      { key: "baseFovDegrees", label: "视野角（FOV）", help: "基础垂直视野角。数值越大，画面容纳范围越广，但边缘透视也会更强。", step: 0.5, fallback: Number(base.baseFovDegrees ?? 60) },
      { key: "speedFovDegreesPerMeterPerSecond", label: "加速时视野变宽", help: "速度越快画面越有冲刺感；设为 0 完全关闭", step: 0.05, fallback: Number(base.speedFovDegreesPerMeterPerSecond ?? 0) },
      { key: "maximumSpeedFovDegrees", label: "冲刺视野上限", help: "限制高速时最多额外增加多少视野", step: 0.5, fallback: Number(base.maximumSpeedFovDegrees ?? 0) },
      { key: "fovDampingPerSecond", label: "动态 FOV 响应速度", help: "只控制速度驱动的动态 FOV 追上目标值的快慢；越高响应越快，设为 0 时保持当前 FOV。", step: 0.25, fallback: Number(base.fovDampingPerSecond ?? 8) },
      { key: "horizontalDeadZoneRatio", label: "画面水平容忍区", help: "主体在画面中心附近移动时允许镜头暂不跟随；设为 0 关闭", step: 0.01, fallback: Number(base.horizontalDeadZoneRatio ?? 0) },
      { key: "verticalDeadZoneRatio", label: "画面垂直容忍区", help: "跳跃或起伏在小范围内时允许镜头保持稳定", step: 0.01, fallback: Number(base.verticalDeadZoneRatio ?? 0) },
      { key: "recenterDelaySeconds", label: "自动回正等待", help: "停止手动拖动后等待多久才开始自动回正", step: 0.05, fallback: Number(base.recenterDelaySeconds ?? 1.2) },
      { key: "recenterDurationSeconds", label: "自动回正时长", help: "镜头回到基础方向所需的柔和时间；设为 0 立即回正", step: 0.05, fallback: Number(base.recenterDurationSeconds ?? 0.8) },
      { key: "recenterMinimumSpeedMetersPerSecond", label: "触发回正的最低速度", help: "低于这个速度时不因前进自动回正，避免原地镜头摆动", step: 0.1, fallback: Number(base.recenterMinimumSpeedMetersPerSecond ?? 0.8) },
      { key: "teleportSnapDistanceMeters", label: "瞬移识别距离", help: "主体一帧跨过该距离时镜头直接同步，避免从远处慢慢追", step: 1, fallback: Number(base.teleportSnapDistanceMeters ?? 20) },
    ];
    const firstPersonUnsupported = new Set<CameraTuningParameterNameV1>([
      "distanceMeters",
      "collisionRadiusMeters",
      "collisionRetractionMetersPerSecond",
      "collisionRecoveryMetersPerSecond",
      "lookAheadSeconds",
      "accelerationLookAheadSecondsSquared",
      "horizontalDeadZoneRatio",
      "verticalDeadZoneRatio",
    ]);
    const primaryCameraKeys = new Set<CameraTuningParameterNameV1>([
      "distanceMeters",
      "targetHeightMeters",
      "pitchRadians",
      "baseFovDegrees",
      "lookSensitivityXRatio",
      "lookSensitivityYRatio",
    ]);
    const cameraResponseKeys = new Set<CameraTuningParameterNameV1>([
      "transitionSeconds",
      "speedFovDegreesPerMeterPerSecond",
      "maximumSpeedFovDegrees",
      "fovDampingPerSecond",
    ]);
    const groupForSetting = (key: CameraTuningParameterNameV1): "camera-view" | "camera-response" | "follow-arm" | "collision" | "lag" =>
      primaryCameraKeys.has(key) ? "camera-view"
        : cameraResponseKeys.has(key) ? "camera-response"
          : key.startsWith("collision") ? "collision"
        : ["rotationDampingPerSecond", "yawDampingPerSecond", "pitchDampingPerSecond", "minimumHeadingSpeedMetersPerSecond", "velocityHeadingDampingPerSecond", "recenterDelaySeconds", "recenterDurationSeconds", "recenterMinimumSpeedMetersPerSecond"].includes(key) ? "follow-arm"
          : ["positionDampingPerSecond", "horizontalPositionDampingPerSecond", "verticalPositionDampingPerSecond", "maximumPositionLagMeters", "lookAheadSeconds", "accelerationLookAheadSecondsSquared", "horizontalDeadZoneRatio", "verticalDeadZoneRatio", "teleportSnapDistanceMeters"].includes(key) ? "lag"
            : "camera-view";
    const camera = cameraSnapshotForDisplay();
    const tracking = camera?.mode === "tracking" ? camera : undefined;
    const eligibleSettings = settings.filter((setting) =>
      profile?.authoringRanges?.[setting.key] !== undefined &&
      isCameraParameterEffective(profile, setting.key) &&
      (setting.key !== "targetHeightMeters" || tracking?.selectedTargetSocketId === undefined) &&
      (profile.baseMode !== "first-person" || !firstPersonUnsupported.has(setting.key))
    );
    const createSlider = (setting: typeof settings[number]): HTMLElement => {
      const range = profile?.authoringRanges?.[setting.key];
      if (range === undefined) throw new Error("Expected authoring range for rendered camera setting.");
      const safetyLimit = profile?.safetyLimits?.[setting.key] ??
        CAMERA_TUNING_SAFETY_LIMITS_V1[setting.key];
      const value = cameraTuning[setting.key] ?? setting.fallback;
      const label = document.createElement("div");
      label.className = "friendly-slider";
      label.dataset.cameraControl = setting.key;
      const summary = document.createElement("span");
      const heading = document.createElement("span");
      heading.className = "friendly-slider-heading";
      const title = document.createElement("strong");
      title.textContent = setting.label;
      const help = document.createElement("small");
      help.className = "parameter-help-text";
      help.id = `camera-parameter-help-${setting.key}`;
      help.hidden = true;
      const helpButton = document.createElement("button");
      helpButton.type = "button";
      helpButton.className = "parameter-help-button";
      helpButton.textContent = "!";
      helpButton.setAttribute("aria-label", `查看“${setting.label}”参数说明`);
      helpButton.setAttribute("aria-controls", help.id);
      helpButton.setAttribute("aria-expanded", "false");
      helpButton.addEventListener("click", () => {
        help.hidden = !help.hidden;
        helpButton.setAttribute("aria-expanded", String(!help.hidden));
      });
      const unit = cameraParameterUnit(setting.key);
      const renderProvenance = (): void => {
        const camera = cameraSnapshotForDisplay();
        const tracking = camera?.mode === "tracking" ? camera : undefined;
        const socket = tracking?.selectedTargetSocketId ??
          (tracking?.isTargetSocketFallback ? "目标高度回退" : "运行时未绑定");
        const profileDefault = profile?.parameters?.[setting.key];
        const hasPreviewOverride = tracking?.previewParameterOverrides !== undefined &&
          Object.hasOwn(tracking.previewParameterOverrides, setting.key);
        const resolvedValue = tracking?.resolvedParameters?.[setting.key];
        const finalSource = hasPreviewOverride
          ? "Preview 覆盖"
          : resolvedValue !== undefined && resolvedValue !== profileDefault
            ? "Context Rule / Modifier"
            : "锁定 Profile";
        const heading = profile?.headingSource === "target-velocity"
          ? "速度朝向"
          : profile?.headingSource === "target-forward"
            ? "主体朝向"
            : "视角朝向";
        const mode = profile?.baseMode === "first-person" ? "第一人称" : "第三人称";
        help.textContent = `${setting.help} · 单位：${unit} · Authoring 范围 ${range.minimum}–${range.maximum}（步长 ${range.step}）· Safety 范围 ${safetyLimit.minimum}–${safetyLimit.maximum} · 锁定 Profile 默认 ${typeof profileDefault === "number" ? profileDefault : "未声明"} · 生效条件：${mode} / ${heading} / Socket ${socket} · 最终来源：${finalSource}`;
      };
      renderProvenance();
      heading.append(title, helpButton);
      summary.append(heading);
      const control = document.createElement("div");
      const input = document.createElement("input");
      input.type = "range";
      input.setAttribute("aria-label", setting.label);
      input.min = String(range.minimum);
      input.max = String(range.maximum);
      input.step = String(range.step);
      input.value = String(value);
      const output = document.createElement("output");
      output.textContent = Number(value).toFixed(2);
      input.addEventListener("input", () => {
        const nextValue = Number(input.value);
        cameraTuning[setting.key] = nextValue;
        if (profile !== undefined) {
          cameraTuningByProfileRef[profile.resourceRef] = { ...cameraTuning } as Record<string, number>;
        }
        output.textContent = nextValue.toFixed(2);
        applyCameraTuning();
        renderProvenance();
        persistWorkingDraft();
        syncContextPreviewMode("draft");
        renderCameraDiagnostics();
        saveStatus.textContent = `“${setting.label}”已应用；这组数值只属于当前镜头`;
      });
      control.append(input, output);
      label.append(summary, control, help);
      return label;
    };
    const appendGroup = (
      target: HTMLElement,
      group: "camera-view" | "camera-response" | "follow-arm" | "collision" | "lag",
      title: string,
      showHeading = true,
    ): void => {
      const controls = eligibleSettings.filter((setting) => groupForSetting(setting.key) === group)
        .sort((left, right) => group === "camera-view"
          ? [...primaryCameraKeys].indexOf(left.key) - [...primaryCameraKeys].indexOf(right.key)
          : 0)
        .map(createSlider);
      if (controls.length === 0) return;
      const section = document.createElement("section");
      section.dataset.cameraGroup = group;
      const heading = document.createElement("h5");
      heading.textContent = title;
      const grid = document.createElement("div");
      grid.className = "friendly-slider-grid camera-tuning-grid";
      grid.append(...controls);
      section.append(...(showHeading ? [heading, grid] : [grid]));
      target.append(section);
    };
    cameraBasic.replaceChildren();
    cameraExpert.replaceChildren();
    appendGroup(cameraBasic, "camera-view", "取景与操控", false);
    if (profile?.baseMode !== "first-person") {
      appendGroup(cameraExpert, "camera-response", "Camera Response");
      appendGroup(cameraExpert, "follow-arm", "Follow Arm");
      appendGroup(cameraExpert, "collision", "Collision");
      appendGroup(cameraExpert, "lag", "Lag");
    }
    applyCameraTuning();
    renderCameraDiagnostics();
  };

  const refreshCameraCards = (): void => {
    cameraCards.replaceChildren(...cameraConsoleRows.map((row) => {
        const friendly = FRIENDLY_CAMERA_PROFILES[row.resourceRef];
        const mode = row.baseMode === undefined ? "通用" : FRIENDLY_CAMERA_BASE_MODES[row.baseMode] ?? row.baseMode;
        return { resourceRef: row.resourceRef, displayName: friendly?.[0] ?? row.displayName, description: `${mode} · ${friendly?.[1] ?? "通用相机预制"}` };
      }).map((row) => {
      const card = document.createElement("article");
      card.dataset.cameraProfileRef = row.resourceRef;
      if (row.resourceRef === cameraPreference) card.classList.add("selected");
      card.innerHTML = `<div><strong>${escapeHtml(row.displayName)}</strong><p>${escapeHtml(row.description)}</p></div><button type="button">${row.resourceRef === cameraPreference ? "当前正在使用" : "应用并预览"}</button>`;
      const button = card.querySelector("button")!;
      button.disabled = row.resourceRef === cameraPreference;
      button.addEventListener("click", async () => {
        try {
          await executeCameraPreference(api, {
            mode: "camera-rig-profile",
            cameraRigProfileRef: row.resourceRef,
          });
          cameraPreference = row.resourceRef;
          appliedCameraPreferenceRef = row.resourceRef;
          syncCompactCameraSelect();
          writeLocalDraft("worldkit.camera-preference", row.resourceRef);
          refreshCameraCards();
          renderCameraSliders();
          persistWorkingDraft();
          syncContextPreviewMode("draft");
          saveStatus.textContent = `已应用“${row.displayName}”，现在可以在左侧拖动体验`;
        } catch {
          saveStatus.textContent = `“${row.displayName}”未能应用，原镜头已保留`;
        }
      });
      return card;
    }));
  };
  const uniqueMotionProfiles = [...new Map(
    workbenchContext.motionProfiles.map((profile) => [profile.resourceRef, profile]),
  ).values()];
  const motionSelect = requiredElement<HTMLSelectElement>("#tuning-motion-select");
  const syncMotionSelect = (): void => {
    if ([...motionSelect.options].some((option) => option.value === selectedMotionProfileRef)) {
      motionSelect.value = selectedMotionProfileRef;
    }
  };
  const renderMotionSelect = (): void => {
    motionSelect.replaceChildren(...uniqueMotionProfiles.map((profile) => {
      const roleLabel = profile.role === "default"
        ? "默认"
        : profile.role === "fallback"
          ? "安全回退"
          : "可选";
      return new Option(
        `${profile.displayName} · ${roleLabel}`,
        profile.resourceRef,
        false,
        profile.resourceRef === selectedMotionProfileRef,
      );
    }));
    motionSelect.disabled = uniqueMotionProfiles.length === 0;
    syncMotionSelect();
  };
  const applySelectedMotion = async (motionProfileRef: string): Promise<boolean> => {
    if (!uniqueMotionProfiles.some((profile) => profile.resourceRef === motionProfileRef)) {
      return false;
    }
    selectedMotionProfileRef = motionProfileRef;
    syncMotionSelect();
    const draft = persistWorkingDraft();
    if (draft === undefined) return false;
    return await applyWorkingDraftAtomically(draft);
  };
  motionSelect.addEventListener("change", async () => {
    if (!await applySelectedMotion(motionSelect.value)) {
      syncMotionSelect();
      saveStatus.textContent = "运动算法未能切换，已保留上一组锁定配置";
      return;
    }
    syncContextPreviewMode("draft");
    saveStatus.textContent = "已选择运动算法；运行时将在下一个固定 tick 提交";
  });

  refreshCameraCards();
  renderCameraSliders();
  renderCameraInputDebug(undefined);
  const cameraOverlayToggle = requiredElement<HTMLButtonElement>("#tuning-camera-overlay-toggle");
  cameraOverlayToggle.addEventListener("click", () => {
    cameraOverlay.hidden = !cameraOverlay.hidden;
    cameraOverlayToggle.setAttribute("aria-pressed", String(!cameraOverlay.hidden));
    cameraOverlayToggle.textContent = cameraOverlay.hidden ? "显示开发 Overlay" : "隐藏开发 Overlay";
    renderCameraDiagnostics();
  });
  requiredElement<HTMLButtonElement>("#reset-camera-view-button").addEventListener("click", () => {
    try {
      api.resetCameraView?.();
      saveStatus.textContent = "镜头已回到主体后方";
    } catch {
      saveStatus.textContent = "镜头暂时无法回正，当前状态已保留";
    }
  });
  renderMotionSelect();
  renderMotionSliders();

  const versionNameInput = requiredElement<HTMLInputElement>("#tuning-version-name");
  const versionNotesInput = requiredElement<HTMLTextAreaElement>("#tuning-version-notes");
  const versionList = requiredElement<HTMLDivElement>("#tuning-version-list");
  const saveVersionButton = requiredElement<HTMLButtonElement>("#tuning-save-version-button");

  const refreshWorkbenchAfterRestore = (): void => {
    refreshCameraCards();
    renderCameraSliders();
    renderMotionSelect();
    renderMotionSliders();
    const compactCameraSelect = document.querySelector<HTMLSelectElement>("#camera-preference-select");
    if (compactCameraSelect !== null && [...compactCameraSelect.options].some(
      (option) => option.value === cameraPreference,
    )) {
      compactCameraSelect.value = cameraPreference;
    }
    syncContextCameraButtons(cameraPreference);
  };

  const createRegistryBaselineDraft = (): SubjectPresetWorkingDraftV1 | undefined => {
    if (
      localBaseline === undefined ||
      defaultMotion === undefined ||
      controlFeelProfile === undefined ||
      controlProfile === undefined
    ) {
      return undefined;
    }
    const now = new Date().toISOString();
    return createSubjectPresetWorkbenchDraftV1({
      baseline: localBaseline,
      draftIdentity: {
        draftId: `baseline-preview-${globalThis.crypto.randomUUID()}`,
        createdAtIso: now,
        updatedAtIso: now,
      },
      selectedMotionProfileRef: defaultMotion.resourceRef,
      selectedControlFeelProfileRef: controlFeelProfile.resourceRef,
      selectedCameraPreferenceRef: cameraConsoleRows.some(
          (profile) => profile.resourceRef === localBaseline.defaultCameraProfileRef,
        )
        ? localBaseline.defaultCameraProfileRef
        : CAMERA_CONSOLE_DEFAULT_PROFILE_REF,
      controlFeel: {
        baseParameters: controlFeelProfile.parameters ?? {},
        currentValues: numericParameters(controlFeelProfile.parameters),
        ...(controlFeelProfile.runtimeParameterNames === undefined
          ? {}
          : { runtimeParameterNames: controlFeelProfile.runtimeParameterNames }),
      },
      control: {
        baseParameters: controlProfile.parameters ?? {},
        currentValues: numericParameters(controlProfile.parameters),
        ...(controlProfile.runtimeParameterNames === undefined
          ? {}
          : { runtimeParameterNames: controlProfile.runtimeParameterNames }),
      },
      cameraByProfileRef: Object.fromEntries(cameraConsoleRows.map((profile) => [
        profile.resourceRef,
        {
          baseParameters: profile.parameters ?? {},
          currentValues: numericParameters(profile.parameters),
        },
      ])),
    });
  };

  const setPreviewMode = async (mode: "baseline" | "draft"): Promise<void> => {
    let previewDraft: SubjectPresetWorkingDraftV1 | undefined;
    try {
      previewDraft = mode === "baseline"
        ? createRegistryBaselineDraft()
        : createCurrentWorkingDraft();
    } catch {
      saveStatus.textContent = "当前 Registry 基线无法转换为预览草稿";
      return;
    }
    if (previewDraft === undefined) {
      saveStatus.textContent = "当前主体缺少完整 Registry 基线，无法切换预览";
      return;
    }
    if (!await applyWorkingDraftAtomically(previewDraft, {
      preserveCameraForGoldenLock: true,
    })) {
      return;
    }
    syncContextPreviewMode(mode);
    saveStatus.textContent = mode === "baseline"
      ? "正在预览 Registry Baseline；草稿仍保存在本机"
      : "已恢复本机 Draft Preview";
  };

  requiredElement<HTMLButtonElement>("#preview-baseline-button")
    .addEventListener("click", () => void setPreviewMode("baseline"));
  requiredElement<HTMLButtonElement>("#preview-draft-button")
    .addEventListener("click", () => void setPreviewMode("draft"));
  requiredElement<HTMLButtonElement>("#tuning-reset-draft-button")
    .addEventListener("click", () => {
      void (async () => {
        resetTuningStateToRegistry();
        const draft = persistWorkingDraft();
        refreshWorkbenchAfterRestore();
        if (draft !== undefined) {
          await applyWorkingDraftAtomically(draft, {
            preserveCameraForGoldenLock: true,
          });
        }
        syncContextPreviewMode("draft");
        saveStatus.textContent = "草稿已恢复到 Registry Baseline";
      })();
    });

  const renderLocalVersions = (): void => {
    if (localRepository === undefined || localBaseline === undefined) {
      versionList.innerHTML = '<p class="friendly-empty">当前 Runtime 没有提供精确资源锁，暂时不能保存可恢复版本。</p>';
      saveVersionButton.disabled = true;
      return;
    }
    const versions = [...localRepository.listVersions(localBaseline.subjectDefinitionId)].reverse();
    const localDefault = localRepository.getLocalDefault(localBaseline.subjectDefinitionId);
    if (versions.length === 0) {
      versionList.innerHTML = '<p class="friendly-empty">还没有保存版本。先完成调参，再给这一版起个容易辨认的名字。</p>';
      return;
    }
    versionList.replaceChildren(...versions.map((version) => {
      const card = document.createElement("article");
      if (localDefault?.localVersionId === version.localVersionId) card.classList.add("is-default");
      const heading = document.createElement("div");
      heading.className = "local-version-heading";
      heading.innerHTML = `
        <div><strong>${escapeHtml(version.displayName)}</strong><small>${new Date(version.createdAtIso).toLocaleString("zh-CN", { hour12: false })}</small></div>
        ${localDefault?.localVersionId === version.localVersionId ? '<span>本机默认</span>' : ""}
      `;
      const notes = document.createElement("p");
      notes.textContent = version.notes || "没有备注";
      const actions = document.createElement("div");
      actions.className = "local-version-actions";
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.textContent = "恢复并应用";
      restoreButton.addEventListener("click", async () => {
        const previousDraft = createCurrentWorkingDraft();
        try {
          const restored = localRepository.restoreVersion(version.localVersionId).value;
          loadDraftIntoTuningState(restored);
          const normalized = persistWorkingDraft();
          if (normalized === undefined || !await applyWorkingDraftAtomically(normalized)) {
            if (previousDraft !== undefined) {
              loadDraftIntoTuningState(previousDraft);
              localRepository.saveWorkingDraft(previousDraft);
            } else {
              resetTuningStateToRegistry();
            }
            refreshWorkbenchAfterRestore();
            return;
          }
          refreshWorkbenchAfterRestore();
          writeLocalDraft("worldkit.camera-preference", cameraPreference);
          saveStatus.textContent = `已恢复“${version.displayName}”：锁定的 Feel/Control Ref 与相机预览已应用，未 promote 的数字仍保留为草稿`;
        } catch {
          if (previousDraft !== undefined) loadDraftIntoTuningState(previousDraft);
          refreshWorkbenchAfterRestore();
          saveStatus.textContent = `“${version.displayName}”无法恢复，当前配置没有改变`;
        }
      });
      const defaultButton = document.createElement("button");
      defaultButton.type = "button";
      defaultButton.textContent = localDefault?.localVersionId === version.localVersionId
        ? "已是本机默认"
        : "设为本机默认";
      defaultButton.disabled = localDefault?.localVersionId === version.localVersionId;
      defaultButton.addEventListener("click", () => {
        try {
          const receipt = localRepository.setLocalDefault({
            schemaVersion: 1,
            subjectDefinitionId: localBaseline.subjectDefinitionId,
            baseSubjectDefinitionRef: localBaseline.subjectDefinitionRef,
            baseSubjectDefinitionContentHash: localBaseline.subjectDefinitionContentHash,
            localVersionId: version.localVersionId,
          });
          renderLocalVersions();
          saveStatus.textContent = receipt.status === "persisted"
            ? `“${version.displayName}”已设为本机默认；下次打开会自动使用`
            : "浏览器不能写入磁盘，本机默认只在本次页面中有效";
        } catch {
          saveStatus.textContent = "本机默认没有设置成功；版本与当前主体可能已经不一致";
        }
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger";
      deleteButton.textContent = "删除";
      deleteButton.addEventListener("click", () => {
        if (!window.confirm(`确定删除本地版本“${version.displayName}”吗？这个操作无法撤销。`)) return;
        try {
          const receipt = localRepository.deleteVersion(version.localVersionId);
          renderLocalVersions();
          saveStatus.textContent = receipt.value.clearedLocalDefault
            ? "版本已删除；它原本是本机默认，因此默认标记也已清除"
            : "本地版本已删除";
        } catch {
          saveStatus.textContent = "这个版本没有删除成功，其他版本未受影响";
        }
      });
      actions.append(restoreButton, defaultButton, deleteButton);
      card.append(heading, notes, actions);
      return card;
    }));
  };

  saveVersionButton.addEventListener("click", () => {
    const displayName = versionNameInput.value.trim();
    if (displayName.length === 0) {
      versionNameInput.focus();
      saveStatus.textContent = "请先填写版本名称，方便以后辨认和恢复";
      return;
    }
    if (localRepository === undefined) {
      saveStatus.textContent = "当前页面还不能创建本地版本";
      return;
    }
    try {
      const draft = persistWorkingDraft();
      if (draft === undefined) throw new Error("Missing exact preset baseline");
      const receipt = localRepository.saveVersion(draft, {
        displayName,
        notes: versionNotesInput.value.trim(),
      });
      versionNameInput.value = "";
      versionNotesInput.value = "";
      renderLocalVersions();
      saveStatus.textContent = receipt.status === "persisted"
        ? `“${receipt.value.displayName}”已保存为本地版本`
        : "版本已暂存在内存，但浏览器没有写入磁盘";
    } catch {
      saveStatus.textContent = "版本没有保存成功；当前 Runtime 配置未被修改";
    }
  });
  renderLocalVersions();

  const result = requiredElement<HTMLPreElement>("#tuning-result");
  const relationshipPreviewOnly = workbenchContext.hostOverlay?.changes.some(
    (change) => change.type === "relationship-capabilities-deferred",
  ) === true;
  let lastHarnessPassedCheckIds: string[] | undefined;
  const runHarness = async (): Promise<void> => {
    if (api.runHarness === undefined) return;
    result.textContent = "正在检查操作、物理、相机、清理和安全回退…";
    try {
      const report = await api.runHarness(workbenchContext.controlledEntityId);
      lastHarnessPassedCheckIds = report.checks
        .filter((check) => check.status === "passed")
        .map((check) => check.checkId);
      const passed = lastHarnessPassedCheckIds.length;
      const failed = report.checks.filter((check) => check.status === "failed");
      result.textContent = failed.length === 0
        ? relationshipPreviewOnly
          ? `检查完成：${passed}/9 项通过。运动和相机预览可以导出；Seat、Tether 或 Mount 关系尚未参与本次验收，导出文件会保留暂缓说明。`
          : `检查完成：${passed}/9 项通过，可以导出。`
        : `检查完成：${passed}/9 项通过。需要关注：${failed.map((check) => check.checkId).join("、")}`;
    } catch {
      lastHarnessPassedCheckIds = undefined;
      result.textContent = "自动检查没有完成，世界状态未被修改。";
    }
  };
  requiredElement<HTMLButtonElement>("#tuning-harness-button").addEventListener("click", () => void runHarness());

  const exportCurrent = async (): Promise<boolean> => {
    const draft = persistWorkingDraft() ?? createCurrentWorkingDraft();
    if (draft === undefined || localBaseline === undefined || exactBaseline === undefined) {
      saveStatus.textContent = "当前主体没有完整的 Registry 基线，无法导出 Candidate";
      return false;
    }
    const harness = exactBaseline.closure.entries.find(
      (entry) => entry.resourceKind === "harness-profile",
    );
    if (harness === undefined) {
      saveStatus.textContent = "基线缺少 Harness Profile，无法导出 Candidate";
      return false;
    }
    const harnessProfile = builtInSubjectResourceRegistry.resolveHarnessProfile(
      harness.resourceRef,
    );
    const passedCheckIds = lastHarnessPassedCheckIds === undefined
      ? []
      : [...lastHarnessPassedCheckIds].sort();
    if (harnessProfile === undefined) {
      saveStatus.textContent = "锁定的 Harness Profile 无法解析，不能导出 Candidate";
      return false;
    }
    const defaultCameraRigProfileRef = isConsoleCameraProfileRef(cameraPreference)
      ? cameraPreference
      : CAMERA_CONSOLE_DEFAULT_PROFILE_REF;
    try {
      const sourceCommit = await loadTrustedSourceCommitV1();
      const candidate = createSubjectPresetCandidateFromSelectionsV1({
        candidateId: `playground-export-${Date.now()}`,
        subjectDefinitionRef: draft.baseSubjectDefinitionRef,
        selectedMotionProfileRef: draft.selectedMotionProfileRef,
        selectedControlFeelProfileRef: draft.selectedControlFeelProfileRef,
        selectedControlProfileRef: draft.selectedControlProfileRef,
        defaultCameraRigProfileRef,
        controlFeelOverridesByProfileRef: draft.controlFeelOverridesByProfileRef,
        controlOverridesByProfileRef: draft.controlOverridesByProfileRef,
        cameraOverridesByProfileRef: draft.cameraOverridesByProfileRef,
        provenance: {
          displayName: `${subjectFriendlyName(workbenchContext.definition)} playground candidate`,
          notes: "Exported from the Playground authoring workbench.",
          createdAtIso: new Date().toISOString(),
          sourceCommit,
        },
        evidence: {
          harnessProfileRef: harness.resourceRef,
          passedCheckIds,
          runtimeBuild: "playground-local",
        },
      });
      downloadJson(
        `${workbenchContext.definition.semanticClassId.replaceAll(".", "-")}.worldkit-subject-preset-candidate.json`,
        candidate,
      );
      saveStatus.textContent =
        "Publication Candidate 已导出；浏览器检查仅作参考，promote 仍需可信 Harness Receipt";
      return true;
    } catch (error) {
      saveStatus.textContent = error instanceof Error
        ? `Candidate 未能导出：${error.message}`
        : "Candidate 未能导出";
      return false;
    }
  };
  for (const selector of ["#tuning-export-button", "#tuning-export-footer-button"]) {
    requiredElement<HTMLButtonElement>(selector).addEventListener("click", () => {
      void exportCurrent();
    });
  }
  return {
    setCameraPreferenceFromCompact(preference: string): void {
      cameraPreference = normalizeCameraPreference(preference);
      appliedCameraPreferenceRef = cameraPreference;
      syncCompactCameraSelect();
      refreshCameraCards();
      renderCameraSliders();
      persistWorkingDraft();
    },
    setSelectedMotionProfileFromCompact(motionProfileRef: string): Promise<boolean> {
      return applySelectedMotion(motionProfileRef);
    },
    async reapplyWorkingDraftAfterSimulationReset(): Promise<void> {
      appliedCameraPreferenceRef = null;
      appliedGameplayProfileSelection = {
        motionProfileRef: defaultMotion?.resourceRef ?? "",
        controlFeelProfileRef: controlFeelProfile?.resourceRef ?? "",
      };
      const draft = createCurrentWorkingDraft();
      if (draft === undefined) return;
      if (
        api.getSubjectSnapshot === undefined ||
        api.executeCameraViewCommand === undefined ||
        api.applyCameraPreview === undefined ||
        api.applySubjectPresetTuning === undefined
      ) {
        return;
      }
      const activeSubject = api.getSubjectSnapshot(workbenchContext.controlledEntityId);
      if (
        activeSubject === undefined ||
        activeSubject.entityState.entityDefinitionRef !== draft.baseSubjectDefinitionRef ||
        activeSubject.entityState.entityDefinitionHash.length === 0
      ) {
        saveStatus.textContent = "重置后未能恢复草稿：当前主体与草稿锁定的定义不匹配";
        return;
      }

      try {
        await applyCameraDraft(draft);
      } catch {
        saveStatus.textContent = "重置后未能恢复镜头草稿；Runtime 已保留重置后的安全镜头";
        return;
      }

      try {
        const receipt = api.applySubjectPresetTuning(subjectPresetTuningRequestFromDraftV1(
          draft,
          workbenchContext.controlledEntityId,
          activeSubject.entityState.entityDefinitionHash,
        ));
        if (receipt.status === "committed") {
          appliedGameplayProfileSelection = {
            motionProfileRef: draft.selectedMotionProfileRef,
            controlFeelProfileRef: draft.selectedControlFeelProfileRef,
          };
          saveStatus.textContent = "重置后已恢复镜头与可实时应用的 Gameplay 配置";
          return;
        }
        if (receipt.diagnostic?.code === "SUBJECT_PRESET_GOLDEN_RECOMPILE_REQUIRED") {
          saveStatus.textContent = "重置后已恢复镜头；Gameplay 继续使用编译锁定的 Canonical Scene Plan";
          return;
        }
        saveStatus.textContent = `重置后已恢复镜头；Gameplay 未恢复：${receipt.diagnostic?.message ?? "配置与当前主体不匹配"}`;
        return;
      } catch {
        saveStatus.textContent = "重置后已恢复镜头；Gameplay 恢复失败并保留重置后的 Canonical Scene Plan";
      }
    },
    exportPublicationCandidate(): Promise<boolean> {
      return exportCurrent();
    },
    bindAdapterDiagnostics,
  };
}

function installAuthoringRecoveryPanel(api: WorldkitBrowserApiV5): void {
  const definitions = api.listSubjectDefinitions?.({ includeExperimental: true }) ?? [];
  if (definitions.length === 0) return;
  const panel = requiredElement<HTMLDivElement>("#capability-card");
  const packageSelect = requiredElement<HTMLSelectElement>("#subject-package-select");
  const cameraSelect = requiredElement<HTMLSelectElement>("#camera-preference-select");
  const context = requiredElement<HTMLDivElement>("#capability-context");
  const drafts = requiredElement<HTMLDivElement>("#parameter-drafts");
  const harnessOutput = requiredElement<HTMLPreElement>("#harness-output");
  panel.hidden = false;
  packageSelect.replaceChildren(new Option("由 AuthoringSpec 固定", "fixed"));
  packageSelect.disabled = true;
  cameraSelect.replaceChildren(new Option("Runtime 启动后可用", "unavailable"));
  cameraSelect.disabled = true;
  context.innerHTML = `
    <div><span>Status</span><code>RECOVERY MODE</code></div>
    <div><span>Package</span><code>AuthoringSpec source</code></div>
  `;
  drafts.innerHTML = `
    <p>当前主体未能启动。请修复或重新发布 AuthoringSpec，再重试统一 Viewer。</p>
  `;
  harnessOutput.textContent = JSON.stringify(authoringStartupEvidence(api), null, 2);
  const controls = requiredElement<HTMLDivElement>("#controls-card");
  controls.innerHTML = `
    <p>恢复模式</p>
    <div><span>Subject Package</span><span>由 AuthoringSpec 固定</span></div>
    <div><span>重试</span><span>重新加载当前来源</span></div>
  `;
  const safePackageButton = requiredElement<HTMLButtonElement>("#fallback-button");
  safePackageButton.textContent = "来源不可替换";
  safePackageButton.disabled = true;
  const retryButton = requiredElement<HTMLButtonElement>("#harness-button");
  retryButton.textContent = "重试当前主体";
  retryButton.addEventListener("click", () => window.location.reload());
  const exportButton = requiredElement<HTMLButtonElement>("#export-package-button");
  exportButton.disabled = true;
}

async function installCapabilityAuthoringPanel(
  api: WorldkitBrowserApiV5,
  initialSnapshot: WorldRuntimeSnapshotV4,
  hostOverlay?: CapabilityDemoHostOverlayV1,
): Promise<TuningWorkbenchControllerV1 | undefined> {
  const definitions = api.listSubjectDefinitions?.({ includeExperimental: true }) ?? [];
  if (definitions.length === 0) return;
  const panel = requiredElement<HTMLDivElement>("#capability-card");
  panel.hidden = false;
  if (viewerMode) {
    requiredElement<HTMLElement>("#authoring-context-bar").hidden = false;
    document.body.classList.add("authoring-ready");
  }
  const packageSelect = requiredElement<HTMLSelectElement>("#subject-package-select");
  const cameraSelect = requiredElement<HTMLSelectElement>("#camera-preference-select");
  const context = requiredElement<HTMLDivElement>("#capability-context");
  const drafts = requiredElement<HTMLDivElement>("#parameter-drafts");
  const harnessOutput = requiredElement<HTMLPreElement>("#harness-output");
  const snapshot = initialSnapshot;
  const controlledEntityId = controlledEntityIdFromSnapshotV4(snapshot);
  const activeSubject = snapshot.world.subjectStatesByEntityId[controlledEntityId];
  const activeDefinitionRef = activeSubject?.entityState.entityDefinitionRef ??
    definitions[0]!.resourceRef;
  const activeRegistryDefinition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    activeDefinitionRef,
  );
  const activeDefinitionSummary: SubjectDefinitionSummaryV1 | undefined =
    activeRegistryDefinition !== undefined && "schemaVersion" in activeRegistryDefinition
      ? {
          resourceRef: activeRegistryDefinition.resourceRef,
          contentHash: activeRegistryDefinition.contentHash,
          displayName: activeRegistryDefinition.aiMetadata.displayName,
          semanticClassId: activeRegistryDefinition.semanticClassId,
          bodyTopology: activeRegistryDefinition.bodyTopology,
          authoringAvailability: activeRegistryDefinition.authoringAvailability,
          defaultMotionProfileRef: activeRegistryDefinition.profiles.motion.defaultMotionProfileRef,
          controlProfileRef: activeRegistryDefinition.profiles.controlProfileRef,
          cameraContextProfileRef: activeRegistryDefinition.profiles.cameraContextProfileRef,
        }
      : undefined;
  const activeDefinition = definitions.find(
    (definition) => definition.resourceRef === activeDefinitionRef,
  ) ?? activeDefinitionSummary;
  if (activeDefinition === undefined) return;
  const authoringDefinitions = [activeDefinition];
  packageSelect.replaceChildren(...authoringDefinitions.map((definition) => {
    const option = document.createElement("option");
    option.value = definition.resourceRef;
    option.textContent = definition.displayName;
    option.selected = definition.resourceRef === activeDefinitionRef;
    return option;
  }));

  const definition = authoringDefinitions.find((row) => row.resourceRef === activeDefinitionRef) ??
    authoringDefinitions[0]!;
  packageSelect.value = definition.resourceRef;
  packageSelect.disabled = true;
  packageSelect.title = "当前主体由 AuthoringSpec 固定；入口保留用于显示本次 3C 调试对象";
  const activeMotionProfile = builtInSubjectResourceRegistry.resolveMotionProfile(
    definition.defaultMotionProfileRef,
  );
  const activeKernel = api.listMotionKernels?.({
    includeExperimental: true,
    includeInternal: true,
  }).find(
    (kernel) => kernel.resourceRef === activeMotionProfile?.motionKernelRef,
  );
  const controls = requiredElement<HTMLDivElement>("#controls-card");
  controls.innerHTML = activeKernel?.commandKind === "throttle-steer"
    ? `
        <p>油门 / 转向</p>
        <div><kbd>W</kbd><kbd>S</kbd><span>前进 / 倒退</span></div>
        <div><kbd>A</kbd><kbd>D</kbd><span>左转 / 右转</span></div>
        <div><kbd>⇧</kbd><span>增强推进</span><kbd>空格</kbd><span>${activeKernel.resourceRef.includes("forward-steer") ? "跳跃" : "制动"}</span></div>
        <div><kbd>Ctrl</kbd><span>独立制动</span><kbd>Alt</kbd><span>手刹</span></div>
        <div><kbd>R</kbd><span>镜头回正</span><kbd>C</kbd><span>回头看</span></div>
        <div><span>鼠标拖动 / 滚轮</span><span>旋转 / 缩放镜头</span></div>
      `
    : activeKernel?.commandKind === "flight-attitude"
      ? `
          <p>飞行姿态</p>
          <div><kbd>W</kbd><kbd>S</kbd><span>俯仰</span></div>
          <div><kbd>A</kbd><kbd>D</kbd><span>偏航 / 倾斜</span></div>
          <div><kbd>⇧</kbd><kbd>空格</kbd><span>滑翔主动作</span></div>
          <div><kbd>R</kbd><span>镜头回正</span><kbd>C</kbd><span>回头看</span></div>
          <div><span>鼠标拖动 / 滚轮</span><span>旋转 / 缩放镜头</span></div>
        `
      : `
          <p>平面移动</p>
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span></div>
          <div><kbd>⇧</kbd><span>奔跑</span><kbd>空格</kbd><span>跳跃</span></div>
          <div><kbd>F</kbd><span>瞄准</span><kbd>R</kbd><span>镜头回正</span></div>
          <div><span>鼠标拖动 / 滚轮</span><span>旋转 / 缩放镜头</span></div>
        `;
  const profiles = listSubjectPresetAuthoringProfilesV1(definition.resourceRef);
  const motionProfiles = profiles.filter((row) => row.kind === "motion-profile");
  const controlFeelProfiles = profiles.filter(
    (row) => row.kind === "control-feel-profile",
  );
  const controlFeelProfile = controlFeelProfiles.find(
    (row) => row.kind === "control-feel-profile" && row.role === "default",
  );
  const controlProfile = profiles.find((row) => row.kind === "control-profile");
  const cameraProfiles = profiles.filter((row) => row.kind === "camera-rig-profile");
  const cameraConsoleProfiles = CAMERA_CONSOLE_PROFILE_REFS.flatMap((resourceRef) => {
    const profile = cameraProfiles.find((candidate) => candidate.resourceRef === resourceRef);
    return profile === undefined ? [] : [profile];
  });
  cameraSelect.replaceChildren(
    ...cameraConsoleProfiles.map((row) => {
      const option = document.createElement("option");
      option.value = row.resourceRef;
      option.textContent = FRIENDLY_CAMERA_PROFILES[row.resourceRef]?.[0] ?? row.displayName;
      return option;
    }),
  );
  const storedCameraPreference = readLocalDraft("worldkit.camera-preference");
  const defaultCameraPreference = [...cameraSelect.options].some(
    (option) => option.value === CAMERA_CONSOLE_DEFAULT_PROFILE_REF,
  )
    ? CAMERA_CONSOLE_DEFAULT_PROFILE_REF
    : cameraSelect.options[0]?.value;
  const selectedCameraPreference = !isNil(storedCameraPreference) &&
      [...cameraSelect.options].some((option) => option.value === storedCameraPreference)
    ? storedCameraPreference
    : defaultCameraPreference;
  if (!isNil(selectedCameraPreference)) {
    cameraSelect.value = selectedCameraPreference;
    try {
      await executeCameraPreference(api, {
        mode: "camera-rig-profile",
        cameraRigProfileRef: selectedCameraPreference,
      });
    } catch {
      if (
        !isNil(defaultCameraPreference) &&
        defaultCameraPreference !== selectedCameraPreference
      ) {
        cameraSelect.value = defaultCameraPreference;
        try {
          await executeCameraPreference(api, {
            mode: "camera-rig-profile",
            cameraRigProfileRef: defaultCameraPreference,
          });
        } catch {
          // The Runtime retains its current profile when both explicit requests fail.
        }
      }
    }
  }
  syncContextCameraButtons(cameraSelect.value);
  const camera = snapshot.view.camera;
  context.innerHTML = `
    <div><span>当前主体</span><code>${escapeHtml(subjectFriendlyName(definition))}</code></div>
    <div><span>移动方式</span><code>${escapeHtml(kernelFriendlyName(activeKernel))}</code></div>
    <div><span>当前镜头</span><code>${escapeHtml(camera.mode === "tracking" ? FRIENDLY_CAMERA_PROFILES[camera.activeCameraProfileRef]?.[0] ?? "自动" : "未绑定")}</code></div>
    <div><span>自动镜头效果</span><code>${escapeHtml(camera.mode === "tracking" ? camera.activeCameraModifierRefs.map((resourceRef) => FRIENDLY_CAMERA_MODIFIERS[resourceRef] ?? resourceRef).join("、") || "无" : "无")}</code></div>
    ${hostOverlay?.changes.some((change) => change.type === "relationship-capabilities-deferred") === true
      ? "<div><span>关系能力</span><code>运动预览；Seat / Tether / Mount 暂缓</code></div>"
      : ""}
    <div><span>使用提示</span><code>打开大尺寸调控台</code></div>
  `;

  const parameterDraft: Record<string, number | boolean> = {};
  const defaultMotion = motionProfiles.find((row) => row.role === "default");
  const motionDraftStorageKey = `worldkit.control-feel-draft.v1.${definition.resourceRef}.${controlFeelProfile?.resourceRef ?? "none"}.${controlFeelProfile?.contentHash ?? "unlocked"}`;
  if (controlFeelProfile?.safetyLimits !== undefined) {
    let storedDraft: Readonly<Record<string, unknown>> = {};
    try {
      const rawDraft = readLocalDraft(motionDraftStorageKey);
      const parsedDraft = rawDraft === null ? {} : JSON.parse(rawDraft);
      if (parsedDraft !== null && typeof parsedDraft === "object" && !Array.isArray(parsedDraft)) {
        storedDraft = parsedDraft as Readonly<Record<string, unknown>>;
      }
    } catch {
      storedDraft = {};
    }
    const title = document.createElement("p");
    title.textContent = "安全参数草稿（导出后重新编译生效）";
    drafts.append(title);
    for (const [name, safetyLimit] of Object.entries(controlFeelProfile.safetyLimits)) {
      const range = controlFeelProfile.authoringRanges?.[name] ?? {
        ...safetyLimit,
        step: Math.max(0.01, (safetyLimit.maximum - safetyLimit.minimum) / 100),
      };
      const value = controlFeelProfile.parameters?.[name];
      if (typeof value !== "number" || range.minimum === range.maximum) continue;
      const storedValue = storedDraft[name];
      const draftValue = typeof storedValue === "number" &&
          Number.isFinite(storedValue) &&
          storedValue >= range.minimum &&
          storedValue <= range.maximum
        ? storedValue
        : value;
      parameterDraft[name] = draftValue;
      const label = document.createElement("label");
      const valueOutput = document.createElement("output");
      valueOutput.textContent = String(draftValue);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(range.minimum);
      input.max = String(range.maximum);
      input.step = String(range.step);
      input.value = String(draftValue);
      input.addEventListener("input", () => {
        parameterDraft[name] = Number(input.value);
        valueOutput.textContent = Number(input.value).toFixed(2);
        writeLocalDraft(motionDraftStorageKey, JSON.stringify(parameterDraft));
      });
      const header = document.createElement("span");
      header.textContent = name;
      label.append(header, input, valueOutput);
      drafts.append(label);
    }
  }
  drafts.innerHTML = "<p>完整的运动手感滑杆、操作说明、两类控制台镜头类型和可叠加的自动行为修饰器都已移到大尺寸调控台。</p>";

  const tuningWorkbench = installTuningWorkbench(api, {
    definitions: authoringDefinitions,
    definition,
    activeKernel,
    motionProfiles,
    controlFeelProfiles,
    controlFeelProfile,
    controlProfile,
    cameraProfiles,
    parameterDraft,
    motionDraftStorageKey,
    controlledEntityId,
    initialSubject: activeSubject,
    initialCamera: snapshot.view.camera,
    initialCameraPreference: cameraSelect.value,
    ...(hostOverlay === undefined ? {} : { hostOverlay }),
  });
  syncContextPreviewMode("draft");

  cameraSelect.addEventListener("change", async () => {
    try {
      if (cameraSelect.value === "auto") {
        await executeCameraPreference(api);
      } else {
        await executeCameraPreference(api, {
          mode: "camera-rig-profile",
          cameraRigProfileRef: cameraSelect.value,
        });
      }
      writeLocalDraft("worldkit.camera-preference", cameraSelect.value);
      tuningWorkbench.setCameraPreferenceFromCompact(cameraSelect.value);
      syncContextCameraButtons(cameraSelect.value);
      syncContextPreviewMode("draft");
    } catch {
      harnessOutput.textContent = authoringActionFailure();
    }
  });
  const selectCameraPreference = (resourceRef: string): void => {
    if (![...cameraSelect.options].some((option) => option.value === resourceRef)) return;
    cameraSelect.value = resourceRef;
    cameraSelect.dispatchEvent(new Event("change", { bubbles: true }));
  };
  requiredElement<HTMLButtonElement>("#camera-third-person-button")
    .addEventListener("click", () => selectCameraPreference(CAMERA_CONSOLE_DEFAULT_PROFILE_REF));

  const runQuickInput = async (
    label: string,
    steps: readonly { actions: readonly SemanticInputActionV1[]; ticks: number }[],
  ): Promise<void> => {
    const buttonStatus = requiredElement<HTMLSpanElement>("#tuning-save-status");
    buttonStatus.textContent = `正在测试“${label}”…`;
    try {
      await api.runFixedInput(steps);
      buttonStatus.textContent = `“${label}”测试完成`;
    } catch {
      buttonStatus.textContent = `“${label}”未能执行，世界状态已保留`;
    }
  };
  requiredElement<HTMLButtonElement>("#quick-forward-button")
    .addEventListener("click", () => void runQuickInput("前进", [
      { actions: ["move-forward"], ticks: 24 },
    ]));
  requiredElement<HTMLButtonElement>("#quick-run-button")
    .addEventListener("click", () => void runQuickInput("奔跑", [
      { actions: ["move-forward", "run"], ticks: 30 },
    ]));
  requiredElement<HTMLButtonElement>("#quick-turn-button")
    .addEventListener("click", () => void runQuickInput("转向", [
      { actions: ["move-forward", "move-left"], ticks: 18 },
    ]));
  requiredElement<HTMLButtonElement>("#quick-jump-button")
    .addEventListener("click", () => void runQuickInput("跳跃", [
      { actions: ["jump"], ticks: 2 },
    ]));
  requiredElement<HTMLButtonElement>("#quick-recenter-button")
    .addEventListener("click", () => {
      try {
        api.resetCameraView?.();
        requiredElement<HTMLSpanElement>("#tuning-save-status").textContent = "镜头已回到主体后方";
      } catch {
        requiredElement<HTMLSpanElement>("#tuning-save-status").textContent = "镜头暂时无法回正";
      }
    });
  requiredElement<HTMLButtonElement>("#fallback-button").addEventListener("click", async () => {
    const fallback = motionProfiles.find((row) => row.role === "fallback");
    if (fallback === undefined) return;
    if (!await tuningWorkbench.setSelectedMotionProfileFromCompact(fallback.resourceRef)) {
      harnessOutput.textContent = authoringActionFailure();
      return;
    }
    harnessOutput.textContent = JSON.stringify(
      api.getSubjectSnapshot?.(controlledEntityId) ??
        api.getSnapshot().world.subjectStatesByEntityId[controlledEntityId],
      null,
      2,
    );
  });
  requiredElement<HTMLButtonElement>("#harness-button").addEventListener("click", async () => {
    if (api.runHarness === undefined) return;
    harnessOutput.textContent = "running…";
    try {
      const report = await api.runHarness(controlledEntityId);
      harnessOutput.textContent = JSON.stringify(
        withCapabilityDemoHarnessScope(report, hostOverlay),
        null,
        2,
      );
    } catch {
      harnessOutput.textContent = authoringActionFailure();
    }
  });
  requiredElement<HTMLButtonElement>("#export-package-button").addEventListener("click", () => {
    void tuningWorkbench.exportPublicationCandidate().then((exported) => {
      if (!exported) {
        harnessOutput.textContent = authoringActionFailure();
      }
    });
  });
  return tuningWorkbench;
}

function setupArtifactPlayground(
  renderer: PlaygroundArtifactRenderer,
  captureArtifactsEnabled: boolean,
): () => void {
  const abortController = new AbortController();
  let captureTimer: number | undefined;
  let featureListWindow: ReturnType<typeof installFeatureListWindow> | undefined;
  const rollback = (): void => {
    abortController.abort();
    featureListWindow?.dispose();
    if (!isNil(captureTimer)) window.clearTimeout(captureTimer);
    delete (window as { __WHITEBOX_PLAYGROUND__?: unknown }).__WHITEBOX_PLAYGROUND__;
    delete document.documentElement.dataset.artifactCapture;
  };

  try {
    requiredElement("#adapter-name").textContent = renderer.name;
    requiredElement<HTMLButtonElement>("#pause-button").hidden = true;
    requiredElement<HTMLButtonElement>("#record-button").hidden = true;
    requiredElement<HTMLButtonElement>("#smoke-button").hidden = true;
    const resetButton = requiredElement<HTMLButtonElement>("#reset-button");
    resetButton.textContent = "恢复开场视图";

    let selectedFeatureId: string | null = null;
    const resourceTotal = (feature: FeatureInspection): number =>
      feature.resources.reduce(
        (sum, resource) => sum + (resource.vertices ?? 0),
        0,
      );
    const renderFeatureList = (features: readonly FeatureInspection[]): void => {
      requiredElement("#feature-count").textContent = `${features.length} FEATURES`;
      featureListWindow!.update(features, selectedFeatureId);
    };
    const selectFeature = (featureId: string): void => {
      selectedFeatureId = featureId;
      const features = renderer.inspectFeatures();
      const feature = features.find((item) => item.id === featureId);
      renderFeatureList(features);
      if (isNil(feature)) return;
      const parameterRows = Object.entries(feature.parameters)
        .map(([key, value]) =>
          `<div><dt>${key}</dt><dd>${escapeHtml(JSON.stringify(value))}</dd></div>`)
        .join("");
      const resourceRows = feature.resources
        .map((resource) => `
          <li><span><i class="dot ${resource.kind}"></i>${resource.id}</span>
          <em>${isNil(resource.vertices) ? resource.kind : `${resource.vertices.toLocaleString()} vertices`}</em></li>
        `)
        .join("");
      const diagnostics = feature.diagnostics.length === 0
        ? `<p class="diagnostic-ok">✓ No diagnostics</p>`
        : feature.diagnostics
            .map((item) =>
              `<p class="diagnostic-${item.severity}">${item.code}: ${item.message}</p>`)
            .join("");
      inspection.innerHTML = `
        <div class="inspection-title">
          <div><p class="eyebrow">SELECTED FEATURE</p><h3>${feature.id}</h3></div>
          <span>${resourceTotal(feature).toLocaleString()} VTX</span>
        </div>
        <dl class="parameter-grid">${parameterRows}</dl>
        <div class="resource-section"><h4>Owned resources</h4><ul>${resourceRows}</ul></div>
        <div class="diagnostic-section"><h4>Diagnostics</h4>${diagnostics}</div>
      `;
    };

    featureListWindow = installFeatureListWindow({ root: featureList, onSelect: selectFeature });

    const automationApi: PlaygroundArtifactAutomationApiV1 = Object.freeze({
      version: 1,
      inspectFeatures: () => renderer.inspectFeatures(),
      captureScreenshot: () => renderer.captureScreenshot(),
      captureCompositionMask: () => renderer.captureCompositionMask(),
      analyzeOpeningComposition: () => renderer.analyzeOpeningComposition(),
      exportOpeningFrame: (report?: OpeningCompositionReport) =>
        renderer.exportOpeningFrame(report),
      getWorldSpec: () => renderer.getWorldSpec(),
      getPlanArtifacts: () => renderer.getPlanArtifacts(),
      capturePlanningView: (kind: PlanningViewKind) =>
        renderer.capturePlanningView(kind),
      getVisualPrototypes: () => renderer.getVisualPrototypes(),
      captureWhiteboxTriview: (prototypeId: string) =>
        renderer.captureWhiteboxTriview(prototypeId),
      exportWhiteboxTriviews: () => renderer.exportWhiteboxTriviews(),
    });
    window.__WHITEBOX_PLAYGROUND__ = automationApi;

    const features = renderer.inspectFeatures();
    renderFeatureList(features);
    selectFeature(features[0]?.id ?? "");
    resetButton.addEventListener("click", () => renderer.restoreOpeningView(), {
      signal: abortController.signal,
    });
    requiredElement<HTMLButtonElement>("#capture-button").addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `whitebox-world-${Date.now()}.png`;
      link.href = renderer.captureScreenshot();
      link.click();
    }, { signal: abortController.signal });
    requiredElement<HTMLButtonElement>("#triview-button").addEventListener("click", () => {
      const output = requiredElement<HTMLPreElement>("#smoke-output");
      output.textContent = "exporting whitebox tri-views…";
      void renderer.exportWhiteboxTriviews().then(
        (paths) => {
          output.textContent = `exported ${paths.length} tri-views\n${paths.join("\n")}`;
        },
        (error: unknown) => {
          output.textContent = error instanceof Error ? error.message : String(error);
        },
      );
    }, { signal: abortController.signal });
    requiredElement<HTMLButtonElement>("#composition-button").addEventListener("click", () => {
      renderer.restoreOpeningView();
      const report = renderer.analyzeOpeningComposition();
      const mask = requiredElement<HTMLImageElement>("#composition-mask");
      mask.src = renderer.captureCompositionMask();
      mask.hidden = isNil(report);
      requiredElement<HTMLPreElement>("#smoke-output").textContent = isNil(report)
        ? "This scene has no opening composition guide."
        : JSON.stringify(report, null, 2);
    }, { signal: abortController.signal });

    if (captureArtifactsEnabled) {
      captureTimer = window.setTimeout(() => {
        void (async () => {
          const sceneId = renderer.getWorldSpec()?.id ?? "unknown-scene";
          try {
            renderer.restoreOpeningView();
            const triViewPaths = await renderer.exportWhiteboxTriviews();
            renderer.restoreOpeningView();
            const report = renderer.analyzeOpeningComposition();
            const openingFramePath = isNil(report)
              ? null
              : await renderer.exportOpeningFrame(report);
            document.documentElement.dataset.artifactCapture = "complete";
            window.parent.postMessage({
              type: "whitebox-artifact-capture",
              sceneId,
              status: "complete",
              triViewCount: triViewPaths.length,
              openingFramePath,
              compositionPass: report?.pass ?? null,
              compositionScore: report?.score ?? null,
            }, "*");
          } catch (error) {
            document.documentElement.dataset.artifactCapture = "failed";
            window.parent.postMessage({
              type: "whitebox-artifact-capture",
              sceneId,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            }, "*");
          }
        })();
      }, 900);
    }
    return rollback;
  } catch (error) {
    rollback();
    throw error;
  }
}

if (runtimeRoute.mode === "unknown") {
  delete window.__WORLDKIT__;
  delete window.__WORLDKIT_FORMAL_CAPTURE_STARTUP__;
  delete (window as { __WHITEBOX_PLAYGROUND__?: unknown }).__WHITEBOX_PLAYGROUND__;
  document.documentElement.dataset.worldkitStatus = "error";
  requiredElement("#adapter-name").textContent = "route-error";
  inspection.innerHTML = `<pre>${escapeHtml(JSON.stringify({
    diagnostics: [runtimeRoute.diagnostic],
  }, null, 2))}</pre>`;
} else if (runtimeRoute.mode !== "artifact-only") {
  const worldPackageStore = createIndexedDbWorldPackageStoreV1();
  let createdAdapter: BabylonWorldAdapter | null = null;
  let createdHostOverlay: CapabilityDemoHostOverlayV1 | undefined;
  let startupStage = "host-resolver";
  const startupReporter = createFormalCaptureStartupReporterV1(
    (value) => { window.__WORLDKIT_FORMAL_CAPTURE_STARTUP__ = value; },
    "host-resolver",
  );
  const advanceStartupStage = (stage: FormalCaptureStartupStageV1) => {
    startupStage = stage;
    startupReporter.progress(stage);
  };
  let preparationError: unknown;
  let prepared: Readonly<{
    loaded: Awaited<ReturnType<typeof import("./authoring-loader.js")["loadAuthoringScene"]>>;
    visualCaptureGroups: readonly VisualCaptureGroupV1[];
    BabylonWorldAdapter: typeof import("./babylon-world-adapter.js")["BabylonWorldAdapter"];
  }> | undefined;
  try {
    advanceStartupStage("module-import");
    const { BabylonWorldAdapter } = await import("./babylon-world-adapter.js");
    const { loadAuthoringScene, loadStudioAuthoringPreviewV1 } = await import(
      "./authoring-loader.js"
    );
    let loaded: Awaited<ReturnType<typeof import("./authoring-loader.js")["loadAuthoringScene"]>>;
    let visualCaptureGroups: readonly VisualCaptureGroupV1[] = [];
    advanceStartupStage("viewer-source-load");
    if (runtimeRoute.studioWorldId === undefined) {
      const bootstrapUrl = new URL(
        "/__worldkit/viewer-bootstrap",
        window.location.origin,
      );
      const selectedSceneId = urlParameters.get("scene");
      if (!isNil(selectedSceneId)) {
        bootstrapUrl.searchParams.set("scene", selectedSceneId);
      }
      const bootstrap = await loadViewerBootstrapV1(() => fetch(
        bootstrapUrl,
        { cache: "no-store" },
      ));
      installViewerSceneSelector(bootstrap);
      loaded = await loadAuthoringScene(
        async () => new Response(JSON.stringify(bootstrap.authoringSpec), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        {
          worldPackageStore,
          ...(bootstrap.selection.kind === "fixed-host"
            ? {
                fetchRouteEvidence: () => fetch(
                  "/__worldkit/route-evidence",
                  { cache: "no-store" },
                ),
              }
            : {}),
        },
      );
    } else {
      const preview = await loadStudioAuthoringPreviewV1(
        runtimeRoute.studioWorldId,
        () => fetch(
          `/api/worlds/${encodeURIComponent(runtimeRoute.studioWorldId!)}/preview-bootstrap`,
          { cache: "no-store" },
        ),
        { worldPackageStore },
      );
      installViewerSceneSelector(preview.viewerBootstrap);
      loaded = preview.loaded;
      visualCaptureGroups = preview.visualCaptureGroups;
    }
    prepared = { loaded, visualCaptureGroups, BabylonWorldAdapter };
  } catch (error) {
    preparationError = error;
  }
  let resolvePageSetupReady!: () => void;
  let rejectPageSetupReady!: (error: Error) => void;
  const pageSetupReady = new Promise<void>((resolve, reject) => {
    resolvePageSetupReady = resolve;
    rejectPageSetupReady = reject;
  });
  void pageSetupReady.catch(() => undefined);
  const browserInstallation = installDeferredWorldkitBrowserApi({
    target: window,
    statusElement: document.documentElement,
    readyBarrier: pageSetupReady,
    ...(prepared?.loaded.ok === true &&
        prepared.loaded.routeEvidencePublication !== undefined
      ? { routeEvidencePublication: prepared.loaded.routeEvidencePublication }
      : {}),
    ...(prepared?.loaded.ok === false &&
        prepared.loaded.diagnostics.length > 0
      ? { startupFailureDiagnostics: prepared.loaded.diagnostics }
      : {}),
    initialize: async ({ trackAdapter }) => {
      try {
        if (preparationError !== undefined) throw preparationError;
        if (prepared === undefined) {
          throw new Error("WORLDKIT_AUTHORING_PREPARATION_MISSING");
        }
        const { loaded, visualCaptureGroups, BabylonWorldAdapter } = prepared;
        if (
          !loaded.ok ||
          loaded.executionPlan === undefined ||
          loaded.runtimeWorldConfiguration === undefined
        ) {
          inspection.innerHTML = `<pre>${escapeHtml(JSON.stringify(loaded.diagnostics, null, 2))}</pre>`;
          throw new Error("WORLDKIT_AUTHORING_LOAD_FAILED");
        }
        const subjectAssetResolver = createFetchSubjectAssetResolver(
          PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1,
        );
        advanceStartupStage("runtime-create");
        const adapter = await BabylonWorldAdapter.create(
          loaded.runtimeWorldConfiguration,
          {
            subjectAssetResolver,
            ...(isNil(loaded.gameplayActionRequestResolver)
              ? {}
              : {
                  gameplayActionRequestResolver:
                    loaded.gameplayActionRequestResolver,
                }),
            onInitializationStage(stage) {
              advanceStartupStage(`runtime-${stage}`);
            },
          },
        );
        createdHostOverlay = loaded.hostOverlay;
        createdAdapter = initializePlaygroundAdapterV1<BabylonWorldAdapter>({
          adapter,
          visualCaptureGroups,
          viewport,
          trackAdapter,
          setStartupStage(stage) {
            advanceStartupStage(stage);
          },
        });
        return createdAdapter;
      } catch (error) {
        startupReporter.finish("error");
        captureAuthoringStartupFailure(startupStage, error);
        throw error;
      }
    },
  });
  let authoringCaptureInstallation:
    | ReturnType<typeof installWorldkitAuthoringCaptureApi>
    | undefined;
  let authoringEditInstallation:
    | { dispose(): void }
    | undefined;
  let disposeAuthoringWorkbenchAdapterBinding: (() => void) | undefined;
  const pageLifecycle = createGameplayPageLifecycle({
    initialization: browserInstallation.initialization,
    getAdapter: () => createdAdapter,
    async setup(adapter) {
      authoringCaptureInstallation = installWorldkitAuthoringCaptureApi(
        window,
        adapter,
      );
      if (
        prepared?.loaded.ok === true &&
        !isNil(prepared.loaded.authoringSpec) &&
        !isNil(prepared.loaded.worldPackageBuildContext) &&
        !isNil(prepared.loaded.worldPackageResourceArtifacts) &&
        "publishWorldReplacementV1" in adapter
      ) {
        const [{ installWorldkitAuthoringEditApi }, { createPlaygroundAuthoringEditHostV1 }] =
          await Promise.all([
            import("./worldkit-authoring-edit-api.js"),
            import("./worldkit-authoring-edit-host.js"),
          ]);
        authoringEditInstallation = installWorldkitAuthoringEditApi(
          window,
          createPlaygroundAuthoringEditHostV1({
            authoringSpec: prepared.loaded.authoringSpec,
            worldPackageStore,
            worldPackageBuildContext:
              prepared.loaded.worldPackageBuildContext,
            resourceArtifacts:
              prepared.loaded.worldPackageResourceArtifacts,
            publishWorldReplacement: (input) => adapter.publishWorldReplacementV1(input),
          }),
        );
      }
      const workbench = await installCapabilityAuthoringPanel(
        createAuthoringPanelRuntimeApi(browserInstallation.api, adapter),
        adapter.runtimeSnapshot(),
        createdHostOverlay,
      );
      if (workbench !== undefined && createdAdapter !== null) {
        disposeAuthoringWorkbenchAdapterBinding?.();
        disposeAuthoringWorkbenchAdapterBinding = workbench.bindAdapterDiagnostics(createdAdapter);
      }
      startPlayground(adapter, () => pageLifecycle.dispose(), {
        resetSimulation: async () => {
          await browserInstallation.api.reset();
        },
        afterSimulationReset: async () => {
          await workbench?.reapplyWorkingDraftAfterSimulationReset();
        },
      });
    },
    rollbackPageState() {
      delete (window as { __WHITEBOX_PLAYGROUND__?: unknown }).__WHITEBOX_PLAYGROUND__;
    },
    disposeRuntimeHost: async () => {
      disposeAuthoringWorkbenchAdapterBinding?.();
      disposeAuthoringWorkbenchAdapterBinding = undefined;
      authoringCaptureInstallation?.dispose();
      authoringEditInstallation?.dispose();
      await browserInstallation.dispose();
    },
  });
  let pageSetupSucceeded = false;
  try {
    pageSetupSucceeded = await pageLifecycle.completeSetup();
    if (pageSetupSucceeded) {
      startupReporter.finish("ready", "page-setup");
      resolvePageSetupReady();
    } else {
      startupReporter.finish("error", "page-setup");
      rejectPageSetupReady(new Error("WORLDKIT_PAGE_SETUP_FAILED"));
    }
  } catch (error) {
    startupReporter.finish("error", "page-setup");
    rejectPageSetupReady(new Error("WORLDKIT_PAGE_SETUP_FAILED"));
    captureAuthoringStartupFailure("page-setup", error);
    document.documentElement.dataset.worldkitStatus = "error";
  }
  if (!pageSetupSucceeded) {
    inspection.innerHTML = `<pre>${escapeHtml(JSON.stringify(authoringStartupEvidence(browserInstallation.api), null, 2))}</pre>`;
    installAuthoringRecoveryPanel(browserInstallation.api);
  }
} else {
  delete window.__WORLDKIT__;
  delete window.__WORLDKIT_FORMAL_CAPTURE_STARTUP__;
  delete (window as { __WHITEBOX_PLAYGROUND__?: unknown }).__WHITEBOX_PLAYGROUND__;
  delete document.documentElement.dataset.worldkitStatus;
  const { BabylonArtifactRenderer } = await import("./babylon-artifact-renderer.js");
  let rollbackArtifactPageState = (): void => {};
  const artifactLifecycle = await createAndStartArtifactRenderer({
    create: () => BabylonArtifactRenderer.createArtifactRenderer(
      sceneCatalog[runtimeRoute.sceneCatalogId]!,
      runtimeRoute.sceneCatalogId,
    ),
    container: viewport,
    setupPageState: (renderer) => {
      rollbackArtifactPageState = setupArtifactPlayground(
        renderer,
        runtimeRoute.captureArtifactsEnabled,
      );
    },
    rollbackPageState: () => rollbackArtifactPageState(),
  });
  installPageExitDisposal({
    target: window,
    dispose: () => artifactLifecycle.dispose(),
  });
}

function startPlayground(
  adapter: PlaygroundWorldAdapter,
  disposeBrowserRuntime?: () => Promise<void>,
  options: {
    resetSimulation?: () => Promise<void>;
    afterSimulationReset?: () => void | Promise<void>;
  } = {},
): void {
requiredElement("#adapter-name").textContent = adapter.name;
let recorderCanvas = adapter.canvas;
let canvasRecorder = new CanvasRecorder(recorderCanvas);
const recordingWorldId = recordingWorkbenchSceneId(runtimeRoute);
const recordingWorkbench = runtimeRoute.mode === "viewer" && !isNil(recordingWorldId)
  ? installRecordingWorkbench({
      root: requiredElement<HTMLDivElement>("#recording-workbench-root"),
      sceneId: recordingWorldId,
    })
  : undefined;
let recordingTimer: number | null = null;
let viewportFeedbackTimer: number | undefined;

async function resetPlaygroundWorld(): Promise<void> {
  if (canvasRecorder.state !== "idle") {
    throw new Error("WORLDKIT_RECORDING_RESET_CONFLICT");
  }
  if (options.resetSimulation === undefined) adapter.reset();
  else await options.resetSimulation();
  await options.afterSimulationReset?.();
  if (recorderCanvas === adapter.canvas) return;
  canvasRecorder.dispose();
  recorderCanvas = adapter.canvas;
  canvasRecorder = new CanvasRecorder(recorderCanvas);
}

let selectedFeatureId: string | null = null;
const featureListWindow = installFeatureListWindow({ root: featureList, onSelect: selectFeature });

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function resourceTotal(feature: FeatureInspection): number {
  return feature.resources.reduce((sum, resource) => sum + (resource.vertices ?? 0), 0);
}

function renderFeatureList(features: readonly FeatureInspection[]): void {
  requiredElement("#feature-count").textContent = `${features.length} FEATURES`;
  featureListWindow.update(features, selectedFeatureId);
}

function selectFeature(featureId: string): void {
  selectedFeatureId = featureId;
  const features = adapter.inspectFeatures();
  const feature = features.find((item) => item.id === featureId);
  renderFeatureList(features);
  if (feature === undefined) return;

  const parameterRows = Object.entries(feature.parameters)
    .map(
      ([key, value]) =>
        `<div><dt>${key}</dt><dd>${escapeHtml(JSON.stringify(value))}</dd></div>`,
    )
    .join("");
  const resourceRows = feature.resources
    .map(
      (resource) => `
        <li><span><i class="dot ${resource.kind}"></i>${resource.id}</span>
        <em>${resource.vertices === undefined ? resource.kind : `${resource.vertices.toLocaleString()} vertices`}</em></li>
      `,
    )
    .join("");
  const diagnostics =
    feature.diagnostics.length === 0
      ? `<p class="diagnostic-ok">✓ No diagnostics</p>`
      : feature.diagnostics
          .map((item) => `<p class="diagnostic-${item.severity}">${item.code}: ${item.message}</p>`)
          .join("");

  inspection.innerHTML = `
    <div class="inspection-title">
      <div><p class="eyebrow">SELECTED FEATURE</p><h3>${feature.id}</h3></div>
      <span>${resourceTotal(feature).toLocaleString()} VTX</span>
    </div>
    <dl class="parameter-grid">${parameterRows}</dl>
    <div class="resource-section"><h4>Owned resources</h4><ul>${resourceRows}</ul></div>
    <div class="diagnostic-section"><h4>Diagnostics</h4>${diagnostics}</div>
  `;
}

function updateHud(snapshot: WorldSnapshot): void {
  const fpsText = String(snapshot.performance.fps || "—");
  requiredElement("#fps").textContent = fpsText;
  requiredElement("#tick").textContent = String(snapshot.tick);
  requiredElement("#controlled-entity-label").textContent = snapshot.player.entityId;
  requiredElement("#player-action").textContent = snapshot.player.action.toUpperCase();
  requiredElement("#player-position").textContent = snapshot.player.position
    .map(formatNumber)
    .join(" / ");
  const pause = requiredElement<HTMLButtonElement>("#pause-button");
  pause.textContent = snapshot.paused ? "▶" : "Ⅱ";
  pause.setAttribute("aria-label", snapshot.paused ? "继续模拟" : "暂停模拟");
  if (viewerMode) {
    requiredElement("#runtime-fps").textContent = fpsText;
    try {
      const runtimeSnapshot = (adapter as BabylonWorldAdapter).runtimeSnapshot();
      const controlledEntityId = controlledEntityIdFromSnapshotV4(runtimeSnapshot);
      const capabilityStates = Object.values(
        runtimeSnapshot.world.subjectStatesByEntityId[controlledEntityId]?.capabilityStatesById ?? {},
      );
      const locomotionV2 = capabilityStates.find(
        (state) => state.kind === "locomotion-capability-state-v2",
      );
      const activeLocomotionV2 = locomotionV2?.kind === "locomotion-capability-state-v2" &&
          locomotionV2.locomotion.status === "active"
        ? locomotionV2.locomotion
        : undefined;
      const camera = runtimeSnapshot.view.camera.mode === "tracking"
        ? runtimeSnapshot.view.camera
        : undefined;
      const speedMetersPerSecond = activeLocomotionV2?.horizontalSpeedMetersPerSecond;
      const gait = activeLocomotionV2?.gait;
      const movementMedium = activeLocomotionV2?.movementMedium;
      const supportMode = activeLocomotionV2?.supportMode ??
        (snapshot.player.grounded ? "supported" : "unsupported");
      requiredElement("#runtime-speed").textContent = speedMetersPerSecond === undefined
        ? "—"
        : `${speedMetersPerSecond.toFixed(1)} m/s`;
      requiredElement("#runtime-gait").textContent = gait?.toUpperCase() ?? "IDLE";
      requiredElement("#runtime-medium").textContent = movementMedium?.toUpperCase() ?? "GROUND";
      requiredElement("#runtime-support").textContent = supportMode.toUpperCase();
      requiredElement("#runtime-fov").textContent = camera?.finalFovDegrees === undefined
        ? "—"
        : `${camera.finalFovDegrees.toFixed(0)}°`;
      requiredElement("#runtime-distance").textContent = camera?.effectiveArmLengthMeters === undefined
        ? "—"
        : `${camera.effectiveArmLengthMeters.toFixed(1)} m`;
    } catch {
      // The ordinary HUD remains authoritative if Runtime telemetry is unavailable.
    }
  }
}

const automationApi: PlaygroundAutomationApi = {
  version: 3,
  getSnapshot: () => adapter.snapshot(),
  inspectFeatures: () => adapter.inspectFeatures(),
  runFixedInput: (steps) => adapter.runFixedInput(steps),
  captureScreenshot: () => adapter.captureScreenshot(),
  captureCompositionMask: () => adapter.captureCompositionMask(),
  analyzeOpeningComposition: () => adapter.analyzeOpeningComposition(),
  exportOpeningFrame: () => adapter.exportOpeningFrame(),
  getWorldSpec: () => adapter.getWorldSpec(),
  getPlanArtifacts: () => adapter.getPlanArtifacts(),
  capturePlanningView: (kind) => adapter.capturePlanningView(kind),
  getVisualPrototypes: () => adapter.getVisualPrototypes(),
  captureWhiteboxTriview: (prototypeId) => adapter.captureWhiteboxTriview(prototypeId),
  exportWhiteboxTriviews: () => adapter.exportWhiteboxTriviews(),
  reset: () => {
    adapter.reset();
    options.afterSimulationReset?.();
    return adapter.snapshot();
  },
  setPaused: (paused) => {
    adapter.setPaused(paused);
    return adapter.snapshot();
  },
};
window.__WHITEBOX_PLAYGROUND__ = automationApi;

adapter.subscribe(updateHud);
renderFeatureList(adapter.inspectFeatures());
selectFeature(adapter.inspectFeatures()[0]?.id ?? "");

requiredElement<HTMLButtonElement>("#pause-button").addEventListener("click", () => {
  adapter.setPaused(!adapter.isPaused());
});

const resetButton = requiredElement<HTMLButtonElement>("#reset-button");
resetButton.addEventListener("click", async () => {
  resetButton.disabled = true;
  resetButton.setAttribute("aria-busy", "true");
  try {
    await resetPlaygroundWorld();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    resetButton.disabled = false;
    resetButton.removeAttribute("aria-busy");
  }
});

requiredElement<HTMLButtonElement>("#capture-button").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `whitebox-world-${Date.now()}.png`;
  link.href = adapter.captureScreenshot();
  link.click();
});

function formatRecordingTime(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateRecordingUi(recording: boolean): void {
  const button = requiredElement<HTMLButtonElement>("#record-button");
  const indicator = requiredElement<HTMLDivElement>("#recording-indicator");
  button.classList.toggle("is-recording", recording);
  button.setAttribute("aria-pressed", String(recording));
  requiredElement("#record-label").textContent = recording ? "停止录制" : "录制画面";
  indicator.hidden = !recording;
  if (!recording) requiredElement("#recording-time").textContent = "00:00";
}

function downloadRecording(blob: Blob, extension: "mp4" | "webm"): string {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const sceneId = adapter.getWorldSpec()?.id ?? "whitebox-world";
  const filename = `${sceneId}-gameplay-${new Date().toISOString().replaceAll(":", "-")}.${extension}`;
  link.download = filename;
  link.href = url;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}

function showViewportFeedback(message: string, persist = false): void {
  const toast = requiredElement<HTMLDivElement>("#recording-toast");
  if (viewportFeedbackTimer !== undefined) {
    window.clearTimeout(viewportFeedbackTimer);
    viewportFeedbackTimer = undefined;
  }
  toast.textContent = message;
  toast.title = message;
  toast.hidden = false;
  if (!persist) {
    viewportFeedbackTimer = window.setTimeout(() => {
      toast.hidden = true;
      viewportFeedbackTimer = undefined;
    }, 5_000);
  }
}

function showRecordingSaved(label: string, blob: Blob, durationMs: number, persisted = true): void {
  const megabytes = blob.size / 1_000_000;
  showViewportFeedback(persisted
    ? `已加入页面录制清单 · ${formatRecordingTime(durationMs)} · ${megabytes.toFixed(1)} MB · ${label}`
    : `未保存到页面，已下载本地备份 · ${formatRecordingTime(durationMs)} · ${megabytes.toFixed(1)} MB · ${label}`);
}

requiredElement<HTMLButtonElement>("#record-button").addEventListener("click", async () => {
  const button = requiredElement<HTMLButtonElement>("#record-button");
  if (canvasRecorder.state === "idle") {
    try {
      canvasRecorder.start();
      updateRecordingUi(true);
      recordingTimer = window.setInterval(() => {
        requiredElement("#recording-time").textContent = formatRecordingTime(canvasRecorder.elapsedMs);
      }, 250);
      adapter.canvas.focus();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (canvasRecorder.state !== "recording") return;
  button.disabled = true;
  requiredElement("#record-label").textContent = "正在保存…";
  try {
    const result = await canvasRecorder.stop();
    if (recordingWorkbench === undefined) {
      const filename = downloadRecording(result.blob, result.extension);
      showRecordingSaved(filename, result.blob, result.durationMs);
    } else {
      try {
        const recording = await recordingWorkbench.uploadRecording(result);
        showRecordingSaved(recording.title, result.blob, result.durationMs);
      } catch (error) {
        const filename = downloadRecording(result.blob, result.extension);
        showRecordingSaved(filename, result.blob, result.durationMs, false);
        window.alert(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    if (recordingTimer !== null) window.clearInterval(recordingTimer);
    recordingTimer = null;
    button.disabled = false;
    updateRecordingUi(false);
    adapter.canvas.focus();
  }
});

requiredElement<HTMLButtonElement>("#triview-button").addEventListener("click", async () => {
  const output = requiredElement<HTMLPreElement>("#smoke-output");
  output.textContent = "exporting whitebox tri-views…";
  showViewportFeedback("正在导出白膜三视图…", true);
  try {
    const paths = await adapter.exportWhiteboxTriviews();
    output.textContent = `exported ${paths.length} tri-views\n${paths.join("\n")}`;
    showViewportFeedback(`已导出 ${paths.length} 个白膜三视图 · ${paths.join(" · ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.textContent = message;
    showViewportFeedback(`白膜三视图导出失败 · ${message}`);
  }
});

requiredElement<HTMLButtonElement>("#smoke-button").addEventListener("click", async () => {
  const output = requiredElement<HTMLPreElement>("#smoke-output");
  output.textContent = "running…";
  showViewportFeedback("正在运行固定输入 Smoke…", true);
  try {
    await resetPlaygroundWorld();
    // Match the real user path: establish the committed Camera profile on the
    // first rendered frame before deterministic input starts.
    adapter.render();
    await adapter.runFixedInput([{ actions: [], ticks: 1 }]);
    const before = adapter.snapshot();
    const cameraUp = await adapter.runFixedInput([
      { actions: ["cameraUp"], ticks: 30 },
    ]);
    const cameraDown = await adapter.runFixedInput([
      { actions: ["cameraDown"], ticks: 60 },
    ]);
    const after = await adapter.runFixedInput([
      { actions: ["cameraUp"], ticks: 30 },
      { actions: ["forward", "run"], ticks: 210 },
      { actions: ["cameraRight", "forward"], ticks: 45 },
    ]);
    const distance = Math.hypot(
      after.player.position[0] - before.player.position[0],
      after.player.position[2] - before.player.position[2],
    );
    const finite = after.player.position.every(Number.isFinite);
    const cameraUpWorks = cameraUp.camera.pitch < before.camera.pitch;
    const cameraDownWorks = cameraDown.camera.pitch > cameraUp.camera.pitch;
    const pass = finite && distance > 1 && cameraUpWorks && cameraDownWorks;
    output.textContent = JSON.stringify(
      {
        pass,
        ticks: after.tick - before.tick,
        movedMeters: Number(distance.toFixed(2)),
        finiteTransform: finite,
        cameraPitchSamples: {
          before: before.camera.pitch,
          up: cameraUp.camera.pitch,
          down: cameraDown.camera.pitch,
          restored: after.camera.pitch,
        },
        cameraUp: cameraUpWorks,
        cameraDown: cameraDownWorks,
      },
      null,
      2,
    );
    showViewportFeedback(
      `固定输入 Smoke ${pass ? "通过" : "未通过"} · 移动 ${distance.toFixed(2)} m`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.textContent = message;
    showViewportFeedback(`固定输入 Smoke 失败 · ${message}`);
  }
});

requiredElement<HTMLButtonElement>("#composition-button").addEventListener("click", async () => {
  const output = requiredElement<HTMLPreElement>("#smoke-output");
  showViewportFeedback("正在运行首帧构图验收…", true);
  try {
    await resetPlaygroundWorld();
    const report = adapter.analyzeOpeningComposition();
    const mask = requiredElement<HTMLImageElement>("#composition-mask");
    mask.src = adapter.captureCompositionMask();
    mask.hidden = report === null;
    output.textContent = report === null
      ? "This scene has no opening composition guide."
      : JSON.stringify(report, null, 2);
    if (report?.pass) {
      const path = await adapter.exportOpeningFrame(report);
      output.textContent += `\nexported: ${path}`;
      showViewportFeedback(`首帧构图验收通过 · 已导出 ${path}`);
    } else {
      showViewportFeedback(
        report === null ? "当前场景没有首帧构图指引" : "首帧构图验收未通过",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.textContent += `\nfailed: ${message}`;
    showViewportFeedback(`首帧构图验收失败 · ${message}`);
  }
});

async function captureRequestedArtifacts(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.get("captureArtifacts") !== "1") return;
  const sceneId = adapter.getWorldSpec()?.id ?? params.get("scene") ?? "unknown-scene";
  try {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    const triViewPaths = await adapter.exportWhiteboxTriviews();
    await resetPlaygroundWorld();
    const report = adapter.analyzeOpeningComposition();
    const openingFramePath = report === null ? null : await adapter.exportOpeningFrame(report);
    document.documentElement.dataset.artifactCapture = "complete";
    window.parent.postMessage({
      type: "whitebox-artifact-capture",
      sceneId,
      status: "complete",
      triViewCount: triViewPaths.length,
      openingFramePath,
      compositionPass: report?.pass ?? null,
      compositionScore: report?.score ?? null,
    }, "*");
  } catch (error) {
    document.documentElement.dataset.artifactCapture = "failed";
    window.parent.postMessage({
      type: "whitebox-artifact-capture",
      sceneId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }, "*");
  }
}

void captureRequestedArtifacts();

installPageExitDisposal({
  target: window,
  dispose: async () => {
    if (recordingTimer !== null) window.clearInterval(recordingTimer);
    if (viewportFeedbackTimer !== undefined) window.clearTimeout(viewportFeedbackTimer);
    featureListWindow.dispose();
    canvasRecorder.dispose();
    recordingWorkbench?.dispose();
    if (disposeBrowserRuntime === undefined) adapter.dispose();
    else await disposeBrowserRuntime();
  },
});
}
