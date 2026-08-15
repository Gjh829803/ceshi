import "./style.css";
import { SdkWorldAdapter } from "./sdk-world-adapter.js";
import type {
  FeatureInspection,
  PlaygroundAutomationApi,
  WorldSnapshot,
} from "./playground-world.js";
import { resolveScene } from "./scenes/index.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("Missing #app container");

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
            <div class="hud-card hud-wide"><span>PLAYER</span><strong id="player-position">0.0 / 0.0 / 0.0</strong></div>
            <div class="hud-card"><span>ACTION</span><strong id="player-action">IDLE</strong></div>
          </div>
          <div class="controls-card">
            <p>移动控制</p>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span></div>
            <div><kbd>⇧</kbd><span>奔跑</span><kbd>空格</kbd><span>跳跃</span></div>
            <div><kbd>↑</kbd><kbd>↓</kbd><span>上下移动视角</span></div>
            <div><span class="mouse-icon">↖</span><span>拖拽镜头</span></div>
            <div><span class="wheel-icon">↕</span><span>滚轮缩放</span></div>
          </div>
          <button class="pause-button" id="pause-button" type="button" aria-label="暂停模拟">Ⅱ</button>
        </div>
        <footer class="viewport-footer">
          <span><i class="dot terrain"></i> Terrain mesh</span>
          <span><i class="dot surface"></i> Water surface</span>
          <span><i class="dot collider"></i> Collider contract</span>
          <span class="footer-note">Core · Rapier · SubjectKit · FeatureRegistry</span>
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
      </aside>
    </section>
  </main>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const viewport = requiredElement<HTMLDivElement>("#viewport");
const featureList = requiredElement<HTMLDivElement>("#feature-list");
const inspection = requiredElement<HTMLDivElement>("#inspection");
const adapter = await SdkWorldAdapter.create(resolveScene(window.location.search));
adapter.mount(viewport);
requiredElement("#adapter-name").textContent = adapter.name;

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateHud(snapshot: WorldSnapshot): void {
  requiredElement("#fps").textContent = String(snapshot.performance.fps || "—");
  requiredElement("#tick").textContent = String(snapshot.tick);
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

window.addEventListener("beforeunload", () => adapter.dispose());
