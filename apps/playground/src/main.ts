import "./style.css";

import { CanvasRecorder } from "./canvas-recorder.js";
import type {
  FeatureInspection,
  PlaygroundAutomationApi,
  PlaygroundWorldAdapter,
  WorldSnapshot,
} from "./playground-world.js";
import type { BabylonWorldAdapter } from "./babylon-world-adapter.js";
import type { WorldkitBrowserApiV3 } from "@whitebox-world/runtime-contracts";
import { createFetchSubjectAssetResolver, PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1 } from "./worldkit-asset-resolver.js";
import { installDeferredWorldkitBrowserApi } from "./worldkit-browser-api.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("Missing #app container");
const urlParameters = new URLSearchParams(window.location.search);
const authoringMode = urlParameters.get("authoring") === "1";

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
          </div>
          <div class="controls-card" id="controls-card">
            <p>移动控制</p>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span></div>
            <div><kbd>⇧</kbd><span>奔跑</span><kbd>空格</kbd><span>跳跃</span></div>
            ${authoringMode
              ? '<div><span>右侧 Camera Preference</span><span>切换镜头</span></div>'
              : '<div><kbd>↑</kbd><kbd>↓</kbd><span>上下移动视角</span></div><div><span class="mouse-icon">↖</span><span>拖拽镜头</span></div><div><span class="wheel-icon">↕</span><span>滚轮缩放</span></div>'}
          </div>
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
            <button id="fallback-button" type="button">注入 Safe Fallback</button>
            <button id="harness-button" type="button">运行 H01–H09</button>
            <button id="export-package-button" type="button">导出配置 JSON</button>
          </div>
          <pre id="harness-output">ready</pre>
        </div>
      </aside>
    </section>
  </main>
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
  api: WorldkitBrowserApiV3,
): { diagnostics: ReturnType<WorldkitBrowserApiV3["getDiagnostics"]>; developer: AuthoringStartupDebugV1 | null } {
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

function installAuthoringRecoveryPanel(api: WorldkitBrowserApiV3): void {
  const definitions = api.listSubjectDefinitions?.() ?? [];
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
    option.textContent = `${definition.displayName} · ${definition.agentAccessLevel}`;
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

function installCapabilityAuthoringPanel(api: WorldkitBrowserApiV3): void {
  const definitions = api.listSubjectDefinitions?.() ?? [];
  if (definitions.length === 0) return;
  const panel = requiredElement<HTMLDivElement>("#capability-card");
  panel.hidden = false;
  const packageSelect = requiredElement<HTMLSelectElement>("#subject-package-select");
  const cameraSelect = requiredElement<HTMLSelectElement>("#camera-preference-select");
  const context = requiredElement<HTMLDivElement>("#capability-context");
  const drafts = requiredElement<HTMLDivElement>("#parameter-drafts");
  const harnessOutput = requiredElement<HTMLPreElement>("#harness-output");
  const snapshot = api.getSnapshot();
  const activeSubject = snapshot.subjectStatesByEntityId[snapshot.controlledEntityId];
  const requestedDefinitionRef = urlParameters.get("subjectDefinitionRef");
  const activeDefinitionRef = requestedDefinitionRef ?? activeSubject?.subjectDefinitionRef ??
    definitions[0]!.resourceRef;
  packageSelect.replaceChildren(...definitions.map((definition) => {
    const option = document.createElement("option");
    option.value = definition.resourceRef;
    option.textContent = `${definition.displayName} · ${definition.agentAccessLevel}`;
    option.selected = definition.resourceRef === activeDefinitionRef;
    return option;
  }));

  const definition = definitions.find((row) => row.resourceRef === packageSelect.value) ??
    definitions[0]!;
  const activeKernel = api.listMotionKernels?.().find(
    (kernel) => kernel.resourceRef === activeSubject?.activeMotionKernelRef,
  );
  const controls = requiredElement<HTMLDivElement>("#controls-card");
  controls.innerHTML = activeKernel?.commandKind === "throttle-steer"
    ? `
        <p>油门 / 转向</p>
        <div><kbd>W</kbd><kbd>S</kbd><span>前进 / 倒退</span></div>
        <div><kbd>A</kbd><kbd>D</kbd><span>左转 / 右转</span></div>
        <div><span>右侧 Camera Preference</span><span>切换镜头</span></div>
      `
    : activeKernel?.commandKind === "flight-attitude"
      ? `
          <p>飞行姿态</p>
          <div><kbd>W</kbd><kbd>S</kbd><span>俯仰</span></div>
          <div><kbd>A</kbd><kbd>D</kbd><span>偏航 / 倾斜</span></div>
          <div><span>右侧 Camera Preference</span><span>切换镜头</span></div>
        `
      : `
          <p>平面移动</p>
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span></div>
          <div><kbd>⇧</kbd><span>奔跑</span><kbd>空格</kbd><span>跳跃</span></div>
          <div><span>右侧 Camera Preference</span><span>切换镜头</span></div>
        `;
  const profiles = api.listCompatibleProfiles?.(definition.resourceRef) ?? [];
  const motionProfiles = profiles.filter((row) => row.kind === "motion-profile");
  const cameraProfiles = profiles.filter((row) => row.kind === "camera-rig-profile");
  cameraSelect.replaceChildren(
    ...[
      ["auto", "Auto · Context Policy"],
      ["first-person", "First Person"],
      ...cameraProfiles.map((row) => [row.resourceRef, row.displayName]),
    ].map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value!;
      option.textContent = label!;
      return option;
    }),
  );
  const storedCameraPreference = readLocalDraft("worldkit.camera-preference");
  if (
    storedCameraPreference !== null &&
    [...cameraSelect.options].some((option) => option.value === storedCameraPreference)
  ) {
    cameraSelect.value = storedCameraPreference;
    try {
      api.setCameraPreference?.(storedCameraPreference);
    } catch {
      cameraSelect.value = "auto";
    }
  }
  context.innerHTML = `
    <div><span>Kernel</span><code>${escapeHtml(activeSubject?.activeMotionKernelRef ?? definition.defaultMotionProfileRef)}</code></div>
    <div><span>Control</span><code>${escapeHtml(definition.controlProfileRef)}</code></div>
    <div><span>Camera</span><code>${escapeHtml(snapshot.camera.activeCameraProfileRef ?? definition.cameraContextProfileRef)}</code></div>
    <div><span>Medium</span><code>${escapeHtml(activeSubject?.movementMedium ?? "ground")}</code></div>
  `;

  const parameterDraft: Record<string, number | boolean> = {};
  const defaultMotion = motionProfiles.find((row) => row.role === "default");
  if (defaultMotion?.safetyLimits !== undefined) {
    const draftStorageKey = `worldkit.motion-draft.${definition.resourceRef}`;
    let storedDraft: Readonly<Record<string, unknown>> = {};
    try {
      const rawDraft = readLocalDraft(draftStorageKey);
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
    for (const [name, limit] of Object.entries(defaultMotion.safetyLimits)) {
      const value = defaultMotion.parameters?.[name];
      if (typeof value !== "number" || limit.minimum === limit.maximum) continue;
      const storedValue = storedDraft[name];
      const draftValue = typeof storedValue === "number" &&
          Number.isFinite(storedValue) &&
          storedValue >= limit.minimum &&
          storedValue <= limit.maximum
        ? storedValue
        : value;
      parameterDraft[name] = draftValue;
      const label = document.createElement("label");
      const valueOutput = document.createElement("output");
      valueOutput.textContent = String(draftValue);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(limit.minimum);
      input.max = String(limit.maximum);
      input.step = String(Math.max(0.01, (limit.maximum - limit.minimum) / 100));
      input.value = String(draftValue);
      input.addEventListener("input", () => {
        parameterDraft[name] = Number(input.value);
        valueOutput.textContent = Number(input.value).toFixed(2);
        writeLocalDraft(draftStorageKey, JSON.stringify(parameterDraft));
      });
      const header = document.createElement("span");
      header.textContent = name;
      label.append(header, input, valueOutput);
      drafts.append(label);
    }
  }

  packageSelect.addEventListener("change", () => {
    navigateToSubjectPackage(packageSelect.value);
  });
  cameraSelect.addEventListener("change", () => {
    try {
      api.setCameraPreference?.(cameraSelect.value);
      writeLocalDraft("worldkit.camera-preference", cameraSelect.value);
    } catch {
      harnessOutput.textContent = authoringActionFailure();
    }
  });
  requiredElement<HTMLButtonElement>("#fallback-button").addEventListener("click", async () => {
    const fallback = motionProfiles.find((row) => row.role === "fallback");
    if (fallback === undefined || api.setMotionProfile === undefined) return;
    try {
      const after = await api.setMotionProfile(snapshot.controlledEntityId, fallback.resourceRef);
      harnessOutput.textContent = JSON.stringify(
        after.subjectStatesByEntityId[snapshot.controlledEntityId],
        null,
        2,
      );
    } catch {
      harnessOutput.textContent = authoringActionFailure();
    }
  });
  requiredElement<HTMLButtonElement>("#harness-button").addEventListener("click", async () => {
    if (api.runHarness === undefined) return;
    harnessOutput.textContent = "running…";
    try {
      harnessOutput.textContent = JSON.stringify(
        await api.runHarness(snapshot.controlledEntityId),
        null,
        2,
      );
    } catch {
      harnessOutput.textContent = authoringActionFailure();
    }
  });
  requiredElement<HTMLButtonElement>("#export-package-button").addEventListener("click", () => {
    const payload = {
      schemaVersion: 1,
      subjectDefinition: definition,
      compatibleProfiles: profiles,
      motionParameterDraft: parameterDraft,
      resourceLockRequired: true,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${definition.semanticClassId.replaceAll(".", "-")}.worldkit-package.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  });
}

if (authoringMode) {
  let createdAdapter: BabylonWorldAdapter | null = null;
  const browserInstallation = installDeferredWorldkitBrowserApi({
    target: window,
    statusElement: document.documentElement,
    initialize: async ({ trackAdapter }) => {
      let startupStage = "host-resolver";
      try {
        const subjectAssetResolver = createFetchSubjectAssetResolver(
          PLAYGROUND_CAPABILITY_SUBJECT_ASSET_URI_BY_REF_V1,
        );
        startupStage = "module-import";
        const [{ loadAuthoringScene }, { BabylonWorldAdapter }] = await Promise.all([
          import("./authoring-loader.js"),
          import("./babylon-world-adapter.js"),
        ]);
        startupStage = "authoring-load";
        const loaded = await loadAuthoringScene(undefined, {
          ...(urlParameters.get("subjectDefinitionRef") === null
            ? {}
            : { subjectDefinitionRef: urlParameters.get("subjectDefinitionRef")! }),
        });
        if (!loaded.ok || loaded.executionPlan === undefined) {
          inspection.innerHTML = `<pre>${escapeHtml(JSON.stringify(loaded.diagnostics, null, 2))}</pre>`;
          throw new Error("WORLDKIT_AUTHORING_LOAD_FAILED");
        }
        startupStage = "runtime-create";
        const adapter = await BabylonWorldAdapter.create(loaded.executionPlan, {
          subjectAssetResolver,
          onInitializationStage(stage) {
            startupStage = `runtime:${stage}`;
          },
        });
        createdAdapter = adapter;
        trackAdapter(adapter);
        startupStage = "adapter-mount";
        adapter.mount(viewport);
        startupStage = "first-render";
        adapter.render();
        return adapter;
      } catch (error) {
        captureAuthoringStartupFailure(startupStage, error);
        throw error;
      }
    },
  });
  const initialized = await browserInstallation.initialization;
  if (initialized !== undefined && createdAdapter !== null) {
    installCapabilityAuthoringPanel(browserInstallation.api);
    startPlayground(createdAdapter, () => browserInstallation.dispose());
  } else {
    inspection.innerHTML = `<pre>${escapeHtml(JSON.stringify(authoringStartupEvidence(browserInstallation.api), null, 2))}</pre>`;
    installAuthoringRecoveryPanel(browserInstallation.api);
  }
} else {
  const [{ SdkWorldAdapter }, { resolveScene }] = await Promise.all([
    import("./sdk-world-adapter.js"),
    import("./scenes/index.js"),
  ]);
  const adapter = await SdkWorldAdapter.create(resolveScene(window.location.search));
  adapter.mount(viewport);
  startPlayground(adapter);
}

function startPlayground(
  adapter: PlaygroundWorldAdapter,
  disposeBrowserRuntime?: () => Promise<void>,
): void {
requiredElement("#adapter-name").textContent = adapter.name;
const canvasRecorder = new CanvasRecorder(adapter.canvas);
let recordingTimer: number | null = null;

let selectedFeatureId: string | null = null;

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function resourceTotal(feature: FeatureInspection): number {
  return feature.resources.reduce((sum, resource) => sum + (resource.vertices ?? 0), 0);
}

function renderFeatureList(features: readonly FeatureInspection[]): void {
  requiredElement("#feature-count").textContent = `${features.length} FEATURES`;
  featureList.replaceChildren(
    ...features.map((feature) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `feature-item${selectedFeatureId === feature.id ? " selected" : ""}`;
      button.dataset.featureId = feature.id;
      button.innerHTML = `
        <span class="feature-icon ${feature.resources[0]?.kind ?? "mesh"}"></span>
        <span><strong>${feature.id}</strong><small>${feature.type} · v${feature.version}</small></span>
        <em>${feature.status}</em>
      `;
      button.addEventListener("click", () => selectFeature(feature.id));
      return button;
    }),
  );
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
  reset: () => {
    adapter.reset();
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

requiredElement<HTMLButtonElement>("#reset-button").addEventListener("click", () => {
  adapter.reset();
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

function showRecordingSaved(filename: string, blob: Blob, durationMs: number): void {
  const toast = requiredElement<HTMLDivElement>("#recording-toast");
  const megabytes = blob.size / 1_000_000;
  toast.textContent = `已保存 ${formatRecordingTime(durationMs)} · ${megabytes.toFixed(1)} MB · ${filename}`;
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
    const filename = downloadRecording(result.blob, result.extension);
    showRecordingSaved(filename, result.blob, result.durationMs);
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
  adapter.reset();
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
      cameraUp: cameraUpWorks,
      cameraDown: cameraDownWorks,
    },
    null,
    2,
  );
});

requiredElement<HTMLButtonElement>("#composition-button").addEventListener("click", async () => {
  const output = requiredElement<HTMLPreElement>("#smoke-output");
  adapter.reset();
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
    adapter.reset();
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

window.addEventListener("beforeunload", () => {
  if (recordingTimer !== null) window.clearInterval(recordingTimer);
  canvasRecorder.dispose();
  if (disposeBrowserRuntime === undefined) adapter.dispose();
  else void disposeBrowserRuntime();
});
}
