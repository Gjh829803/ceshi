const pipeline = [
  ["01 · Authoring", "Canonical Authoring V4", "AI 和工具提交的唯一当前世界输入。严格校验、关闭未知字段。"],
  ["02 · Normalize", "NormalizedWorldIR V4", "自包含的规范化世界模型，不把 Provider 对象带入公共协议。"],
  ["03 · Compile", "ExecutionPlan V5", "确定性编译结果与 Resource Lock，Runtime 不回读 Authoring 原文。"],
  ["04 · Execute", "RuntimeHost", "统一 Session、Command、Receipt、Event 与固定 Tick 生命周期。"],
  ["05 · Adapt", "Babylon.js + Havok", "渲染、角色控制与物理实现被限制在 Runtime Adapter 内部。"],
  ["06 · Observe", "Browser Protocol V5 / Snapshot V4", "CLI、Browser 与生成类型共享同一组公开字段和版本合同。"],
] as const;

const ownership = [
  ["规划", "World Planner", "完整 Scene Brief、WorldPrompt 与 Entity Catalog"],
  ["构建", "World Builder", "冻结计划之后的白模实现和稳定绑定"],
  ["运行", "SDK Runtime", "物理、相机、固定 Tick、资源所有权和协议投影"],
  ["风格", "Visual Bible", "已验证白模之后的样式参考与最终呈现"],
] as const;

export default function Home() {
  return (
    <main className="blueprint-shell">
      <header className="hero">
        <p className="eyebrow">CURRENT IMPLEMENTATION AUTHORITY · 2026-08-25</p>
        <h1>World SDK<span>可验证、可组合的白模世界运行底座</span></h1>
        <p className="hero-copy">
          规划与构建 Agent 创造世界，World SDK 维护从语义输入到可观察 Runtime
          的确定性规则与权威边界。
        </p>
      </header>

      <section className="section" aria-labelledby="pipeline-title">
        <div className="section-heading">
          <p>唯一当前链路</p>
          <h2 id="pipeline-title">从语义输入到可观察 Runtime</h2>
        </div>
        <ol className="pipeline">
          {pipeline.map(([label, title, detail]) => (
            <li key={title}><p>{label}</p><h3>{title}</h3><span>{detail}</span></li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="authority-title">
        <div className="section-heading">
          <p>职责不折叠</p>
          <h2 id="authority-title">一个事实，一个权威 Owner</h2>
        </div>
        <div className="ownership-grid">
          {ownership.map(([stage, owner, responsibility]) => (
            <article key={stage}><p>{stage}</p><h3>{owner}</h3><span>{responsibility}</span></article>
          ))}
        </div>
      </section>

      <section className="boundary" aria-labelledby="boundary-title">
        <div><p>当前生产边界</p><h2 id="boundary-title">户外高度场世界</h2></div>
        <p>
          当前支持确定性地形、静态障碍、水体、主体控制、Gameplay、Capture 与 Route
          Evidence。室内、车辆、NPC 行为、洞穴、悬挑和网络能力尚未作为生产能力开放。
        </p>
      </section>

      <footer>
        <span>Source of truth</span>
        <code>docs/00-project-overview.md · docs/18-refactor-progress-and-backlog.md</code>
      </footer>
    </main>
  );
}
