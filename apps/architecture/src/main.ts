import "./style.css";

type LayerKey = "authoring" | "runtime" | "control" | "presentation";

type LayerDetail = {
  eyebrow: string;
  title: string;
  status: string;
  description: string;
  modules: string[];
  output: string;
};

const layers: Record<LayerKey, LayerDetail> = {
  authoring: {
    eyebrow: "01 · CREATE",
    title: "Authoring SDK",
    status: "室外 Alpha",
    description:
      "给 Coding Agent 一组稳定的世界表达能力。Agent 定义世界、Feature、主体和规则，但不直接操作 Babylon、Havok 或其他 Provider 对象。",
    modules: ["WorldSpec", "FeatureRegistry", "SubjectKit", "Scene Compiler", "Agent Testkit"],
    output: "输出：可版本化、可追踪、可重建的 World Package",
  },
  runtime: {
    eyebrow: "02 · EXECUTE",
    title: "Runtime Kernel",
    status: "部分可运行",
    description:
      "维护世界里实际发生的事情。玩家输入、物理、动作和相机在固定 Tick 中运行，不等待 LLM，也不等待生成式画面。",
    modules: ["Entity / Transform", "Physics", "Action", "Navigation", "Gameplay Rules"],
    output: "输出：稳定 ID、空间状态、碰撞结果、动作与游戏结果",
  },
  control: {
    eyebrow: "03 · DIRECT",
    title: "World Control SDK",
    status: "Design",
    description:
      "把 Director LLM 的自然语言意图变成受控操作。它负责观察、实体解析、权限、Dry-run、事务、持续任务、回执与重放。",
    modules: ["Observation", "Entity Resolver", "Policy", "Command", "Runtime Task", "Receipt / Replay"],
    output: "输出：可授权、可校验、可回放的确定性世界变化",
  },
  presentation: {
    eyebrow: "04 · PRESENT",
    title: "Presentation Bridge",
    status: "契约设计",
    description:
      "把 SDK 状态转成 World Model 可消费的结构化条件。视觉模型可以自由生成材质、光影与细节，但必须服从实体、镜头和动作。",
    modules: ["Camera", "Depth / Normal", "Instance ID", "Motion", "Pose / Action", "Appearance"],
    output: "输出：RenderFrame、Appearance Manifest 与 Render Directive",
  },
};

const app = document.querySelector<HTMLDivElement>("#app");
if (app === null) throw new Error("Missing #app");

app.innerHTML = `
  <div class="progress" aria-hidden="true"><span id="scroll-progress"></span></div>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="返回顶部">
      <span class="brand-cube" aria-hidden="true"><i></i><i></i><i></i></span>
      <span><strong>WORLD SDK</strong><small>TECHNICAL BLUEPRINT</small></span>
    </a>
    <nav aria-label="页面导航">
      <a href="#agent">Agent 创作</a>
      <a href="#sdk">World SDK</a>
      <a href="#runtime-control">实时操控</a>
      <a href="#status">当前状态</a>
    </nav>
    <a class="header-action" href="#agent">查看方案 <span>↓</span></a>
  </header>

  <main id="top">
    <section class="hero section-shell">
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-orbit orbit-one" aria-hidden="true"></div>
      <div class="hero-orbit orbit-two" aria-hidden="true"></div>
      <div class="hero-copy reveal">
        <div class="eyebrow"><span></span> AGENT-NATIVE 3D WORLD INFRASTRUCTURE</div>
        <h1>从一句话创造世界，<br /><em>再边玩边改变它。</em></h1>
        <p>
          两段 Agent 先把文字或图片变成可玩的白膜世界；World SDK 维持真实规则；
          进入世界后，玩家用 WASD 控制身体，用自然语言实时导演世界。
        </p>
        <div class="hero-actions">
          <a class="button button-primary" href="#agent">从 Agent 创作开始 <span>↘</span></a>
          <a class="button button-ghost" href="#runtime-control">查看实时操控</a>
        </div>
        <div class="status-strip" aria-label="项目状态">
          <div><span class="status-dot live"></span><strong>AGENT × 2</strong><small>先规划，再编码搭建</small></div>
          <div><span class="status-dot design"></span><strong>WORLD SDK</strong><small>室外白膜 Alpha</small></div>
          <div><span class="status-dot future"></span><strong>LIVE CONTROL</strong><small>Director 协议设计</small></div>
        </div>
      </div>
      <div class="journey-board reveal" aria-label="三部分技术方案概览">
        <div class="journey-head"><span>PRODUCT FLOW</span><strong>输入 → 创作 → 运行 → 实时变化</strong></div>
        <div class="journey-agent">
          <small>PART 01 · AGENT 创造世界</small>
          <div class="journey-agent-flow">
            <article><span>①</span><div><strong>Planner Agent</strong><em>定义完整世界</em></div></article>
            <b>→</b>
            <article><span>②</span><div><strong>Builder Agent</strong><em>编码并验证白膜</em></div></article>
          </div>
          <p>输入：文字 / 图片　　输出：World Package</p>
        </div>
        <div class="journey-sdk">
          <small>PART 02 · WORLD SDK</small>
          <strong>世界规则与运行时</strong>
          <div><span>地形 / 实体</span><span>主体 / 镜头</span><span>物理 / 动作</span><span>ID / 状态</span></div>
        </div>
        <div class="journey-runtime">
          <small>PART 03 · 世界实时操控</small>
          <div><article><strong>WASD</strong><span>直接控制身体</span></article><article><strong>自然语言</strong><span>Director 改变世界</span></article></div>
          <p>SDK 状态 → World Model → 连续画面与声音</p>
        </div>
        <i class="journey-spine" aria-hidden="true"></i>
      </div>
    </section>

    <section class="principle-bar" aria-label="核心原则">
      <div class="principle-track">
        <span>创造</span><i></i><strong>Coding Agent 定义世界能做什么</strong>
        <span>导演</span><i></i><strong>Director LLM 决定此刻如何变化</strong>
        <span>执行</span><i></i><strong>World SDK 决定实际发生什么</strong>
        <span>呈现</span><i></i><strong>World Model 决定如何被看见</strong>
      </div>
    </section>

    <section class="three-part-section">
      <div class="section-shell">
        <div class="section-heading reveal">
          <div><span class="section-index">01</span><p>END-TO-END SOLUTION</p></div>
          <h2>先讲清三部分，<br />再展开底层模块</h2>
          <p>这不是一张传统游戏引擎模块表，而是一条从用户输入、世界创作到运行期实时改变的完整链路。</p>
        </div>

        <article class="solution-part agent-part reveal" id="agent">
          <header class="solution-part-title">
            <span>PART 01</span>
            <div><small>OFFLINE / CREATION TIME</small><h3>Agent 创造世界</h3></div>
            <p>两段 Agent 分工：第一段把模糊输入变成完整设计，第二段把设计变成可运行代码。</p>
          </header>
          <div class="agent-pipeline">
            <div class="pipeline-input">
              <span>USER INPUT</span>
              <strong>一句话 / 一张图</strong>
              <p>“山峦起伏的草地，中间有大湖，天上有太阳。”</p>
            </div>
            <i>→</i>
            <section class="agent-stage planner-stage">
              <div class="stage-number">AGENT 01</div>
              <small>WORLD PLANNER</small>
              <h4>先定义完整世界</h4>
              <p>补足输入没有说明的世界背面、区域关系、主路线、出生点和进入镜头，并把推断显式记录。</p>
              <ul>
                <li><strong>WorldSpec</strong><span>完整世界结构与证据</span></li>
                <li><strong>World Plan</strong><span>严格俯视的世界布局图</span></li>
                <li><strong>Opening Shot</strong><span>玩家进入世界的第一视角</span></li>
                <li><strong>Entity Catalog</strong><span>主体、客体与标志物目录</span></li>
              </ul>
              <footer>产物冻结为 Plan Lock，下一段不能静默修改</footer>
            </section>
            <i>→</i>
            <section class="agent-stage builder-stage">
              <div class="stage-number">AGENT 02</div>
              <small>WORLD BUILDER / CODING AGENT</small>
              <h4>再编码并验证世界</h4>
              <p>只消费冻结规划，调用 World SDK 搭地形、放置实体、创建主体，并自动运行编译与可玩性检查。</p>
              <ul>
                <li><strong>Scene Code</strong><span>TypeScript 世界包</span></li>
                <li><strong>World Features</strong><span>地形、水体与标志物</span></li>
                <li><strong>SubjectKit</strong><span>白膜、运动、镜头与动作</span></li>
                <li><strong>Verification</strong><span>坡度、出生点、预算与构图</span></li>
              </ul>
              <footer>输出可玩的确定性 Whitebox World</footer>
            </section>
          </div>
          <div class="agent-output-rail">
            <div><span>结构产物</span><strong>World Package</strong><p>世界代码 · Feature · Entity ID · 规则 · 测试</p></div>
            <i>＋</i>
            <div><span>视觉产物</span><strong>Visual Bible</strong><p>实体三视图 · Appearance · 目标渲染首帧</p></div>
            <i>→</i>
            <div class="rail-result"><span>共同交付</span><strong>一个可玩、可追踪、可渲染的世界</strong></div>
          </div>
        </article>

        <article class="solution-part sdk-part reveal" id="sdk">
          <header class="solution-part-title">
            <span>PART 02</span>
            <div><small>DETERMINISTIC FOUNDATION</small><h3>World SDK 能力底座</h3></div>
            <p>SDK 不替 Agent 设计世界，而是提供稳定能力并维护任何系统都不能绕过的世界规则。</p>
          </header>
          <div class="sdk-concrete-grid">
            <section><span>01</span><small>BUILD THE WORLD</small><h4>世界构建</h4><p>高度场、Raster、Mask、地形塑形、水体、几何标志物和自定义 Feature。</p><footer>回答：世界由什么构成？</footer></section>
            <section><span>02</span><small>PLAY THE SUBJECT</small><h4>主体套餐</h4><p>白膜、骨骼、碰撞、运动手感、输入映射、第一/第三人称镜头和动作。</p><footer>回答：玩家控制谁、怎么动？</footer></section>
            <section><span>03</span><small>RUN THE RULES</small><h4>确定性运行时</h4><p>Entity、Transform、固定 Tick、Physics、Action、Navigation 与 Gameplay。</p><footer>回答：世界实际发生了什么？</footer></section>
            <section><span>04</span><small>TRACK EVERYTHING</small><h4>身份与追踪</h4><p>稳定 ID、FeatureRegistry、seed、依赖、资源所有权、Revision 与语义绑定。</p><footer>回答：变化作用在谁身上？</footer></section>
            <section><span>05</span><small>PROVE IT WORKS</small><h4>自动验证</h4><p>出生安全、坡度、碰撞、预算、三视图、构图和可重复编译检查。</p><footer>回答：Agent 真的搭对了吗？</footer></section>
          </div>
          <div class="sdk-rule-line"><strong>唯一世界真相</strong><span>位置 · 数量 · 碰撞 · 导航 · 动作 · 相机 · 游戏结果</span><em>都以 SDK 为准</em></div>
        </article>

        <article class="solution-part live-part reveal" id="runtime-control">
          <header class="solution-part-title">
            <span>PART 03</span>
            <div><small>ONLINE / RUNTIME</small><h3>世界实时操控</h3></div>
            <p>世界创建完成后，玩家有两种同时存在、互不阻塞的控制方式。</p>
          </header>
          <div class="live-control-grid">
            <section class="direct-control">
              <div class="control-source"><span>CONTROL A</span><strong>WASD / 手柄</strong><p>走路、奔跑、跳跃、转镜头、开车或骑乘。</p></div>
              <i>低延迟直达</i>
              <div class="control-target"><small>WORLD SDK</small><strong>主体运动与物理</strong><p>不经过 LLM，不等待 World Model。</p></div>
            </section>
            <section class="language-control">
              <div class="control-source"><span>CONTROL B</span><strong>玩家自然语言</strong><p>“把草原变成月球，让马成为幽灵马并降低重力。”</p></div>
              <i>意图编译</i>
              <div class="director-mini-flow">
                <strong>Director LLM</strong>
                <span>观察世界</span><b>→</b><span>解析实体</span><b>→</b><span>Dry-run</span><b>→</b><span>提交命令 / 任务</span>
              </div>
            </section>
          </div>
          <div class="live-output-grid">
            <section><span>逻辑变化</span><strong>World Command</strong><p>位置、大小、出现/消失、重力、碰撞、NPC 动作、寻路与规则。</p><em>提交到 SDK，在固定 Tick 生效</em></section>
            <section><span>纯视觉变化</span><strong>Render Directive</strong><p>材质、颜色、画风、光照、云、粒子和不影响通行的视觉细节。</p><em>提交到 Presentation Bridge</em></section>
            <section class="world-model-output"><span>最终呈现</span><strong>World Model / Audio Model</strong><p>消费已提交的 SDK 状态和视觉指令，持续生成与世界事实一致的画面与声音。</p><em>画面可以无限，世界状态只有一份</em></section>
          </div>
        </article>
      </div>
    </section>

    <section class="architecture section-shell" id="architecture">
      <div class="section-heading reveal">
        <div><span class="section-index">02</span><p>DETAILED SYSTEM MAP</p></div>
        <h2>理解三部分之后，<br />再展开底层技术连接</h2>
        <p>这张总图用于工程讨论：展示两段 Agent、SDK 内部模块、运行期控制通道和 World Model 条件输出之间的连接。</p>
      </div>
      <figure class="architecture-figure reveal">
        <button class="image-open" id="open-diagram" type="button" aria-label="放大技术架构图">
          <img src="/world-sdk-technical-architecture.png" alt="World SDK 技术架构：创作期与运行期输入连接中央四层 SDK，并向世界模型输出结构化控制信号" />
          <span><i>＋</i> 点击查看完整架构图</span>
        </button>
        <figcaption>
          <span>FIG 01 / SYSTEM ARCHITECTURE</span>
          <p>WASD 绕过 LLM 直接进入 Runtime Kernel；语言指令通过受控 Gateway 提交，画面异步消费已提交状态。</p>
        </figcaption>
      </figure>
    </section>

    <section class="stack-section section-shell">
      <div class="section-heading compact reveal">
        <div><span class="section-index">03</span><p>SDK INTERNAL LAYERS</p></div>
        <h2>继续展开 SDK 内部四层</h2>
        <p>这是面向工程实现的内部拆分；对外仍然以“Agent 创作、SDK 底座、实时操控”三部分理解。</p>
      </div>
      <div class="stack-layout reveal">
        <div class="layer-tabs" role="tablist" aria-label="SDK 分层">
          <button class="layer-tab active" type="button" role="tab" aria-selected="true" data-layer="authoring">
            <span>01</span><div><small>CREATE</small><strong>Authoring SDK</strong></div><em>室外 Alpha</em>
          </button>
          <button class="layer-tab" type="button" role="tab" aria-selected="false" data-layer="runtime">
            <span>02</span><div><small>EXECUTE</small><strong>Runtime Kernel</strong></div><em>部分可运行</em>
          </button>
          <button class="layer-tab" type="button" role="tab" aria-selected="false" data-layer="control">
            <span>03</span><div><small>DIRECT</small><strong>World Control</strong></div><em>Design</em>
          </button>
          <button class="layer-tab" type="button" role="tab" aria-selected="false" data-layer="presentation">
            <span>04</span><div><small>PRESENT</small><strong>Presentation Bridge</strong></div><em>契约设计</em>
          </button>
        </div>
        <article class="layer-detail" id="layer-detail" aria-live="polite"></article>
      </div>
    </section>

    <section class="director-section" id="director">
      <div class="section-shell">
        <div class="section-heading inverse reveal">
          <div><span class="section-index">04</span><p>RUNTIME WORLD DIRECTOR</p></div>
          <h2>LLM 不逐帧控制世界，<br />它提交可执行的意图。</h2>
          <p>Director LLM 负责理解，World Control Gateway 负责把理解变成安全、确定、可追踪的世界变化。</p>
        </div>

        <div class="director-flow reveal" aria-label="LLM 世界控制执行流程">
          <article><span>01</span><i class="pulse"></i><small>OBSERVE</small><h3>观察</h3><p>读取受限的语义快照，而不是完整场景树。</p></article>
          <b>→</b>
          <article><span>02</span><i></i><small>RESOLVE</small><h3>解析</h3><p>把“右边的塔”解析为稳定 Entity ID。</p></article>
          <b>→</b>
          <article><span>03</span><i></i><small>DRY-RUN</small><h3>预演</h3><p>检查权限、碰撞、可达性、依赖与预算。</p></article>
          <b>→</b>
          <article><span>04</span><i></i><small>COMMIT</small><h3>提交</h3><p>在固定 Tick 边界原子改变世界状态。</p></article>
          <b>→</b>
          <article><span>05</span><i></i><small>RECEIPT</small><h3>回执</h3><p>返回实际变化、诊断、Revision 与任务状态。</p></article>
        </div>

        <div class="command-example reveal">
          <div class="example-request">
            <span>玩家自然语言</span>
            <blockquote>“让守卫跑到湖边，<br />面向我，然后挥手。”</blockquote>
          </div>
          <div class="plan-graph" aria-label="编译后的任务图">
            <span class="plan-label">COMPILED WORLD PLAN</span>
            <div class="plan-node"><small>TASK 01</small><strong>navigation.goTo</strong><em>guard-01 → lake-overlook</em></div>
            <i>dependsOn</i>
            <div class="plan-node"><small>TASK 02</small><strong>lookAt</strong><em>guard-01 → player</em></div>
            <i>dependsOn</i>
            <div class="plan-node"><small>COMMAND 03</small><strong>action.play</strong><em>guard-01 · wave</em></div>
          </div>
          <div class="example-result">
            <span>SDK 执行原则</span>
            <ul>
              <li>LLM 只给目标，不输出每帧坐标</li>
              <li>导航和动作由确定性系统执行</li>
              <li>失败返回原因，不阻塞玩家移动</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="boundary-section section-shell" id="boundary">
      <div class="section-heading compact reveal">
        <div><span class="section-index">05</span><p>TWO CONTROL CHANNELS</p></div>
        <h2>世界变化走两条通道</h2>
        <p>关键判断只有一个：它是否会影响玩家与世界之间的真实关系。</p>
      </div>
      <div class="channel-grid reveal">
        <article class="channel-card command-card">
          <header><span>LOGIC</span><div><small>确定性通道</small><h3>World Command</h3></div><em>进入 SDK</em></header>
          <p>只要影响移动、碰撞、导航、遮挡、关键轮廓、动作或规则，就必须更新白膜世界。</p>
          <div class="request-list">
            <span>把房子放大</span><span>让 NPC 走过来</span><span>生成陨石坑</span><span>降低重力</span>
          </div>
          <footer>结果：几何、碰撞、导航、身份和渲染条件同步变化</footer>
        </article>
        <div class="channel-rule"><span>DECISION RULE</span><strong>是否改变<br />世界事实？</strong><i></i></div>
        <article class="channel-card directive-card">
          <header><span>VISUAL</span><div><small>表现通道</small><h3>Render Directive</h3></div><em>进入模型</em></header>
          <p>纯材质、光影、画风和非交互细节可以直接作为视觉指令，但不能伪造逻辑变化。</p>
          <div class="request-list">
            <span>城堡变红色石头</span><span>草原换成月球风格</span><span>增加云与粒子</span><span>改变光照气氛</span>
          </div>
          <footer>结果：同一确定性状态可以拥有无限种视觉与声音呈现</footer>
        </article>
      </div>
    </section>

    <section class="truth-section">
      <div class="section-shell truth-grid">
        <div class="truth-copy reveal">
          <div class="eyebrow"><span></span> ONE STATE, INFINITE PRESENTATIONS</div>
          <h2>白膜不是临时占位，<br />它是世界的<strong>物理真相。</strong></h2>
          <p>World Model 可以把同一状态呈现为草原、月球或赛博城市，但玩家、障碍、相机、动作与游戏结果必须保持一致。</p>
        </div>
        <div class="truth-table reveal">
          <div class="truth-head"><span>世界属性</span><span>World SDK</span><span>World Model</span></div>
          <div><strong>位置 / 数量 / 碰撞</strong><span class="owner">唯一负责</span><span class="follow">严格服从</span></div>
          <div><strong>导航 / 动作 / 规则</strong><span class="owner">唯一负责</span><span class="follow">严格服从</span></div>
          <div><strong>镜头 / 遮挡 / 轮廓</strong><span class="owner">提供条件</span><span class="follow">保持一致</span></div>
          <div><strong>材质 / 光影 / 风格</strong><span class="intent">提供意图</span><span class="create">自由生成</span></div>
          <div><strong>天气 / 粒子 / 声音</strong><span class="intent">提供状态</span><span class="create">自由生成</span></div>
        </div>
      </div>
    </section>

    <section class="creation-section section-shell">
      <div class="section-heading compact reveal">
        <div><span class="section-index">06</span><p>PLAN-FIRST AUTHORING</p></div>
        <h2>一句话或一张图，先变成完整世界</h2>
        <p>图片表达规划意图；实际白膜负责高度、坡度、位置、碰撞和可玩性。</p>
      </div>
      <div class="creation-flow reveal">
        <article><span>INPUT</span><strong>用户文字 / 图片</strong><p>描述进入世界时想看到的体验。</p></article><i>→</i>
        <article><span>PLAN</span><strong>Planner</strong><p>完整 WorldSpec、俯视图、进入视角与实体目录。</p></article><i>→</i>
        <article><span>LOCK</span><strong>冻结规划</strong><p>Builder 不得为了实现方便静默改设计。</p></article><i>→</i>
        <article><span>BUILD</span><strong>Builder</strong><p>使用 Feature 和 SubjectKit 构建可玩白膜。</p></article><i>→</i>
        <article><span>VERIFY</span><strong>SDK 验证</strong><p>派生高度、坡度、三视图与构图证据。</p></article><i>→</i>
        <article><span>STYLE</span><strong>Visual Bible</strong><p>定义身份、材质、风格与目标首帧。</p></article>
      </div>
    </section>

    <section class="status-section section-shell" id="status">
      <div class="section-heading compact reveal">
        <div><span class="section-index">07</span><p>IMPLEMENTATION STATUS</p></div>
        <h2>目标架构明确，当前从室外 Alpha 起步</h2>
        <p>这张路线图刻意区分“已经能运行”和“已经设计但还没有代码”。</p>
      </div>
      <div class="status-grid reveal">
        <article class="status-column done">
          <header><span></span><div><small>RUNNING ALPHA</small><h3>已经实现</h3></div></header>
          <ul>
            <li>固定步长 World / Entity / Input</li>
            <li>Babylon/Havok 刚体、碰撞和高度场</li>
            <li>第三人称人形 SubjectKit</li>
            <li>室外地形、Raster、Mask、水体与标志物</li>
            <li>FeatureRegistry 与 Plan-first 创作链路</li>
          </ul>
        </article>
        <article class="status-column active">
          <header><span></span><div><small>CONVERGING</small><h3>正在收敛</h3></div></header>
          <ul>
            <li>人形资产、Jump 动作与混合 QA</li>
            <li>上下坡移动与镜头主观手感</li>
            <li>水岸、Tile 接缝与视觉回归</li>
            <li>更多图片到白膜的泛化实验</li>
            <li>性能预算与自动化验收闭环</li>
          </ul>
        </article>
        <article class="status-column planned">
          <header><span></span><div><small>DESIGNED / PLANNED</small><h3>后续能力</h3></div></header>
          <ul>
            <li>第一人称、车辆、骑乘与动物</li>
            <li>室内、多层和流式世界</li>
            <li>NPC、NavMesh、行为与 Gameplay</li>
            <li>Runtime World Director 运行时代码</li>
            <li>Render Bridge 与实时 World Model</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="closing section-shell reveal">
      <div>
        <span>THE PRODUCT THESIS</span>
        <h2>WASD 控制玩家身体。<br /><em>自然语言控制整个世界。</em></h2>
      </div>
      <p>自由来自 Agent 与 World Model，可信来自一个稳定、确定、可追踪的 World SDK。</p>
    </section>
  </main>

  <footer class="site-footer">
    <div class="brand footer-brand">
      <span class="brand-cube" aria-hidden="true"><i></i><i></i><i></i></span>
      <span><strong>WORLD SDK</strong><small>DETERMINISTIC WORLD INFRASTRUCTURE</small></span>
    </div>
    <p>CREATE · DIRECT · EXECUTE · PRESENT</p>
    <a href="#top">回到顶部 ↑</a>
  </footer>

  <dialog class="diagram-dialog" id="diagram-dialog">
    <button id="close-diagram" type="button" aria-label="关闭架构图">×</button>
    <img src="/world-sdk-technical-architecture.png" alt="放大的 World SDK 技术架构图" />
  </dialog>
`;

function renderLayer(key: LayerKey): void {
  const detail = layers[key];
  const panel = document.querySelector<HTMLElement>("#layer-detail");
  if (panel === null) return;
  panel.innerHTML = `
    <div class="layer-detail-head">
      <div><small>${detail.eyebrow}</small><h3>${detail.title}</h3></div>
      <span>${detail.status}</span>
    </div>
    <p>${detail.description}</p>
    <div class="module-list">${detail.modules.map((module) => `<span>${module}</span>`).join("")}</div>
    <footer>${detail.output}</footer>
  `;
}

renderLayer("authoring");

document.querySelectorAll<HTMLButtonElement>(".layer-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const key = tab.dataset.layer as LayerKey;
    document.querySelectorAll<HTMLButtonElement>(".layer-tab").forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    renderLayer(key);
  });
});

const dialog = document.querySelector<HTMLDialogElement>("#diagram-dialog");
document.querySelector("#open-diagram")?.addEventListener("click", () => dialog?.showModal());
document.querySelector("#close-diagram")?.addEventListener("click", () => dialog?.close());
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

const progress = document.querySelector<HTMLElement>("#scroll-progress");
function updateProgress(): void {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = scrollable <= 0 ? 0 : window.scrollY / scrollable;
  if (progress !== null) progress.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
}
window.addEventListener("scroll", updateProgress, { passive: true });
updateProgress();

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);
document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
