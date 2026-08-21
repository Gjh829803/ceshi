import "./style.css";

import { CanvasRecorder } from "./canvas-recorder.js";
import type {
  FeatureInspection,
  PlaygroundAutomationApi,
  PlaygroundWorldAdapter,
  WorldSnapshot,
} from "./playground-world.js";
import type { BabylonWorldAdapter } from "./babylon-world-adapter.js";
import type { CapabilityDemoHostOverlayV1 } from "./authoring-loader.js";
import { withCapabilityDemoHostOverlay } from "./authoring-export.js";
import type {
  CameraTuningV1,
  CompatibleProfileSummaryV1,
  MotionKernelSummaryV1,
  SemanticInputActionV1,
  SubjectDefinitionSummaryV1,
  WorldkitBrowserApiV3,
} from "@whitebox-world/runtime-contracts";
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
            <button class="capability-open-button" id="open-tuning-panel-button" type="button">打开大尺寸调控台</button>
            <button id="fallback-button" type="button">注入 Safe Fallback</button>
            <button id="harness-button" type="button">运行 H01–H09</button>
            <button id="export-package-button" type="button">导出配置 JSON</button>
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
          <a href="#tuning-camera">相机</a>
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
            <div class="tuning-section-heading"><span>03</span><div><h3>调整运动手感</h3><p>滑杆使用策划推荐范围，并明确标出“即时生效”或“仅草稿、待接入”。</p></div></div>
            <div class="friendly-slider-grid" id="tuning-motion-sliders"></div>
          </section>
          <section class="tuning-section" id="tuning-camera">
            <div class="tuning-section-heading"><span>04</span><div><h3>选择并微调相机</h3><p>5 类基础镜头跨主体复用；水面、乘坐、倒车、冲刺和瞄准作为自动叠加的行为修饰，不再重复造镜头。</p></div></div>
            <div class="camera-instructions"><span>鼠标左键拖动</span>旋转 <span>滚轮</span>缩放 <span>R</span>回正 <span>C</span>回头看 <span>V</span>换肩 <button id="reset-camera-view-button" type="button">镜头回正</button></div>
            <div class="camera-card-grid" id="tuning-camera-cards"></div>
            <div class="friendly-slider-grid camera-tuning-grid" id="tuning-camera-sliders"></div>
          </section>
          <section class="tuning-section" id="tuning-delivery">
            <div class="tuning-section-heading"><span>05</span><div><h3>检查并导出</h3><p>先跑一次自动检查，再把主体、运动草稿、输入说明和相机配置一起导出。</p></div></div>
            <div class="delivery-actions">
              <button id="tuning-harness-button" type="button">运行自动检查</button>
              <button class="primary" id="tuning-export-button" type="button">导出配置 JSON</button>
            </div>
            <pre class="friendly-result" id="tuning-result">尚未运行检查</pre>
          </section>
        </div>
        <footer class="tuning-footer"><span id="tuning-save-status">更改会自动保存在本机草稿中</span><button id="tuning-export-footer-button" type="button">导出当前配置</button></footer>
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
  "worldkit://camera-profile/first-person.standard@1": ["标准第一人称", "从角色视点观察，适合沉浸和近距离检查"],
  "worldkit://camera-profile/orbit.medium@1": ["自由环绕", "通用第三人称，可拖动查看主体四周"],
  "worldkit://camera-profile/follow.medium@1": ["稳定跟随", "跟在主体后方，转向变化更柔和"],
  "worldkit://camera-profile/chase.surface-fast@1": ["高速追逐", "速度越高看得越远，适合载具和滑行"],
  "worldkit://camera-profile/follow.water-surface@1": ["水面跟随", "变化较慢，尽量保留水面与地平线"],
  "worldkit://camera-profile/flight.glide@1": ["滑翔视角", "保持地平线稳定，同时预看飞行方向"],
  "worldkit://camera-profile/follow.mounted@1": ["乘坐跟随", "面向骑乘、驾驶和座位组合的中距离镜头"],
};

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
  cameraProfiles: readonly CompatibleProfileSummaryV1[];
  parameterDraft: Record<string, number | boolean>;
  motionDraftStorageKey: string;
  controlledEntityId: string;
  initialCameraPreference: string;
  hostOverlay?: CapabilityDemoHostOverlayV1;
}

function installTuningWorkbench(
  api: WorldkitBrowserApiV3,
  workbenchContext: TuningWorkbenchContextV1,
): void {
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
  const currentSubject = api.getSubjectSnapshot?.(workbenchContext.controlledEntityId);
  summary.innerHTML = `
    <div><span>现在调的是</span><strong>${escapeHtml(subjectFriendlyName(workbenchContext.definition))}</strong></div>
    <div><span>移动方式</span><strong>${escapeHtml(kernelFriendlyName(workbenchContext.activeKernel))}</strong></div>
    <div><span>所在环境</span><strong>${currentSubject?.movementMedium === "water" ? "水面" : currentSubject?.movementMedium === "air" ? "空中" : "地面"}</strong></div>
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
        const state = after.subjectStatesByEntityId[after.controlledEntityId];
        inputStatus.textContent = `“${item.title}”已执行 · 当前动作：${state?.activeActionId ?? "已提交"}`;
      } catch {
        inputStatus.textContent = `“${item.title}”没有成功执行，世界状态已保留。`;
      }
    });
    return card;
  }));

  const motionSliderGrid = requiredElement<HTMLDivElement>("#tuning-motion-sliders");
  const defaultMotion = workbenchContext.motionProfiles.find((row) => row.role === "default");
  const liveMotionParameterNames = new Set(defaultMotion?.runtimeParameterNames ?? []);
  const applyMotionTuning = (): void => {
    const numericTuning = Object.fromEntries(
      Object.entries(workbenchContext.parameterDraft).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && liveMotionParameterNames.has(entry[0]),
      ),
    );
    try {
      api.setMotionTuning?.(workbenchContext.controlledEntityId, numericTuning);
      saveStatus.textContent = "运动手感已应用到当前主体，并保存到本机草稿";
    } catch {
      saveStatus.textContent = "运动参数未能应用，当前主体仍使用上一组稳定配置";
    }
  };
  if (defaultMotion?.safetyLimits === undefined) {
    motionSliderGrid.innerHTML = '<p class="friendly-empty">当前主体没有开放可调的运动参数。</p>';
  } else {
    motionSliderGrid.replaceChildren(...Object.entries(defaultMotion.safetyLimits).flatMap(([name, safetyLimit]) => {
      const value = workbenchContext.parameterDraft[name];
      const range = defaultMotion.authoringRanges?.[name] ?? {
        ...safetyLimit,
        step: Math.max(0.01, (safetyLimit.maximum - safetyLimit.minimum) / 100),
      };
      if (typeof value !== "number" || range.minimum === range.maximum) return [];
      const runtimeSupported = liveMotionParameterNames.has(name);
      const [labelText, helpText] = FRIENDLY_MOTION_PARAMETERS[name] ?? [name, "安全范围内的运动参数"];
      const label = document.createElement("label");
      label.className = "friendly-slider";
      label.innerHTML = `<span><strong>${escapeHtml(labelText)} · ${runtimeSupported ? "即时生效" : "仅草稿"}</strong><small>${escapeHtml(helpText)}${runtimeSupported ? "" : "；当前 Runtime 尚未接入"}</small></span>`;
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
        writeLocalDraft(
          workbenchContext.motionDraftStorageKey,
          JSON.stringify(workbenchContext.parameterDraft),
        );
        if (runtimeSupported) {
          applyMotionTuning();
          saveStatus.textContent = `“${labelText}”已应用到当前主体，并保存到本机草稿`;
        } else {
          saveStatus.textContent = `“${labelText}”只保存为草稿，当前 Runtime 尚未接入`;
        }
      });
      control.append(input, output);
      label.append(control);
      return [label];
    }));
    applyMotionTuning();
  }

  const cameraCards = requiredElement<HTMLDivElement>("#tuning-camera-cards");
  const cameraSliders = requiredElement<HTMLDivElement>("#tuning-camera-sliders");
  const cameraRows = workbenchContext.cameraProfiles;
  let cameraPreference = workbenchContext.initialCameraPreference === "first-person"
    ? cameraRows.find((row) => row.resourceRef.includes("first-person"))?.resourceRef ?? "auto"
    : workbenchContext.initialCameraPreference;
  let cameraTuning: CameraTuningV1 = {};

  const applyCameraTuning = (): void => {
    try {
      api.setCameraTuning?.(cameraTuning);
      saveStatus.textContent = "相机微调已应用到当前预览，并自动保存";
    } catch {
      saveStatus.textContent = "相机微调未能应用，原镜头设置已保留";
    }
  };

  const renderCameraSliders = (): void => {
    const activeProfileRef = cameraPreference === "auto"
      ? api.getCameraSnapshot?.().activeCameraProfileRef
      : cameraPreference;
    const profile = cameraRows.find((row) => row.resourceRef === activeProfileRef) ?? cameraRows[0];
    const base = profile?.parameters ?? {};
    const storageKey = `worldkit.camera-tuning.v4.${workbenchContext.definition.resourceRef}.${profile?.resourceRef ?? "auto"}.${profile?.contentHash ?? "unlocked"}`;
    try {
      const stored = readLocalDraft(storageKey);
      cameraTuning = stored === null ? {} : JSON.parse(stored) as CameraTuningV1;
    } catch {
      cameraTuning = {};
    }
    const settings: Array<{
      key: keyof CameraTuningV1;
      label: string;
      help: string;
      minimum: number;
      maximum: number;
      step: number;
      fallback: number;
    }> = [
      { key: "distanceMeters", label: "跟随距离", help: "镜头离主体有多远", minimum: 0, maximum: 16, step: 0.1, fallback: Number(base.distanceMeters ?? 5) },
      { key: "targetHeightMeters", label: "观察高度", help: "镜头对准主体的高度", minimum: 0, maximum: 4, step: 0.05, fallback: Number(base.targetHeightMeters ?? 1.2) },
      { key: "shoulderOffsetMeters", label: "肩部偏移", help: "让镜头从主体左侧或右侧观察", minimum: -2, maximum: 2, step: 0.05, fallback: Number(base.shoulderOffsetMeters ?? 0) },
      { key: "pitchRadians", label: "镜头俯仰角", help: "调整镜头从上方或下方观察的角度", minimum: -1.2, maximum: 1.2, step: 0.01, fallback: Number(base.pitchRadians ?? 0.25) },
      { key: "horizontalPositionDampingPerSecond", label: "水平跟随速度", help: "调低后主体会在画面左右/前后先行，调高后镜头更快追上", minimum: 0, maximum: 40, step: 0.1, fallback: Number(base.horizontalPositionDampingPerSecond ?? base.positionDampingPerSecond ?? 12) },
      { key: "verticalPositionDampingPerSecond", label: "垂直跟随速度", help: "单独控制跳跃、坡面和水面起伏时镜头上下跟随的快慢", minimum: 0, maximum: 40, step: 0.1, fallback: Number(base.verticalPositionDampingPerSecond ?? base.positionDampingPerSecond ?? 12) },
      { key: "maximumPositionLagMeters", label: "主体最多领先镜头的距离", help: "限制主体最多能冲到镜头前方多远；设为 0 时镜头位置紧跟", minimum: 0, maximum: 30, step: 0.1, fallback: Number(base.maximumPositionLagMeters ?? 4) },
      { key: "yawDampingPerSecond", label: "水平旋转跟随", help: "越高越快跟上主体转向，越低越有电影感", minimum: 0, maximum: 40, step: 0.1, fallback: Number(base.yawDampingPerSecond ?? base.rotationDampingPerSecond ?? 14) },
      { key: "pitchDampingPerSecond", label: "俯仰旋转跟随", help: "单独控制镜头上下抬落的平滑速度", minimum: 0, maximum: 40, step: 0.1, fallback: Number(base.pitchDampingPerSecond ?? base.rotationDampingPerSecond ?? 14) },
      { key: "lookSensitivityXRatio", label: "水平拖动灵敏度", help: "鼠标左右拖动的响应倍率", minimum: 0.1, maximum: 3, step: 0.05, fallback: Number(base.lookSensitivityXRatio ?? 1) },
      { key: "lookSensitivityYRatio", label: "垂直拖动灵敏度", help: "鼠标上下拖动的响应倍率", minimum: 0.1, maximum: 3, step: 0.05, fallback: Number(base.lookSensitivityYRatio ?? 1) },
      { key: "collisionRadiusMeters", label: "碰撞保护距离", help: "镜头接近墙面时保留的安全距离", minimum: 0.05, maximum: 1, step: 0.01, fallback: Number(base.collisionRadiusMeters ?? 0.25) },
      { key: "collisionRetractionMetersPerSecond", label: "遇墙缩近速度", help: "遮挡出现时镜头向主体收回的速度", minimum: 0, maximum: 60, step: 0.25, fallback: Number(base.collisionRetractionMetersPerSecond ?? 30) },
      { key: "collisionRecoveryMetersPerSecond", label: "离墙恢复速度", help: "遮挡消失后镜头慢慢回到原距离的速度", minimum: 0, maximum: 30, step: 0.25, fallback: Number(base.collisionRecoveryMetersPerSecond ?? 5) },
      { key: "lookAheadSeconds", label: "启动时镜头向前带", help: "主体移动时焦点沿前进方向预看；设为 0 完全关闭", minimum: 0, maximum: 2, step: 0.01, fallback: Number(base.lookAheadSeconds ?? 0.2) },
      { key: "accelerationLookAheadSecondsSquared", label: "加速预判", help: "急加速和急转时根据加速度额外预看；设为 0 关闭", minimum: 0, maximum: 1, step: 0.01, fallback: Number(base.accelerationLookAheadSecondsSquared ?? 0) },
      { key: "minimumHeadingSpeedMetersPerSecond", label: "速度镜头起效门槛", help: "低于该速度时保持最后稳定方向，避免停车或低速抖动", minimum: 0, maximum: 20, step: 0.1, fallback: Number(base.minimumHeadingSpeedMetersPerSecond ?? 0.5) },
      { key: "velocityHeadingDampingPerSecond", label: "追逐方向跟随速度", help: "速度方向改变后镜头旋转跟上的快慢", minimum: 0, maximum: 40, step: 0.25, fallback: Number(base.velocityHeadingDampingPerSecond ?? 10) },
      { key: "transitionSeconds", label: "镜头切换时间", help: "切换预制时连续过渡所用的时间", minimum: 0, maximum: 3, step: 0.05, fallback: Number(base.transitionSeconds ?? 0.35) },
      { key: "baseFovDegrees", label: "视野宽度", help: "越大看到的范围越广", minimum: 35, maximum: 100, step: 0.5, fallback: Number(base.baseFovDegrees ?? 60) },
      { key: "speedFovDegreesPerMeterPerSecond", label: "加速时视野变宽", help: "速度越快画面越有冲刺感；设为 0 完全关闭", minimum: 0, maximum: 5, step: 0.05, fallback: Number(base.speedFovDegreesPerMeterPerSecond ?? 0) },
      { key: "maximumSpeedFovDegrees", label: "冲刺视野上限", help: "限制高速时最多额外增加多少视野", minimum: 0, maximum: 30, step: 0.5, fallback: Number(base.maximumSpeedFovDegrees ?? 0) },
      { key: "fovDampingPerSecond", label: "视野变化平滑", help: "速度变化时视野宽度跟上的快慢", minimum: 0, maximum: 30, step: 0.25, fallback: Number(base.fovDampingPerSecond ?? 8) },
      { key: "horizontalDeadZoneRatio", label: "画面水平容忍区", help: "主体在画面中心附近移动时允许镜头暂不跟随；设为 0 关闭", minimum: 0, maximum: 0.4, step: 0.01, fallback: Number(base.horizontalDeadZoneRatio ?? 0) },
      { key: "verticalDeadZoneRatio", label: "画面垂直容忍区", help: "跳跃或起伏在小范围内时允许镜头保持稳定；设为 0 关闭", minimum: 0, maximum: 0.4, step: 0.01, fallback: Number(base.verticalDeadZoneRatio ?? 0) },
      { key: "recenterDelaySeconds", label: "自动回正等待", help: "停止手动拖动后等待多久才开始自动回正", minimum: 0, maximum: 5, step: 0.05, fallback: Number(base.recenterDelaySeconds ?? 1.2) },
      { key: "recenterDurationSeconds", label: "自动回正时长", help: "镜头回到基础方向所需的柔和时间；设为 0 立即回正", minimum: 0, maximum: 5, step: 0.05, fallback: Number(base.recenterDurationSeconds ?? 0.8) },
      { key: "recenterMinimumSpeedMetersPerSecond", label: "触发回正的最低速度", help: "低于这个速度时不因前进自动回正，避免原地镜头摆动", minimum: 0, maximum: 10, step: 0.1, fallback: Number(base.recenterMinimumSpeedMetersPerSecond ?? 0.8) },
      { key: "teleportSnapDistanceMeters", label: "瞬移识别距离", help: "主体一帧跨过该距离时镜头直接同步，避免从远处慢慢追", minimum: 1, maximum: 100, step: 1, fallback: Number(base.teleportSnapDistanceMeters ?? 20) },
    ];
    cameraSliders.replaceChildren(...settings.flatMap((setting) => {
      const range = profile?.authoringRanges?.[setting.key];
      if (range === undefined) return [];
      const value = cameraTuning[setting.key] ?? setting.fallback;
      cameraTuning[setting.key] = value;
      const label = document.createElement("label");
      label.className = "friendly-slider";
      label.innerHTML = `<span><strong>${setting.label}</strong><small>${setting.help}</small></span>`;
      const control = document.createElement("div");
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(range.minimum ?? setting.minimum);
      input.max = String(range.maximum ?? setting.maximum);
      input.step = String(range.step ?? setting.step);
      input.value = String(value);
      const output = document.createElement("output");
      output.textContent = Number(value).toFixed(2);
      input.addEventListener("input", () => {
        const nextValue = Number(input.value);
        cameraTuning[setting.key] = nextValue;
        output.textContent = nextValue.toFixed(2);
        writeLocalDraft(storageKey, JSON.stringify(cameraTuning));
        applyCameraTuning();
      });
      control.append(input, output);
      label.append(control);
      return [label];
    }));
    applyCameraTuning();
  };

  const refreshCameraCards = (): void => {
    cameraCards.replaceChildren(...[
      { resourceRef: "auto", displayName: "自动选择", description: "根据地面、水面、飞行、速度和关系自动选择合适镜头" },
      ...cameraRows.map((row) => {
        const friendly = FRIENDLY_CAMERA_PROFILES[row.resourceRef];
        const mode = row.baseMode === undefined ? "通用" : FRIENDLY_CAMERA_BASE_MODES[row.baseMode] ?? row.baseMode;
        return { resourceRef: row.resourceRef, displayName: friendly?.[0] ?? row.displayName, description: `${mode} · ${friendly?.[1] ?? "通用相机预制"}` };
      }),
    ].map((row) => {
      const card = document.createElement("article");
      if (row.resourceRef === cameraPreference) card.classList.add("selected");
      card.innerHTML = `<div><strong>${escapeHtml(row.displayName)}</strong><p>${escapeHtml(row.description)}</p></div><button type="button">${row.resourceRef === cameraPreference ? "当前正在使用" : "应用并预览"}</button>`;
      const button = card.querySelector("button")!;
      button.disabled = row.resourceRef === cameraPreference;
      button.addEventListener("click", () => {
        try {
          api.setCameraPreference?.(row.resourceRef);
          cameraPreference = row.resourceRef;
          writeLocalDraft("worldkit.camera-preference", row.resourceRef);
          refreshCameraCards();
          renderCameraSliders();
          saveStatus.textContent = `已应用“${row.displayName}”，现在可以在左侧拖动体验`;
        } catch {
          saveStatus.textContent = `“${row.displayName}”未能应用，原镜头已保留`;
        }
      });
      return card;
    }));
  };
  refreshCameraCards();
  renderCameraSliders();
  requiredElement<HTMLButtonElement>("#reset-camera-view-button").addEventListener("click", () => {
    try {
      api.resetCameraView?.();
      saveStatus.textContent = "镜头已回到主体后方";
    } catch {
      saveStatus.textContent = "镜头暂时无法回正，当前状态已保留";
    }
  });

  const result = requiredElement<HTMLPreElement>("#tuning-result");
  const relationshipPreviewOnly = workbenchContext.hostOverlay?.changes.some(
    (change) => change.type === "relationship-capabilities-deferred",
  ) === true;
  const runHarness = async (): Promise<void> => {
    if (api.runHarness === undefined) return;
    result.textContent = "正在检查操作、物理、相机、清理和安全回退…";
    try {
      const report = await api.runHarness(workbenchContext.controlledEntityId);
      const passed = report.checks.filter((check) => check.status === "passed").length;
      const failed = report.checks.filter((check) => check.status === "failed");
      result.textContent = failed.length === 0
        ? relationshipPreviewOnly
          ? `检查完成：${passed}/9 项通过。运动和相机预览可以导出；Seat、Tether 或 Mount 关系尚未参与本次验收，导出文件会保留暂缓说明。`
          : `检查完成：${passed}/9 项通过，可以导出。`
        : `检查完成：${passed}/9 项通过。需要关注：${failed.map((check) => check.checkId).join("、")}`;
    } catch {
      result.textContent = "自动检查没有完成，世界状态未被修改。";
    }
  };
  requiredElement<HTMLButtonElement>("#tuning-harness-button").addEventListener("click", () => void runHarness());

  const exportCurrent = (): void => {
    const payload = withCapabilityDemoHostOverlay({
      schemaVersion: 4,
      subjectDefinition: workbenchContext.definition,
      selectedCameraPreference: cameraPreference,
      activeCameraModifiers: (api.getCameraSnapshot?.().activeCameraModifierRefs ?? []).map((resourceRef) => ({
        resourceRef,
        displayName: FRIENDLY_CAMERA_MODIFIERS[resourceRef] ?? resourceRef,
      })),
      cameraTuning,
      motionParameterDraft: workbenchContext.parameterDraft,
      motionParameterSupport: {
        runtimeParameterNames: defaultMotion?.runtimeParameterNames ?? [],
        draftOnlyParameterNames: defaultMotion?.draftOnlyParameterNames ?? [],
        authoringRanges: defaultMotion?.authoringRanges ?? {},
      },
      inputGuide: inputItems.map((item) => ({ key: item.keyLabel, action: item.title, meaning: item.explanation })),
      compatibleProfiles: [...workbenchContext.motionProfiles, ...workbenchContext.cameraProfiles],
      resourceLockRequired: true,
      note: "标记为即时生效的参数已在当前会话预览；仅草稿参数需接入 Runtime 后才能成为正式预制。",
    }, workbenchContext.hostOverlay);
    downloadJson(
      `${workbenchContext.definition.semanticClassId.replaceAll(".", "-")}.worldkit-authoring.json`,
      payload,
    );
    saveStatus.textContent = "配置 JSON 已导出";
  };
  for (const selector of ["#tuning-export-button", "#tuning-export-footer-button"]) {
    requiredElement<HTMLButtonElement>(selector).addEventListener("click", exportCurrent);
  }
}

function installAuthoringRecoveryPanel(api: WorldkitBrowserApiV3): void {
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

function installCapabilityAuthoringPanel(
  api: WorldkitBrowserApiV3,
  hostOverlay?: CapabilityDemoHostOverlayV1,
): void {
  const definitions = api.listSubjectDefinitions?.({ includeExperimental: true }) ?? [];
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
    option.textContent = `${definition.displayName} · ${definition.authoringAvailability}`;
    option.selected = definition.resourceRef === activeDefinitionRef;
    return option;
  }));

  const definition = definitions.find((row) => row.resourceRef === packageSelect.value) ??
    definitions[0]!;
  const activeKernel = api.listMotionKernels?.({
    includeExperimental: true,
    includeInternal: true,
  }).find(
    (kernel) => kernel.resourceRef === activeSubject?.activeMotionKernelRef,
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
  const profiles = api.listCompatibleProfiles?.(definition.resourceRef) ?? [];
  const motionProfiles = profiles.filter((row) => row.kind === "motion-profile");
  const cameraProfiles = profiles.filter((row) => row.kind === "camera-rig-profile");
  cameraSelect.replaceChildren(
    ...[
      ["auto", "自动选择合适镜头"],
      ["first-person", "第一人称"],
      ...cameraProfiles.map((row) => [row.resourceRef, FRIENDLY_CAMERA_PROFILES[row.resourceRef]?.[0] ?? row.displayName]),
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
    <div><span>当前主体</span><code>${escapeHtml(subjectFriendlyName(definition))}</code></div>
    <div><span>移动方式</span><code>${escapeHtml(kernelFriendlyName(activeKernel))}</code></div>
    <div><span>当前镜头</span><code>${escapeHtml(FRIENDLY_CAMERA_PROFILES[snapshot.camera.activeCameraProfileRef ?? ""]?.[0] ?? "自动")}</code></div>
    <div><span>自动镜头效果</span><code>${escapeHtml((snapshot.camera.activeCameraModifierRefs ?? []).map((resourceRef) => FRIENDLY_CAMERA_MODIFIERS[resourceRef] ?? resourceRef).join("、") || "无")}</code></div>
    ${hostOverlay?.changes.some((change) => change.type === "relationship-capabilities-deferred") === true
      ? "<div><span>关系能力</span><code>运动预览；Seat / Tether / Mount 暂缓</code></div>"
      : ""}
    <div><span>使用提示</span><code>打开大尺寸调控台</code></div>
  `;

  const parameterDraft: Record<string, number | boolean> = {};
  const defaultMotion = motionProfiles.find((row) => row.role === "default");
  const motionDraftStorageKey = `worldkit.motion-draft.v4.${definition.resourceRef}.${defaultMotion?.resourceRef ?? "none"}.${defaultMotion?.contentHash ?? "unlocked"}`;
  if (defaultMotion?.safetyLimits !== undefined) {
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
    for (const [name, safetyLimit] of Object.entries(defaultMotion.safetyLimits)) {
      const range = defaultMotion.authoringRanges?.[name] ?? {
        ...safetyLimit,
        step: Math.max(0.01, (safetyLimit.maximum - safetyLimit.minimum) / 100),
      };
      const value = defaultMotion.parameters?.[name];
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
  drafts.innerHTML = "<p>完整的运动手感滑杆、操作说明、5 类基础镜头和自动行为修饰器都已移到大尺寸调控台。</p>";

  installTuningWorkbench(api, {
    definitions,
    definition,
    activeKernel,
    motionProfiles,
    cameraProfiles,
    parameterDraft,
    motionDraftStorageKey,
    controlledEntityId: snapshot.controlledEntityId,
    initialCameraPreference: cameraSelect.value,
    ...(hostOverlay === undefined ? {} : { hostOverlay }),
  });

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
    const payload = withCapabilityDemoHostOverlay({
      schemaVersion: 4,
      subjectDefinition: definition,
      compatibleProfiles: profiles,
      motionParameterDraft: parameterDraft,
      resourceLockRequired: true,
    }, hostOverlay);
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
  let createdHostOverlay: CapabilityDemoHostOverlayV1 | undefined;
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
        createdHostOverlay = loaded.hostOverlay;
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
    installCapabilityAuthoringPanel(browserInstallation.api, createdHostOverlay);
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
