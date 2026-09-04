import "./style.css";

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
import { installRecordingWorkbench } from "./recording-workbench.js";
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
import { resolvePlaygroundRuntimeRoute } from "./playground-runtime-route.js";
import { sceneCatalog } from "./scenes/index.js";
import { createGameplayPageLifecycle } from "./gameplay-page-lifecycle.js";
import { createAndStartArtifactRenderer } from "./artifact-renderer-lifecycle.js";
import { installPageExitDisposal } from "./page-exit-lifecycle.js";
import { installWorldkitAuthoringCaptureApi } from "./worldkit-authoring-capture-api.js";
import { initializePlaygroundAdapterV1 } from "./playground-adapter-startup.js";
import { installMountedSkateboardControlsV1 } from "./mounted-skateboard-controls.js";
import { MOUNTED_SKATEBOARD_S1_SCENE_ID } from "./scenes/mounted-skateboard-s1.js";
import { createIndexedDbWorldPackageStoreV1 } from "./indexeddb-world-package-store.js";
import { createVirtualFeatureListV1 } from "./feature-list-window.js";
import { subjectFriendlyNameV1 as subjectFriendlyName } from "./subject-friendly-name.js";
import {
  installRuntimeFlightRecorderV1,
  type RuntimeFlightRecorderControllerV1,
  type RuntimeFlightRecorderStatusV1,
} from "./runtime-flight-recorder.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("Missing #app container");
const urlParameters = new URLSearchParams(window.location.search);
const runtimeRoute = resolvePlaygroundRuntimeRoute(
  window.location.search,
  sceneCatalog,
);
const authoringMode = runtimeRoute.mode === "authoring";
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
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <p class="eyebrow">AGENT WHITEBOX WORLD</p>
          <h1>Runtime Playground <span>α</span></h1>
        </div>
      </div>
      <div class="topbar-actions">
        <span class="status"><i></i><span id="adapter-name">adapter</span></span>
        ${authoringMode ? '<button class="button button-tuning" id="open-tuning-button" type="button" hidden>打开调控台</button>' : ''}
        <button class="button button-subtle" id="reset-button" type="button">重置世界</button>
        <button class="button button-record" id="record-button" type="button" aria-pressed="false" title="仅录制 3D 渲染画面，不包含界面">
          <i class="record-dot" aria-hidden="true"></i><span id="record-label">录制画面</span>
        </button>
        <button class="button button-primary" id="capture-button" type="button">保存截图</button>
      </div>
    </header>

    <section class="workspace">
      <div class="viewport-panel">
        <div class="viewport" id="viewport">
          <div class="scene-badge">WHITEBOX / LOCAL PREVIEW</div>
          <div class="reticle" aria-hidden="true"></div>
          <div class="hud" aria-live="polite">
            <div class="hud-card"><span>FPS</span><strong id="fps">—</strong></div>
            <div class="hud-card"><span>TICK</span><strong id="tick">0</strong></div>
            <div class="hud-card hud-wide"><span id="controlled-entity-label">PLAYER</span><strong id="player-position">0.0 / 0.0 / 0.0</strong></div>
            <div class="hud-card"><span>ACTION</span><strong id="player-action">IDLE</strong></div>
            <div class="hud-card hud-health" id="runtime-health-hud" data-severity="info"><span>HEALTH</span><strong id="runtime-health-hud-value">INIT</strong></div>
          </div>
          <div class="controls-card" id="controls-card">
            <p>移动控制</p>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span></div>
            <div><kbd>⇧</kbd><span>奔跑</span><kbd>空格</kbd><span>跳跃</span></div>
            ${authoringMode
              ? '<div><kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><span>观察视角</span></div><div><span>右侧 Camera Preference</span><span>切换镜头</span></div>'
              : '<div><kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><span>上下左右观察</span></div><div><span class="mouse-icon">↖</span><span>拖拽镜头</span></div><div><span class="wheel-icon">↕</span><span>滚轮缩放</span></div>'}
          </div>
          <div class="mounted-controls" id="mounted-controls" hidden></div>
          <button class="pause-button" id="pause-button" type="button" aria-label="暂停模拟">Ⅱ</button>
          <div class="recording-indicator" id="recording-indicator" aria-live="polite" hidden>
            <i aria-hidden="true"></i><span>REC</span><time id="recording-time">00:00</time>
          </div>
          <div class="recording-toast" id="recording-toast" role="status" hidden></div>
        </div>
        <footer class="viewport-footer">
          <span><i class="dot terrain"></i> Terrain mesh</span>
          <span><i class="dot surface"></i> Water surface</span>
          <span><i class="dot collider"></i> Collider contract</span>
          <span class="footer-note">Protocol · Subject Definition · Babylon · Havok</span>
        </footer>
      </div>

      <aside class="inspector">
        <section class="runtime-diagnostics-card" id="runtime-diagnostics-card">
          <div class="runtime-diagnostics-heading">
            <div><p class="eyebrow">FLIGHT RECORDER</p><h2>运行诊断</h2></div>
            <span id="runtime-diagnostics-status" data-severity="info">初始化</span>
          </div>
          <p class="runtime-diagnostics-message" id="runtime-diagnostics-message">正在建立运行基线…</p>
          <dl class="runtime-diagnostics-grid">
            <div><dt>主线程延迟</dt><dd id="runtime-diagnostics-heartbeat">—</dd></div>
            <div><dt>Runtime 阶段</dt><dd id="runtime-diagnostics-phase">—</dd></div>
            <div><dt>模拟 / 渲染</dt><dd id="runtime-diagnostics-cost">—</dd></div>
            <div><dt>内存 / DOM</dt><dd id="runtime-diagnostics-memory">—</dd></div>
            <div><dt>按键</dt><dd id="runtime-diagnostics-input">—</dd></div>
            <div><dt>事件记录</dt><dd id="runtime-diagnostics-events">0</dd></div>
          </dl>
          <div class="runtime-diagnostics-actions">
            <button id="runtime-diagnostics-mark" type="button">记录现场</button>
            <button id="runtime-diagnostics-copy" type="button">复制摘要</button>
            <button id="runtime-diagnostics-download" type="button">下载 JSON</button>
          </div>
          <details class="runtime-diagnostics-events"><summary>最近的异常与恢复</summary><pre id="runtime-diagnostics-output">等待诊断事件…</pre></details>
        </section>
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
          <label>Subject Package<select id="subject-package-select"></select></label>
          <div class="capability-context" id="capability-context"></div>
          <label>Camera Preference<select id="camera-preference-select"></select></label>
          <div class="parameter-drafts" id="parameter-drafts"></div>
          <div class="capability-actions">
            <button class="capability-open-button" id="open-tuning-panel-button" type="button">打开大尺寸调控台</button>
            <button id="fallback-button" type="button">注入 Safe Fallback</button>
            <button id="harness-button" type="button">运行 H01–H09</button>
            <button id="export-package-button" type="button">导出 Candidate JSON</button>
          </div>
          <pre id="harness-output">ready</pre>
        </div>
      </aside>
    </section>
  </main>
  ${authoringMode ? `
    <div class="tuning-layer" id="tuning-layer" hidden>
      <aside class="tuning-workbench" aria-labelledby="tuning-title">
        <header class="tuning-header">
          <div>
            <p class="eyebrow">SUBJECT & CAMERA WORKBENCH</p>
            <h2 id="tuning-title">主体与相机调控台</h2>
            <p>选择、试跑、调整、导出都集中在这里。左侧世界画面仍然可以直接操作。</p>
          </div>
          <button class="tuning-close" id="close-tuning-button" type="button" aria-label="关闭调控台">×</button>
        </header>
        <nav class="tuning-nav" aria-label="调控台章节">
          <a href="#tuning-subject">选择主体</a>
          <a href="#tuning-input">操作测试</a>
          <a href="#tuning-motion">运动手感</a>
          <a href="#tuning-control">输入手感</a>
          <a href="#tuning-camera">相机</a>
          <a href="#tuning-versions">本地版本</a>
          <a href="#tuning-delivery">检查与导出</a>
        </nav>
        <div class="tuning-content">
          <section class="tuning-section" id="tuning-subject">
            <div class="tuning-section-heading"><span>01</span><div><h3>先选择要调的主体</h3><p>切换主体会重新载入对应的白膜、运动规律和默认镜头。</p></div></div>
            <label class="friendly-field">主体预制<select id="tuning-subject-select"></select></label>
            <div class="friendly-summary" id="tuning-subject-summary"></div>
          </section>
          <section class="tuning-section" id="tuning-input">
            <div class="tuning-section-heading"><span>02</span><div><h3>直接试一下操作</h3><p>键盘和下面的按钮会走同一套输入链路，按钮适合快速确认配置是否正确。</p></div></div>
            <div class="input-capability-grid" id="tuning-input-capabilities"></div>
            <div class="tuning-inline-status" id="tuning-input-status">等待试跑</div>
          </section>
          <section class="tuning-section" id="tuning-motion">
            <div class="tuning-section-heading"><span>03</span><div><h3>选择运动算法并调整手感草稿</h3><p>运动算法只切换锁定的 Motion Profile；滑杆只编辑本地 Feel 候选值，运行时继续使用已锁定的 Control Feel Ref，发布前需 promote。</p></div></div>
            <label class="friendly-field">运动算法<select id="tuning-motion-select"></select></label>
            <div class="friendly-slider-grid" id="tuning-motion-sliders"></div>
          </section>
          <section class="tuning-section" id="tuning-control">
            <div class="tuning-section-heading"><span>04</span><div><h3>调整输入手感草稿</h3><p>候选值只描述“按键或摇杆怎样变成操作意图”，promote 为新 Control Profile 后才影响运行时。</p></div></div>
            <div class="friendly-slider-grid" id="tuning-control-sliders"></div>
          </section>
          <section class="tuning-section" id="tuning-camera">
            <div class="tuning-section-heading"><span>05</span><div><h3>选择并微调相机</h3><p>控制台只公开第一人称和第三人称自由环绕；镜头数字先作为本地草稿预览，导出 Candidate 后才进入发布流程。</p></div></div>
            <div class="camera-instructions"><span>鼠标左键拖动</span>旋转 <span>滚轮</span>缩放 <button id="reset-camera-view-button" type="button">镜头回正</button></div>
            <div class="camera-card-grid" id="tuning-camera-cards"></div>
            <section class="camera-inspector-section" id="tuning-camera-basic" aria-labelledby="tuning-camera-basic-title"><h4 id="tuning-camera-basic-title">基础 · Camera View</h4><div class="friendly-slider-grid camera-tuning-grid"></div></section>
            <section class="camera-inspector-section" id="tuning-camera-expert" aria-labelledby="tuning-camera-expert-title"><h4 id="tuning-camera-expert-title">专家 · Follow Arm / Collision / Lag</h4><div class="camera-expert-groups"></div></section>
            <section class="camera-inspector-section camera-runtime-diagnostics" id="tuning-camera-runtime" aria-labelledby="tuning-camera-runtime-title"><div class="camera-diagnostics-heading"><div><h4 id="tuning-camera-runtime-title">运行时诊断（只读）</h4><p>P1.5 只发布 ground / air；水面规则在当前运行时不可用。</p></div><button id="tuning-camera-overlay-toggle" type="button" aria-pressed="false">显示开发 Overlay</button></div><section aria-labelledby="tuning-camera-input-debug-title"><h5 id="tuning-camera-input-debug-title">Input Debug（只读）</h5><dl id="tuning-camera-input-debug"></dl></section><dl id="tuning-camera-diagnostics"></dl><div id="tuning-camera-overlay" hidden aria-live="polite"></div></section>
            <section class="camera-inspector-section camera-publish-boundary" id="tuning-camera-publish" aria-labelledby="tuning-camera-publish-title"><h4 id="tuning-camera-publish-title">发布边界</h4><p>相机偏好和微调仅保存在此浏览器的本地草稿；不会直接改写 Gameplay、Input 或已锁定 Profile。使用下方“导出 Candidate”发布候选值。</p></section>
          </section>
          <section class="tuning-section" id="tuning-versions">
            <div class="tuning-section-heading"><span>06</span><div><h3>保存为本地版本</h3><p>先把满意的手感保存成一个有名字的版本。它只保存在当前浏览器；设为本机默认后，下次打开这个主体会自动使用。</p></div></div>
            <div class="local-version-editor">
              <label>版本名称<input id="tuning-version-name" type="text" maxlength="80" placeholder="例如：四轮载具 · 稳健转向 01"></label>
              <label>调参备注（可选）<textarea id="tuning-version-notes" rows="2" maxlength="500" placeholder="记录这版解决了什么手感问题"></textarea></label>
              <button class="primary" id="tuning-save-version-button" type="button">保存当前版本</button>
            </div>
            <p class="local-version-explanation">本机默认不会修改 GitHub。要成为所有人的公共默认值，仍需导出并通过代码审核更新 main 分支。</p>
            <div class="local-version-list" id="tuning-version-list"></div>
          </section>
          <section class="tuning-section" id="tuning-delivery">
            <div class="tuning-section-heading"><span>07</span><div><h3>检查并导出</h3><p>先跑一次自动检查，再把主体、运动、输入和所有镜头配置一起导出。</p></div></div>
            <div class="delivery-actions">
              <button id="tuning-harness-button" type="button">运行自动检查</button>
              <button class="primary" id="tuning-export-button" type="button">导出 Candidate JSON</button>
            </div>
            <pre class="friendly-result" id="tuning-result">尚未运行检查</pre>
          </section>
        </div>
        <footer class="tuning-footer"><span id="tuning-save-status">更改会自动保存在本机草稿中</span><button id="tuning-export-footer-button" type="button">导出 Candidate JSON</button></footer>
      </aside>
    </div>
  ` : ''}
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

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

function navigateToSubjectPackage(subjectDefinitionRef: string): void {
  writeLocalDraft("worldkit.subject-package", subjectDefinitionRef);
  const next = new URL(window.location.href);
  next.searchParams.set("authoring", "1");
  next.searchParams.set("subjectDefinitionRef", subjectDefinitionRef);
  next.searchParams.set("uiRecovery", String(Date.now()));
  window.location.assign(next);
}

const FRIENDLY_MOTION_PARAMETERS: Readonly<Record<string, readonly [string, string]>> = {
  walkSpeedMetersPerSecond: ["普通移动速度", "不按 Shift 时的移动速度"],
  runSpeedMetersPerSecond: ["加速移动速度", "按住 Shift 时的移动速度"],
  forwardSpeedMetersPerSecond: ["最高前进速度", "持续向前时可以达到的速度"],
  reverseSpeedMetersPerSecond: ["最高倒退速度", "持续倒退时可以达到的速度"],
  maximumSpeedMetersPerSecond: ["最高速度", "限制主体不会无限加速"],
  minimumForwardSpeedMetersPerSecond: ["最低滑翔速度", "低于它时会更容易下坠"],
  maximumForwardSpeedMetersPerSecond: ["最高滑翔速度", "滑翔过程的速度上限"],
  jumpSpeedMetersPerSecond: ["跳跃力度", "数值越高，起跳高度越高"],
  accelerationMetersPerSecondSquared: ["起步灵敏度", "数值越高，达到目标速度越快"],
  driveAccelerationMetersPerSecondSquared: ["推进力度", "数值越高，滑行起步越快"],
  glideAccelerationMetersPerSecondSquared: ["滑翔加速", "向前滑翔时累积速度的快慢"],
  decelerationMetersPerSecondSquared: ["松手减速", "松开方向键后停下来的快慢"],
  brakeMetersPerSecondSquared: ["制动力度", "按 Ctrl 或当前主体的制动键时停下来的快慢"],
  turnRateRadiansPerSecond: ["转向速度", "数值越高，转弯越灵敏"],
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
  "worldkit://camera-profile/first-person.standard@1",
  "worldkit://camera-profile/orbit.medium@1",
] as const;
const CAMERA_CONSOLE_DEFAULT_PROFILE_REF =
  "worldkit://camera-profile/orbit.medium@1" as const;
const FIRST_PERSON_UNSUPPORTED_CAMERA_TUNING_NAMES = new Set<string>([
  "distanceMeters",
  "shoulderOffsetMeters",
  "collisionRadiusMeters",
  "collisionRetractionMetersPerSecond",
  "collisionRecoveryMetersPerSecond",
  "lookAheadSeconds",
  "accelerationLookAheadSecondsSquared",
  "horizontalDeadZoneRatio",
  "verticalDeadZoneRatio",
]);

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
    (state) => state.kind === "locomotion-capability-state",
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
  const showWorkbench = (): void => {
    layer.hidden = false;
    document.body.classList.add("tuning-open");
  };
  const hideWorkbench = (): void => {
    layer.hidden = true;
    document.body.classList.remove("tuning-open");
  };
  openButtons.forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", showWorkbench);
  });
  closeButton.addEventListener("click", hideWorkbench);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && !layer.hidden) hideWorkbench();
  });

  const subjectSelect = requiredElement<HTMLSelectElement>("#tuning-subject-select");
  subjectSelect.replaceChildren(...workbenchContext.definitions.map((definition) =>
    new Option(
      `${subjectFriendlyName(definition)} · ${definition.authoringAvailability}`,
      definition.resourceRef,
      false,
      definition.resourceRef === workbenchContext.definition.resourceRef,
    )
  ));
  subjectSelect.addEventListener("change", () => navigateToSubjectPackage(subjectSelect.value));
  const summary = requiredElement<HTMLDivElement>("#tuning-subject-summary");
  const currentSubject = workbenchContext.initialSubject;
  const currentLocomotionState = locomotionStateFromSubjectV4(currentSubject);
  summary.innerHTML = `
    <div><span>现在调的是</span><strong>${escapeHtml(subjectFriendlyName(workbenchContext.definition))}</strong></div>
    <div><span>移动方式</span><strong>${escapeHtml(kernelFriendlyName(workbenchContext.activeKernel))}</strong></div>
    <div><span>所在环境</span><strong>${currentLocomotionState?.movementMedium === "air" ? "空中" : "地面"}</strong></div>
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
      keyLabel: wheeled ? "松开空格" : "Shift",
      title: wheeled ? "漂移增益" : commandKind === "flight-attitude" ? "滑翔动作" : forwardSteer ? "冲刺" : commandKind === "throttle-steer" ? "增强推进" : "奔跑",
      explanation: wheeled ? "漂移超过一秒或三秒后松开，分别触发两档自动增益" : commandKind === "flight-attitude" ? "提交滑翔主动作请求；可继续由动作表绑定展开" : "按住时使用配置表中的加速倍率",
      steps: wheeled
        ? [
            { actions: ["move-forward", "move-left", "handbrake"], ticks: 66 },
            { actions: ["move-forward", "move-left"], ticks: 1 },
          ]
        : [{ actions: ["move-forward", commandKind === "planar-vector" || forwardSteer ? "run" : "boost"], ticks: 30 }],
    },
    {
      keyLabel: "空格",
      title: commandKind === "planar-vector" || forwardSteer ? "跳跃" : gliding ? "滑翔主动作" : wheeled ? "漂移" : "制动",
      explanation: gliding ? "提交主动作请求，不会再被误当成制动" : wheeled ? "按住时锁定漂移方向，蓄力后松开会触发增益" : commandKind === "throttle-steer" && !forwardSteer ? "按住时使用独立制动，不再和技能键混用" : "支持离地宽容、预输入和长短跳",
      steps: commandKind === "throttle-steer" && !forwardSteer
        ? [{ actions: ["move-forward"], ticks: 18 }, { actions: [wheeled ? "handbrake" : "brake"], ticks: 12 }]
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
  const controlSliderGrid = requiredElement<HTMLDivElement>("#tuning-control-sliders");
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
  const sanitizeCameraTuning = (
    profile: CompatibleProfileSummaryV1,
    values: Readonly<Record<string, number>>,
  ): CameraTuningV1 => Object.fromEntries(
    Object.entries(values).filter(([name, value]) => {
      const range = profile.authoringRanges?.[name];
      return range !== undefined && Number.isFinite(value) &&
        value >= range.minimum && value <= range.maximum &&
        (profile.baseMode !== "first-person" ||
          !FIRST_PERSON_UNSUPPORTED_CAMERA_TUNING_NAMES.has(name));
    }),
  ) as CameraTuningV1;

  const numericParameters = (
    parameters: Readonly<Record<string, number | boolean>> | undefined,
  ): Record<string, number> => Object.fromEntries(
    Object.entries(parameters ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
  const controlBaseParameters = numericParameters(controlProfile?.parameters);
  let controlTuning: ControlTuningV1 = { ...controlBaseParameters };
  const cameraTuningByProfileRef: Record<string, Record<string, number>> = Object.fromEntries(
    cameraConsoleRows.map((profile) => [profile.resourceRef, {}]),
  );
  let cameraPreference = workbenchContext.initialCameraPreference === "first-person"
    ? CAMERA_CONSOLE_PROFILE_REFS[0]
    : isConsoleCameraProfileRef(workbenchContext.initialCameraPreference)
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
    Object.assign(workbenchContext.parameterDraft, selectedControlFeelProfile()?.parameters ?? {});
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
        selectedControlFeelProfile()?.parameters ?? {},
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
    Object.assign(workbenchContext.parameterDraft, controlFeelValues);
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
      return;
    }
    motionSliderGrid.replaceChildren(...Object.entries(activeControlFeelProfile.safetyLimits).flatMap(([name, safetyLimit]) => {
      const value = workbenchContext.parameterDraft[name];
      const range = activeControlFeelProfile.authoringRanges?.[name] ?? {
        ...safetyLimit,
        step: Math.max(0.01, (safetyLimit.maximum - safetyLimit.minimum) / 100),
      };
      if (typeof value !== "number" || range.minimum === range.maximum) return [];
      const [labelText, helpText] = FRIENDLY_MOTION_PARAMETERS[name] ?? [name, "安全范围内的运动参数"];
      const label = document.createElement("label");
      label.className = "friendly-slider";
      label.innerHTML = `<span><strong>${escapeHtml(labelText)} · 仅草稿</strong><small>${escapeHtml(helpText)}；运动手感由锁定的 Feel 配置驱动，数值袋不再即时下发</small></span>`;
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
        saveStatus.textContent = `“${labelText}”只保存为草稿；发布前需 promote 为新的 Feel Profile`;
      });
      control.append(input, output);
      label.append(control);
      return [label];
    }));
  };

  const renderControlSliders = (): void => {
    if (controlProfile?.safetyLimits === undefined) {
      controlSliderGrid.innerHTML = '<p class="friendly-empty">当前主体没有开放可调的输入手感参数。</p>';
      return;
    }
    const copy: Readonly<Record<string, readonly [string, string]>> = {
      moveDeadzoneRatio: ["移动输入死区", "忽略很小的摇杆偏移；键盘操作通常感觉不明显，手柄可防止角色自己慢慢移动"],
    };
    controlSliderGrid.replaceChildren(...["moveDeadzoneRatio"].flatMap((name) => {
      const value = controlTuning[name as keyof ControlTuningV1];
      const safetyLimit = controlProfile.safetyLimits?.[name];
      const range = controlProfile.authoringRanges?.[name] ?? (safetyLimit === undefined ? undefined : {
        ...safetyLimit,
        step: Math.max(0.01, (safetyLimit.maximum - safetyLimit.minimum) / 100),
      });
      if (typeof value !== "number" || range === undefined) return [];
      const [labelText, helpText] = copy[name] ?? [name, "输入曲线参数"];
      const label = document.createElement("label");
      label.className = "friendly-slider";
      label.innerHTML = `<span><strong>${escapeHtml(labelText)} · 仅草稿</strong><small>${escapeHtml(helpText)}；发布前需 promote 为新的 Control Profile</small></span>`;
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
        controlTuning = { ...controlTuning, [name]: nextValue };
        output.textContent = nextValue.toFixed(2);
        persistWorkingDraft();
        saveStatus.textContent = `“${labelText}”只保存为草稿；当前预览继续使用锁定的 Control Profile`;
      });
      control.append(input, output);
      label.append(control);
      return [label];
    }));
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
      { key: "targetHeightMeters", label: "观察高度", help: "没有专用相机挂点时，镜头对准主体的高度；有挂点时由资产位置决定", step: 0.05, fallback: Number(base.targetHeightMeters ?? 1.2) },
      { key: "pitchRadians", label: "镜头俯仰角", help: "调整镜头从上方或下方观察的角度", step: 0.01, fallback: Number(base.pitchRadians ?? 0.25) },
      { key: "positionDampingPerSecond", label: "整体位置阻尼", help: "未单独覆盖水平或垂直阻尼时，同时控制两个轴；轴向 Preview 值优先", step: 0.1, fallback: Number(base.positionDampingPerSecond ?? 12) },
      { key: "horizontalPositionDampingPerSecond", label: "水平跟随速度", help: "调低后主体会在画面左右/前后先行，调高后镜头更快追上", step: 0.1, fallback: Number(base.horizontalPositionDampingPerSecond ?? base.positionDampingPerSecond ?? 12) },
      { key: "verticalPositionDampingPerSecond", label: "垂直跟随速度", help: "单独控制跳跃、坡面和水面起伏时镜头上下跟随的快慢", step: 0.1, fallback: Number(base.verticalPositionDampingPerSecond ?? base.positionDampingPerSecond ?? 12) },
      { key: "maximumPositionLagMeters", label: "主体最多领先镜头的距离", help: "限制主体最多能冲到镜头前方多远；设为 0 时镜头位置紧跟", step: 0.1, fallback: Number(base.maximumPositionLagMeters ?? 4) },
      { key: "yawDampingPerSecond", label: "水平旋转跟随", help: "越高越快跟上主体转向，越低越有电影感", step: 0.1, fallback: Number(base.yawDampingPerSecond ?? base.rotationDampingPerSecond ?? 14) },
      { key: "pitchDampingPerSecond", label: "俯仰旋转跟随", help: "单独控制镜头上下抬落的平滑速度", step: 0.1, fallback: Number(base.pitchDampingPerSecond ?? base.rotationDampingPerSecond ?? 14) },
      { key: "rotationDampingPerSecond", label: "整体旋转阻尼", help: "未单独覆盖偏航或俯仰阻尼时，同时控制两个轴；轴向 Preview 值优先", step: 0.1, fallback: Number(base.rotationDampingPerSecond ?? 14) },
      { key: "lookSensitivityXRatio", label: "水平拖动灵敏度", help: "鼠标左右拖动的响应倍率", step: 0.05, fallback: Number(base.lookSensitivityXRatio ?? 1) },
      { key: "lookSensitivityYRatio", label: "垂直拖动灵敏度", help: "鼠标上下拖动的响应倍率", step: 0.05, fallback: Number(base.lookSensitivityYRatio ?? 1) },
      { key: "collisionRadiusMeters", label: "Probe Size（球形 Sweep 半径）", help: "0 使用射线；正值使用 Havok 球形 Sweep。默认 0.12 米（12 cm），数值越大越早收臂。", step: 0.01, fallback: Number(base.collisionRadiusMeters ?? 0.12) },
      { key: "collisionRetractionMetersPerSecond", label: "遇墙缩近速度", help: "遮挡出现时镜头向主体收回的速度", step: 0.25, fallback: Number(base.collisionRetractionMetersPerSecond ?? 30) },
      { key: "collisionRecoveryMetersPerSecond", label: "离墙恢复速度", help: "遮挡消失后镜头慢慢回到原距离的速度", step: 0.25, fallback: Number(base.collisionRecoveryMetersPerSecond ?? 5) },
      { key: "lookAheadSeconds", label: "启动时镜头向前带", help: "主体移动时焦点沿前进方向预看；设为 0 完全关闭", step: 0.01, fallback: Number(base.lookAheadSeconds ?? 0.2) },
      { key: "accelerationLookAheadSecondsSquared", label: "加速预判", help: "急加速和急转时根据加速度额外预看；设为 0 关闭", step: 0.01, fallback: Number(base.accelerationLookAheadSecondsSquared ?? 0) },
      { key: "minimumHeadingSpeedMetersPerSecond", label: "速度镜头起效门槛", help: "低于该速度时保持最后稳定方向，避免停车或低速抖动", step: 0.1, fallback: Number(base.minimumHeadingSpeedMetersPerSecond ?? 0.5) },
      { key: "velocityHeadingDampingPerSecond", label: "追逐方向跟随速度", help: "速度方向改变后镜头旋转跟上的快慢", step: 0.25, fallback: Number(base.velocityHeadingDampingPerSecond ?? 10) },
      { key: "transitionSeconds", label: "镜头切换时间", help: "切换预制时连续过渡所用的时间", step: 0.05, fallback: Number(base.transitionSeconds ?? 0.35) },
      { key: "baseFovDegrees", label: "视野宽度", help: "越大看到的范围越广", step: 0.5, fallback: Number(base.baseFovDegrees ?? 60) },
      { key: "speedFovDegreesPerMeterPerSecond", label: "加速时视野变宽", help: "速度越快画面越有冲刺感；设为 0 完全关闭", step: 0.05, fallback: Number(base.speedFovDegreesPerMeterPerSecond ?? 0) },
      { key: "maximumSpeedFovDegrees", label: "冲刺视野上限", help: "限制高速时最多额外增加多少视野", step: 0.5, fallback: Number(base.maximumSpeedFovDegrees ?? 0) },
      { key: "fovDampingPerSecond", label: "视野变化平滑", help: "速度变化时视野宽度跟上的快慢", step: 0.25, fallback: Number(base.fovDampingPerSecond ?? 8) },
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
    const groupForSetting = (key: CameraTuningParameterNameV1): "camera-view" | "follow-arm" | "collision" | "lag" =>
      key.startsWith("collision") ? "collision"
        : ["distanceMeters", "rotationDampingPerSecond", "yawDampingPerSecond", "pitchDampingPerSecond", "minimumHeadingSpeedMetersPerSecond", "velocityHeadingDampingPerSecond", "recenterDelaySeconds", "recenterDurationSeconds", "recenterMinimumSpeedMetersPerSecond"].includes(key) ? "follow-arm"
          : ["positionDampingPerSecond", "horizontalPositionDampingPerSecond", "verticalPositionDampingPerSecond", "maximumPositionLagMeters", "lookAheadSeconds", "accelerationLookAheadSecondsSquared", "horizontalDeadZoneRatio", "verticalDeadZoneRatio", "teleportSnapDistanceMeters"].includes(key) ? "lag"
            : "camera-view";
    const eligibleSettings = settings.filter((setting) =>
      profile?.authoringRanges?.[setting.key] !== undefined &&
      (profile.baseMode !== "first-person" || !firstPersonUnsupported.has(setting.key))
    );
    const createSlider = (setting: typeof settings[number]): HTMLLabelElement => {
      const range = profile?.authoringRanges?.[setting.key];
      if (range === undefined) throw new Error("Expected authoring range for rendered camera setting.");
      const safetyLimit = profile?.safetyLimits?.[setting.key] ??
        CAMERA_TUNING_SAFETY_LIMITS_V1[setting.key];
      const value = cameraTuning[setting.key] ?? setting.fallback;
      const label = document.createElement("label");
      label.className = "friendly-slider";
      label.dataset.cameraControl = setting.key;
      const summary = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = setting.label;
      const help = document.createElement("small");
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
      summary.append(title, help);
      const control = document.createElement("div");
      const input = document.createElement("input");
      input.type = "range";
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
        renderCameraDiagnostics();
        saveStatus.textContent = `“${setting.label}”已应用；这组数值只属于当前镜头`;
      });
      control.append(input, output);
      label.append(summary, control);
      return label;
    };
    const appendGroup = (
      target: HTMLElement,
      group: "camera-view" | "follow-arm" | "collision" | "lag",
      title: string,
    ): void => {
      const controls = eligibleSettings.filter((setting) => groupForSetting(setting.key) === group)
        .map(createSlider);
      if (controls.length === 0) return;
      const section = document.createElement("section");
      section.dataset.cameraGroup = group;
      const heading = document.createElement("h5");
      heading.textContent = title;
      const grid = document.createElement("div");
      grid.className = "friendly-slider-grid camera-tuning-grid";
      grid.append(...controls);
      section.append(heading, grid);
      target.append(section);
    };
    cameraBasic.replaceChildren();
    cameraExpert.replaceChildren();
    appendGroup(cameraBasic, "camera-view", "Camera View");
    if (profile?.baseMode !== "first-person") {
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
  renderControlSliders();

  const versionNameInput = requiredElement<HTMLInputElement>("#tuning-version-name");
  const versionNotesInput = requiredElement<HTMLTextAreaElement>("#tuning-version-notes");
  const versionList = requiredElement<HTMLDivElement>("#tuning-version-list");
  const saveVersionButton = requiredElement<HTMLButtonElement>("#tuning-save-version-button");

  const refreshWorkbenchAfterRestore = (): void => {
    refreshCameraCards();
    renderCameraSliders();
    renderMotionSelect();
    renderMotionSliders();
    renderControlSliders();
    const compactCameraSelect = document.querySelector<HTMLSelectElement>("#camera-preference-select");
    if (compactCameraSelect !== null && [...compactCameraSelect.options].some(
      (option) => option.value === cameraPreference,
    )) {
      compactCameraSelect.value = cameraPreference;
    }
  };

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
  const requestedDefinitionRef = urlParameters.get("subjectDefinitionRef");
  panel.hidden = false;
  packageSelect.replaceChildren(...definitions.map((definition) => {
    const option = document.createElement("option");
    option.value = definition.resourceRef;
    option.textContent = `${definition.displayName} · ${definition.authoringAvailability}`;
    option.selected = definition.resourceRef === requestedDefinitionRef;
    return option;
  }));
  packageSelect.addEventListener("change", () => {
    navigateToSubjectPackage(packageSelect.value);
  });
  cameraSelect.replaceChildren(new Option("Runtime 启动后可用", "unavailable"));
  cameraSelect.disabled = true;
  context.innerHTML = `
    <div><span>Status</span><code>RECOVERY MODE</code></div>
    <div><span>Package</span><code>${escapeHtml(requestedDefinitionRef ?? "unknown")}</code></div>
  `;
  drafts.innerHTML = `
    <p>当前主体未能启动。你仍然可以在上方切换 Subject Package，或先进入安全白膜恢复编辑器。</p>
  `;
  harnessOutput.textContent = JSON.stringify(authoringStartupEvidence(api), null, 2);
  const controls = requiredElement<HTMLDivElement>("#controls-card");
  controls.innerHTML = `
    <p>恢复模式</p>
    <div><span>Subject Package</span><span>切换到其他主体</span></div>
    <div><span>安全白膜</span><span>恢复完整编辑界面</span></div>
  `;
  const safePackageButton = requiredElement<HTMLButtonElement>("#fallback-button");
  safePackageButton.textContent = "恢复为四足白膜";
  safePackageButton.addEventListener("click", () => {
    navigateToSubjectPackage(
      "worldkit://subject-definition/animal.quadruped.forward-steer@1",
    );
  });
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
  const packageSelect = requiredElement<HTMLSelectElement>("#subject-package-select");
  const cameraSelect = requiredElement<HTMLSelectElement>("#camera-preference-select");
  const context = requiredElement<HTMLDivElement>("#capability-context");
  const drafts = requiredElement<HTMLDivElement>("#parameter-drafts");
  const harnessOutput = requiredElement<HTMLPreElement>("#harness-output");
  const snapshot = initialSnapshot;
  const controlledEntityId = controlledEntityIdFromSnapshotV4(snapshot);
  const activeSubject = snapshot.world.subjectStatesByEntityId[controlledEntityId];
  const requestedDefinitionRef = urlParameters.get("subjectDefinitionRef");
  const activeDefinitionRef = requestedDefinitionRef ??
    activeSubject?.entityState.entityDefinitionRef ??
    definitions[0]!.resourceRef;
  const exactRegistryDefinition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    activeDefinitionRef,
  );
  const semanticRegistryDefinition = definitions.find((candidate) =>
    candidate.semanticClassId === activeSubject?.entityState.semanticClassId
  );
  const activeRegistryDefinition = exactRegistryDefinition ??
    (semanticRegistryDefinition === undefined
      ? undefined
      : builtInSubjectResourceRegistry.resolveSubjectDefinition(
          semanticRegistryDefinition.resourceRef,
        ));
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
  const resolvedDefinitionRef = activeDefinitionSummary?.resourceRef ??
    activeDefinitionRef;
  const authoringDefinitions = definitions.some(
      (definition) => definition.resourceRef === resolvedDefinitionRef,
    ) || activeDefinitionSummary === undefined
    ? definitions
    : [activeDefinitionSummary, ...definitions];
  packageSelect.replaceChildren(...authoringDefinitions.map((definition) => {
    const option = document.createElement("option");
    option.value = definition.resourceRef;
    option.textContent = `${definition.displayName} · ${definition.authoringAvailability}`;
    option.selected = definition.resourceRef === resolvedDefinitionRef;
    return option;
  }));

  const definition = authoringDefinitions.find(
    (row) => row.resourceRef === resolvedDefinitionRef,
  ) ??
    authoringDefinitions[0]!;
  packageSelect.value = definition.resourceRef;
  const activeMotionProfile = builtInSubjectResourceRegistry.resolveMotionProfile(
    definition.defaultMotionProfileRef,
  );
  const availableKernels = api.listMotionKernels?.({
    includeExperimental: true,
    includeInternal: true,
  }) ?? [];
  const definitionKernel = availableKernels.find(
    (kernel) => kernel.resourceRef === activeMotionProfile?.motionKernelRef,
  );
  const activeLocomotionState = locomotionStateFromSubjectV4(activeSubject);
  const runtimeKernelRefByLocomotionCapabilityRef: Readonly<Record<string, string>> = {
    "worldkit://capability/locomotion.wheeled@1":
      "worldkit://motion-kernel/wheeled-arcade@1",
    "worldkit://capability/locomotion.surface-slide@1":
      "worldkit://motion-kernel/surface-slide@1",
    "worldkit://capability/locomotion.water-surface@1":
      "worldkit://motion-kernel/water-surface@1",
    "worldkit://capability/locomotion.unpowered-glide@1":
      "worldkit://motion-kernel/unpowered-glide@1",
    "worldkit://capability/locomotion.powered-flight@1":
      "worldkit://motion-kernel/powered-flight@1",
  };
  const runtimeKernelRef = activeLocomotionState === undefined
    ? undefined
    : runtimeKernelRefByLocomotionCapabilityRef[
        activeLocomotionState.locomotionCapabilityRef
      ];
  const activeKernel = availableKernels.find(
    (kernel) => kernel.resourceRef === runtimeKernelRef,
  ) ?? definitionKernel;
  const controls = requiredElement<HTMLDivElement>("#controls-card");
  controls.innerHTML = activeKernel?.commandKind === "throttle-steer"
    ? `
        <p>油门 / 转向</p>
        <div><kbd>W</kbd><kbd>S</kbd><span>前进 / 倒退</span></div>
        <div><kbd>A</kbd><kbd>D</kbd><span>左转 / 右转</span></div>
        ${activeKernel.resourceRef.includes("wheeled-arcade")
          ? '<div><kbd>空格</kbd><span>漂移（松开触发增益）</span></div>'
          : `<div><kbd>⇧</kbd><span>增强推进</span><kbd>空格</kbd><span>${activeKernel.resourceRef.includes("forward-steer") ? "跳跃" : "制动"}</span></div>`}
        <div><kbd>Ctrl</kbd><span>独立制动</span><kbd>Alt</kbd><span>${activeKernel.resourceRef.includes("wheeled-arcade") ? "备用手刹" : "手刹"}</span></div>
        <div><kbd>R</kbd><span>镜头回正</span><kbd>C</kbd><span>回头看</span></div>
        <div><kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><span>上下左右观察</span></div>
        <div><span>鼠标拖动 / 滚轮</span><span>旋转 / 缩放镜头</span></div>
      `
    : activeKernel?.commandKind === "flight-attitude"
      ? `
          <p>飞行姿态</p>
          <div><kbd>W</kbd><kbd>S</kbd><span>俯仰</span></div>
          <div><kbd>A</kbd><kbd>D</kbd><span>偏航 / 倾斜</span></div>
          <div><kbd>⇧</kbd><kbd>空格</kbd><span>滑翔主动作</span></div>
          <div><kbd>R</kbd><span>镜头回正</span><kbd>C</kbd><span>回头看</span></div>
          <div><kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><span>上下左右观察</span></div>
          <div><span>鼠标拖动 / 滚轮</span><span>旋转 / 缩放镜头</span></div>
        `
      : `
          <p>平面移动</p>
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span></div>
          <div><kbd>⇧</kbd><span>奔跑</span><kbd>空格</kbd><span>跳跃</span></div>
          <div><kbd>F</kbd><span>瞄准</span><kbd>R</kbd><span>镜头回正</span></div>
          <div><kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd><span>上下左右观察</span></div>
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

  packageSelect.addEventListener("change", () => {
    navigateToSubjectPackage(packageSelect.value);
  });
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
    } catch {
      harnessOutput.textContent = authoringActionFailure();
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
  const rollback = (): void => {
    abortController.abort();
    if (!isNil(captureTimer)) window.clearTimeout(captureTimer);
    delete (window as { __WHITEBOX_PLAYGROUND__?: unknown }).__WHITEBOX_PLAYGROUND__;
    delete document.documentElement.dataset.artifactCapture;
  };

  try {
    requiredElement("#adapter-name").textContent = renderer.name;
    requiredElement<HTMLElement>("#runtime-diagnostics-card").hidden = true;
    requiredElement<HTMLElement>("#runtime-health-hud").hidden = true;
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
      featureList.replaceChildren(...features.map((feature) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `feature-item${selectedFeatureId === feature.id ? " selected" : ""}`;
        button.dataset.featureId = feature.id;
        button.innerHTML = `
          <span class="feature-icon ${feature.resources[0]?.kind ?? "mesh"}"></span>
          <span><strong>${feature.id}</strong><small>${feature.type} · v${feature.version}</small></span>
          <em>${feature.status}</em>
        `;
        button.addEventListener("click", () => selectFeature(feature.id), {
          signal: abortController.signal,
        });
        return button;
      }));
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
  delete window.__WORLDKIT_STARTUP_DIAGNOSTIC__;
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
  let createdPlaygroundMetadata:
    | import("./playground-world.js").PlaygroundWorldMetadataV1
    | undefined;
  let startupStage = "host-resolver";
  let startupRevision = 0;
  const publishStartupDiagnostic = (
    phase: "loading" | "ready" | "error",
    stage: string,
    error?: unknown,
  ): void => {
    startupStage = stage;
    startupRevision += 1;
    window.__WORLDKIT_STARTUP_DIAGNOSTIC__ = Object.freeze({
      phase,
      stage,
      revision: startupRevision,
      updatedAtMilliseconds: Date.now(),
      ...(error === undefined
        ? {}
        : { errorMessage: error instanceof Error ? error.message : String(error) }),
    });
  };
  const advanceStartupStage = (stage: string): void =>
    publishStartupDiagnostic("loading", stage);
  advanceStartupStage(startupStage);
  let preparationError: unknown;
  let prepared: Readonly<{
    loaded: Awaited<ReturnType<typeof import("./authoring-loader.js")["loadAuthoringScene"]>>;
    visualCaptureGroups: readonly VisualCaptureGroupV1[];
    BabylonWorldAdapter: typeof import("./babylon-world-adapter.js")["BabylonWorldAdapter"];
  }> | undefined;
  try {
    advanceStartupStage("module-import");
    const { BabylonWorldAdapter } = await import("./babylon-world-adapter.js");
    const subjectDefinitionRef = urlParameters.get("subjectDefinitionRef");
    let loaded: Awaited<ReturnType<typeof import("./authoring-loader.js")["loadAuthoringScene"]>>;
    let visualCaptureGroups: readonly VisualCaptureGroupV1[] = [];
    if (runtimeRoute.mode === "authoring") {
      const { loadAuthoringScene, loadStudioAuthoringPreviewV1 } = await import("./authoring-loader.js");
      advanceStartupStage("authoring-load");
      const worldId = urlParameters.get("world");
      const authoringOptions = {
        worldPackageStore,
        ...(isNil(subjectDefinitionRef) ? {} : { subjectDefinitionRef }),
      };
      if (isNil(worldId)) {
        loaded = await loadAuthoringScene(undefined, authoringOptions);
      } else {
        const preview = await loadStudioAuthoringPreviewV1(
          worldId,
          () => fetch(
            `/api/worlds/${encodeURIComponent(worldId)}/preview-bootstrap`,
            { cache: "no-store" },
          ),
          authoringOptions,
        );
        loaded = preview.loaded;
        visualCaptureGroups = preview.visualCaptureGroups;
      }
    } else {
      const { loadOutdoorGameplaySceneV1 } = await import(
        "./outdoor-scene-gameplay-loader.js"
      );
      advanceStartupStage("outdoor-scene-load");
      const outdoorLoaded = await loadOutdoorGameplaySceneV1(
        sceneCatalog[runtimeRoute.sceneCatalogId]!,
        {
          sceneCatalogId: runtimeRoute.sceneCatalogId,
          aspectRatio: viewport.clientWidth > 0 && viewport.clientHeight > 0
            ? viewport.clientWidth / viewport.clientHeight
            : 16 / 9,
          worldPackageStore,
          ...(isNil(subjectDefinitionRef) ? {} : { subjectDefinitionRef }),
        },
      );
      createdPlaygroundMetadata = outdoorLoaded.playgroundMetadata;
      loaded = outdoorLoaded;
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
            ...(isNil(createdPlaygroundMetadata)
              ? {}
              : { playgroundMetadata: createdPlaygroundMetadata }),
            onInitializationStage(stage) {
              advanceStartupStage(`runtime:${stage}`);
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
        publishStartupDiagnostic("error", startupStage, error);
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
  let mountedSkateboardControls:
    | ReturnType<typeof installMountedSkateboardControlsV1>
    | undefined;
  const pageLifecycle = createGameplayPageLifecycle({
    initialization: browserInstallation.initialization,
    getAdapter: () => createdAdapter,
    async setup(adapter) {
      if (runtimeRoute.mode === "authoring") {
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
      }
      const workbench = runtimeRoute.mode === "authoring"
        ? await installCapabilityAuthoringPanel(
            createAuthoringPanelRuntimeApi(browserInstallation.api, adapter),
            adapter.runtimeSnapshot(),
            createdHostOverlay,
          )
        : undefined;
      if (workbench !== undefined && createdAdapter !== null) {
        disposeAuthoringWorkbenchAdapterBinding?.();
        disposeAuthoringWorkbenchAdapterBinding = workbench.bindAdapterDiagnostics(createdAdapter);
      }
      if (
        runtimeRoute.mode === "catalog-gameplay" &&
        runtimeRoute.sceneCatalogId === MOUNTED_SKATEBOARD_S1_SCENE_ID
      ) {
        mountedSkateboardControls = installMountedSkateboardControlsV1(
          requiredElement<HTMLDivElement>("#mounted-controls"),
          browserInstallation.api,
        );
      }
      const runtimeSourceRevision = await loadTrustedSourceCommitV1()
        .catch(() => null);
      startPlayground(adapter, () => pageLifecycle.dispose(), {
        sourceRevision: runtimeSourceRevision,
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
      mountedSkateboardControls?.dispose();
      mountedSkateboardControls = undefined;
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
      publishStartupDiagnostic("ready", "page-setup");
      resolvePageSetupReady();
    }
    else rejectPageSetupReady(new Error("WORLDKIT_PAGE_SETUP_FAILED"));
  } catch (error) {
    rejectPageSetupReady(new Error("WORLDKIT_PAGE_SETUP_FAILED"));
    publishStartupDiagnostic("error", "page-setup", error);
    captureAuthoringStartupFailure("page-setup", error);
    document.documentElement.dataset.worldkitStatus = "error";
  }
  if (!pageSetupSucceeded) {
    inspection.innerHTML = `<pre>${escapeHtml(JSON.stringify(authoringStartupEvidence(browserInstallation.api), null, 2))}</pre>`;
    if (runtimeRoute.mode === "authoring") {
      installAuthoringRecoveryPanel(browserInstallation.api);
    }
  }
} else {
  delete window.__WORLDKIT__;
  delete window.__WORLDKIT_STARTUP_DIAGNOSTIC__;
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
    sourceRevision?: string | null;
    resetSimulation?: () => Promise<void>;
    afterSimulationReset?: () => void | Promise<void>;
  } = {},
): void {
requiredElement("#adapter-name").textContent = adapter.name;
let recorderCanvas = adapter.canvas;
const createCanvasRecorder = (canvas: HTMLCanvasElement): CanvasRecorder =>
  new CanvasRecorder(canvas);
let canvasRecorder = createCanvasRecorder(recorderCanvas);
const recordingWorldId = urlParameters.get("world");
const recordingWorkbench = runtimeRoute.mode === "authoring" && !isNil(recordingWorldId)
  ? installRecordingWorkbench({
      root: requiredElement<HTMLDivElement>("#recording-workbench-root"),
      sceneId: recordingWorldId,
    })
  : undefined;
let recordingTimer: number | null = null;
let runtimeFlightRecorder: RuntimeFlightRecorderControllerV1 | undefined;

const runtimeHealthLabel: Readonly<Record<
  RuntimeFlightRecorderStatusV1["latestSample"]["health"]["code"],
  readonly [string, string]
>> = {
  healthy: ["正常", "OK"],
  paused: ["已暂停", "PAUSE"],
  "degraded-fps": ["帧率较低", "LOW FPS"],
  "main-thread-stalled": ["主线程阻塞", "MAIN"],
  "runtime-phase-stalled": ["Runtime 卡住", "RUNTIME"],
  "render-stalled": ["渲染停滞", "RENDER"],
  "simulation-stalled": ["模拟停滞", "TICK"],
  "runtime-failed": ["Runtime 错误", "ERROR"],
};

function diagnosticMilliseconds(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} ms`;
}

function updateRuntimeFlightRecorderUi(
  status: RuntimeFlightRecorderStatusV1,
): void {
  const sample = status.latestSample;
  const [label, shortLabel] = runtimeHealthLabel[sample.health.code];
  const statusElement = requiredElement<HTMLElement>("#runtime-diagnostics-status");
  statusElement.textContent = label;
  statusElement.dataset.severity = sample.health.severity;
  const hud = requiredElement<HTMLElement>("#runtime-health-hud");
  hud.dataset.severity = sample.health.severity;
  requiredElement("#runtime-health-hud-value").textContent = shortLabel;
  const runtimeFailure = sample.loop.runtimeFailure?.recovery ??
    sample.loop.runtimeFailure?.initial;
  requiredElement("#runtime-diagnostics-message").textContent =
    `${sample.health.detail} · frame ${sample.runtime.frame} · tick ${sample.runtime.tick} · ${sample.runtime.fps || 0} FPS${runtimeFailure === null || runtimeFailure === undefined ? "" : ` · ${runtimeFailure.errorCode}`}${status.previousSessionAvailable ? " · 已恢复上次会话日志" : ""}`;
  requiredElement("#runtime-diagnostics-heartbeat").textContent =
    `${Math.round(sample.heartbeatDelayMilliseconds)} ms · gap ${sample.loop.lastAnimationFrameGapMilliseconds?.toFixed(1) ?? "—"}`;
  requiredElement("#runtime-diagnostics-phase").textContent =
    `${sample.loop.phase} · ${Math.round(sample.loop.phaseAgeMilliseconds)} ms`;
  requiredElement("#runtime-diagnostics-cost").textContent =
    `${diagnosticMilliseconds(sample.loop.lastSimulationDurationMilliseconds)} / ${diagnosticMilliseconds(sample.loop.lastRenderDurationMilliseconds)}`;
  const heapMegabytes = sample.javascriptHeapUsedBytes === null
    ? "—"
    : `${(sample.javascriptHeapUsedBytes / 1_000_000).toFixed(1)} MB`;
  requiredElement("#runtime-diagnostics-memory").textContent =
    `${heapMegabytes} / ${sample.domNodeCount} nodes`;
  requiredElement("#runtime-diagnostics-input").textContent =
    [...sample.loop.pressedKeyCodes, ...sample.loop.cameraInputActions].join(" + ") || "none";
  requiredElement("#runtime-diagnostics-events").textContent =
    `${status.eventCount}${status.previousSessionAvailable ? " + previous" : ""}`;
  const events = runtimeFlightRecorder?.report().events.slice(-8) ?? [];
  requiredElement<HTMLPreElement>("#runtime-diagnostics-output").textContent =
    events.length === 0
      ? "等待诊断事件…"
      : events.map((event) =>
          `${new Date(event.capturedAtUnixMilliseconds).toLocaleTimeString()} ${event.severity.toUpperCase()} ${event.code}\n${event.message}`
        ).join("\n\n");
}

runtimeFlightRecorder = installRuntimeFlightRecorderV1({
  worldId: recordingWorldId ?? adapter.name,
  ...(options.sourceRevision === undefined
    ? {}
    : { sourceRevision: options.sourceRevision }),
  source: adapter,
  onStatus: updateRuntimeFlightRecorderUi,
});
runtimeFlightRecorder.sampleNow();

requiredElement<HTMLButtonElement>("#runtime-diagnostics-mark").addEventListener(
  "click",
  () => runtimeFlightRecorder?.mark("User marked the current runtime state."),
);
requiredElement<HTMLButtonElement>("#runtime-diagnostics-download").addEventListener(
  "click",
  () => {
    const filename = runtimeFlightRecorder?.download();
    if (filename !== undefined) {
      requiredElement("#runtime-diagnostics-message").textContent =
        `已下载 ${filename}`;
    }
  },
);
requiredElement<HTMLButtonElement>("#runtime-diagnostics-copy").addEventListener(
  "click",
  () => {
    void runtimeFlightRecorder?.copySummary().then(
      () => {
        requiredElement("#runtime-diagnostics-message").textContent = "诊断摘要已复制";
      },
      () => {
        const summary = runtimeFlightRecorder?.summary() ?? "";
        window.prompt("复制运行诊断摘要", summary);
      },
    );
  },
);

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
  canvasRecorder = createCanvasRecorder(recorderCanvas);
}

let selectedFeatureId: string | null = null;
const virtualFeatureList = createVirtualFeatureListV1({
  container: featureList,
  createRow(feature) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feature-item";
    button.dataset.featureId = feature.id;
    button.innerHTML = `
      <span class="feature-icon ${feature.resources[0]?.kind ?? "mesh"}"></span>
      <span><strong>${feature.id}</strong><small>${feature.type} · v${feature.version}</small></span>
      <em>${feature.status}</em>
    `;
    button.addEventListener("click", () => selectFeature(feature.id));
    return button;
  },
});

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function resourceTotal(feature: FeatureInspection): number {
  return feature.resources.reduce((sum, resource) => sum + (resource.vertices ?? 0), 0);
}

function renderFeatureList(features: readonly FeatureInspection[]): void {
  requiredElement("#feature-count").textContent = `${features.length} FEATURES`;
  virtualFeatureList.setFeatures(features, selectedFeatureId);
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
  requiredElement("#fps").textContent = String(snapshot.performance.fps || "—");
  requiredElement("#tick").textContent = String(snapshot.tick);
  requiredElement("#controlled-entity-label").textContent = snapshot.player.entityId;
  requiredElement("#player-action").textContent = snapshot.player.action.toUpperCase();
  requiredElement("#player-position").textContent = snapshot.player.position
    .map(formatNumber)
    .join(" / ");
  const pause = requiredElement<HTMLButtonElement>("#pause-button");
  pause.textContent = snapshot.paused ? "▶" : "Ⅱ";
  pause.setAttribute("aria-label", snapshot.paused ? "继续模拟" : "暂停模拟");
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
  reset: async () => {
    await resetPlaygroundWorld();
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

function showRecordingSaved(label: string, blob: Blob, durationMs: number, persisted = true): void {
  const toast = requiredElement<HTMLDivElement>("#recording-toast");
  const megabytes = blob.size / 1_000_000;
  toast.textContent = persisted
    ? `已加入页面录制清单 · ${formatRecordingTime(durationMs)} · ${megabytes.toFixed(1)} MB · ${label}`
    : `未保存到页面，已下载本地备份 · ${formatRecordingTime(durationMs)} · ${megabytes.toFixed(1)} MB · ${label}`;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 5_000);
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
  try {
    const paths = await adapter.exportWhiteboxTriviews();
    output.textContent = `exported ${paths.length} tri-views\n${paths.join("\n")}`;
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  }
});

requiredElement<HTMLButtonElement>("#smoke-button").addEventListener("click", async () => {
  const output = requiredElement<HTMLPreElement>("#smoke-output");
  output.textContent = "running…";
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
  output.textContent = JSON.stringify(
    {
      pass: finite && distance > 1 && cameraUpWorks && cameraDownWorks,
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
});

requiredElement<HTMLButtonElement>("#composition-button").addEventListener("click", async () => {
  const output = requiredElement<HTMLPreElement>("#smoke-output");
  await resetPlaygroundWorld();
  const report = adapter.analyzeOpeningComposition();
  const mask = requiredElement<HTMLImageElement>("#composition-mask");
  mask.src = adapter.captureCompositionMask();
  mask.hidden = report === null;
  output.textContent = report === null
    ? "This scene has no opening composition guide."
    : JSON.stringify(report, null, 2);
  if (report?.pass) {
    try {
      const path = await adapter.exportOpeningFrame(report);
      output.textContent += `\nexported: ${path}`;
    } catch (error) {
      output.textContent += `\nexport failed: ${error instanceof Error ? error.message : String(error)}`;
    }
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
    runtimeFlightRecorder?.dispose();
    virtualFeatureList.dispose();
    canvasRecorder.dispose();
    recordingWorkbench?.dispose();
    if (disposeBrowserRuntime === undefined) adapter.dispose();
    else await disposeBrowserRuntime();
  },
});
}
