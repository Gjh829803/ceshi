export const workspaceMarkup=`
<main class="workspace" id="workspace">
  <header class="workspace-header">
    <div class="brand"><span class="brand-emblem">V</span><strong>VECTOR</strong><span class="brand-caption">3C WORKSPACE</span></div>
    <div class="scene-switch"><span data-icon="box"></span><label class="sr-only" for="mapSelect">当前训练地图</label><select id="mapSelect"></select></div>
    <button id="sceneTopButton" class="header-route" title="选择测试区域"><span data-icon="flag"></span><span id="mapBadge">综合园区</span><span data-icon="chevron" data-size="14"></span></button>
    <div class="header-spacer"></div>
    <button class="header-link" id="contributeButton"><span data-icon="book"></span><span>资产规范</span></button>
    <span class="local-status"><span class="status-dot"></span>本地工作区</span>
  </header>
  <nav class="workspace-rail" aria-label="训练工作区">
    <button id="exploreButton" class="rail-button" aria-pressed="true"><span data-icon="explore" data-size="25"></span><span>探索</span></button>
    <button id="libraryButton" class="rail-button" aria-pressed="false"><span data-icon="assets" data-size="25"></span><span>资产库</span></button>
    <button id="humanButton" class="rail-button"><span data-icon="character" data-size="25"></span><span>人物动作</span></button>
    <button id="equipmentButton" class="rail-button"><span data-icon="t-shirt" data-size="25"></span><span>人物装备</span></button>
    <button id="scenesButton" class="rail-button"><span data-icon="scenes" data-size="25"></span><span>测试场景</span></button>
    <button id="debugButton" class="rail-button" aria-pressed="true"><span data-icon="camera" data-size="25"></span><span>3C 调试</span></button>
    <div class="rail-spacer"></div><button id="performanceButton" class="rail-button" aria-expanded="false"><span data-icon="chart" data-size="23"></span><span>性能</span></button>
  </nav>
  <section id="stage" class="workspace-stage" aria-label="实时训练视口">
    <canvas id="viewport" aria-label="载具训练场，可使用键盘与鼠标自由探索" tabindex="0"></canvas>
    <div class="stage-bar"><span class="status-dot"></span><span id="activeName">人物动作训练</span><span class="stage-divider"></span><span id="stateValue">载入中</span></div>
    <section class="minimap" id="minimap" aria-label="训练场小地图">
      <div class="map-head"><span><span data-icon="map" data-size="15"></span> 场地导航</span><span>N ↑</span><button id="mapExpandButton" class="plain-icon" aria-label="展开小地图" aria-expanded="false"><span data-icon="expand" data-size="16"></span></button></div>
      <canvas id="map" width="376" height="364" aria-label="场地区域和载具位置地图"></canvas>
      <div class="map-footer"><span class="status-dot"></span><span id="zone">载具整备区</span></div>
    </section>
    <div class="stage-actions"><label class="subtle-button collider-toggle">碰撞体<select id="colliderSelect" aria-label="碰撞体显示"><option value="person">人</option><option value="all">全部</option><option value="off" selected>关闭</option></select></label><button id="quickButton" class="subtle-button" aria-expanded="false"><span data-icon="assets" data-size="16"></span>快速前往 <span data-icon="chevron" data-size="12"></span></button><button id="resetButton" class="subtle-button" title="返回当前场景起点"><span data-icon="reset" data-size="17"></span>复位</button><button id="pauseButton" class="subtle-button">暂停</button></div>
    <section class="quick-panel" id="quickPanel" hidden><h3>收藏与最近使用</h3><nav id="quickSlots" aria-label="载具快捷槽"></nav><p>数字 1–6 前往 · 完整列表见资产库</p></section>
    <div class="interaction" id="interaction"><kbd>F</kbd>进入 越野车</div><div class="bottom-hint" id="bottomHint"></div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <div class="touch left"><button data-key="KeyA">A</button><button data-key="KeyW">W</button><button data-key="KeyS">S</button><button data-key="KeyD">D</button></div><div class="touch right"><button data-key="ShiftLeft">Shift</button><button data-key="ControlLeft">Ctrl</button><button data-key="Space">Space</button><button id="touchInteract">F</button></div>
  </section>
  <div id="libraryHost" class="library-host"></div>
  <aside class="inspector-shell"><div class="inspector-top"><span>主体属性</span><button id="inspectorClose" class="plain-icon" aria-label="收起属性面板"><span data-icon="collapse" data-size="19"></span></button></div><div id="inspectorHost"></div><button id="advancedButton" class="advanced-button">操控参数与配置文件 <span data-icon="arrow-up-right" data-size="15"></span></button></aside>
  <section id="performancePanel" class="performance-panel" aria-label="性能诊断" hidden></section>
  <footer id="shortcutFooter" class="shortcut-footer" aria-label="全部可用快捷键">
    <div class="shortcut-main"><span class="shortcut-heading"><span data-icon="keyboard" data-size="18"></span><span id="shortcutSubject">人物操作</span></span><div id="controls" class="shortcut-list"></div></div>
    <div class="shortcut-system"><div class="system-keys" id="systemKeys"></div><button id="cameraButton" class="camera-mode-button">相机 · 跟随</button><output id="fpsReadout" aria-label="渲染回调频率" aria-live="off" title="requestAnimationFrame 回调频率；不是显示器实际呈现帧率。点击左侧性能查看间隔分布。">渲染回调 —/s</output></div>
    <p class="sr-only" id="cameraNote"></p>
  </footer>
  <div class="sr-only" aria-hidden="true"><span id="category"></span><span id="activeEn"></span><span id="stateLabel"></span><span id="speed"></span><span id="heightLabel"></span><span id="height"></span><span id="throttle"></span></div>
</main>
<div class="loading" id="loading"><div><h1>VECTOR</h1><div class="loader"></div><p id="loadText">正在准备场景、人物动作与载具…</p></div></div>
<div class="pause" id="pauseOverlay"><div class="panel pause-card"><div class="eyebrow">VECTOR / FREE TRAINING</div><h2>训练已暂停</h2><p>从资产库选择主体，前往场景开始测试。<br>底部始终显示当前主体的全部操作。<br>在右侧实时调整相机，或进入人物动作专项测试。</p><button id="resumeButton" class="primary">继续训练</button></div></div>
<dialog class="contribution-dialog" id="contributionDialog" aria-label="资产协作规范"><header><div><small>ASSET CONTRIBUTION</small><h2>让每一份资产都可被复用</h2></div><button id="contributionClose" class="plain-icon" aria-label="关闭资产规范"><span data-icon="close"></span></button></header><p>当前为本地测试工作区。团队通过 Git 提交资产与配置；在线成员、实时同步和权限管理属于后续建设范围。</p><ol><li><strong>登记资产</strong><span>稳定 ID、版本、贡献者、来源与授权、运动类型和检索标签。</span></li><li><strong>接入 3C</strong><span>模型与动作引用、操控策略、驾驶位、碰撞和独立相机配置。</span></li><li><strong>提交测试</strong><span>选定地图与测试点，记录适用范围和已知限制，再提交审核。</span></li></ol><p>资产目录由注册数据生成，新增条目无需增加工具栏按钮。示例模板用于协作登记，当前页面尚不支持直接导入任意模型包。</p><button id="downloadManifest" class="primary">下载资产登记模板</button></dialog>`;
