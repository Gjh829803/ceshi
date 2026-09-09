import {training} from '@worldkit/three';
import { SPECS } from '../config';
import { MAPS } from '../environment/maps';
import { parseAssetProfile, type AssetProfile } from './profiles';
const {controlFields}=training;
import './workbench.css';

type Tab = 'scenes' | 'camera';
interface WorkbenchOptions {
  onOpenChange(open: boolean): void;
  onPrepare(mapId: string, regionId: string, assetId: string): void;
  getMapId(): string;
  getAssetId(): string;
  getProfile(id: string): AssetProfile;
  applyProfile(profile: AssetProfile): void;
  saveProfile(profile: AssetProfile): void;
  resetProfile(id: string): void;
  getState(): Record<string, unknown>;
  togglePause(): void;
  step(): void;
}
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
};
function button(label: string, action: () => void, className = 'wb-button') {
  const node = make('button', label, className); node.type = 'button'; node.onclick = action; return node;
}
const note = (text: string) => make('p', text, 'wb-note');
const subjects = [{ id: 'person', name: '主体人物', mode: 'character' }, ...SPECS];

export function mountWorkbench(host: HTMLElement, options: WorkbenchOptions) {
  const dialog = make('dialog', '', 'workbench'); dialog.setAttribute('aria-label', '训练与资产工作台');
  const header = make('header', '', 'wb-header');
  header.append(make('div', 'VECTOR / TEST PLATFORM', 'wb-eyebrow'), button('关闭 ×', () => close(), 'wb-close'));
  const nav = make('nav', '', 'wb-tabs'); nav.setAttribute('aria-label', '工作台分区');
  const content = make('div', '', 'wb-content'), messages = make('p', '', 'wb-message'); messages.setAttribute('role', 'status');
  const tabs = new Map<Tab, HTMLButtonElement>();
  let activeTab: Tab = 'scenes', previousFocus: HTMLElement | null = null;
  let selectedMap = options.getMapId(), selectedAsset = options.getAssetId();
  const report = (error: unknown) => { messages.textContent = error instanceof Error ? error.message : String(error); messages.dataset.error = 'true'; };
  const inform = (message: string) => { messages.textContent = message; delete messages.dataset.error; };
  for (const [id, label] of [['scenes', '测试场景'], ['camera', '3C 调试与配置']] as const) {
    const tab = button(label, () => show(id)); tabs.set(id, tab); nav.append(tab);
  }
  dialog.append(header, make('h2', '先选场地，再开始测试'), nav, content, messages); host.append(dialog);
  const tick = setInterval(() => {
    if (dialog.open && activeTab === 'camera') {
      const output = content.querySelector('output'); if (output) output.textContent = JSON.stringify(options.getState(), null, 2);
    }
  }, 250);
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => { options.onOpenChange(false); previousFocus?.focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });
  function assetSelect(label: string, onChange: () => void) {
    const wrap = make('label', label, 'wb-field'), select = make('select'); select.setAttribute('aria-label', label);
    for (const subject of subjects) { const option = make('option', subject.name); option.value = subject.id; select.append(option); }
    select.value = selectedAsset;
    select.onchange = () => { selectedAsset = select.value; onChange(); };
    wrap.append(select); return wrap;
  }
  function show(tab: Tab) {
    activeTab = tab; content.replaceChildren(); inform('');
    tabs.forEach((b, id) => b.setAttribute('aria-current', String(id === tab)));
    if (tab === 'scenes') showScenes(); else showCamera();
  }
  function showScenes() {
    content.append(note('先选择人物或载具，再准备对应区域。准备会复位这个主体；资产库的“前往”会保留其当前位置。切换地图会重新整备所有主体。'));
    const selection = make('div', '', 'wb-parameter-grid');
    const mapLabel = make('label', '测试地图', 'wb-field'), mapSelect = make('select'); mapSelect.setAttribute('aria-label', '测试地图');
    for (const map of MAPS) { const option = make('option', map.name); option.value = map.id; mapSelect.append(option); }
    mapSelect.value = selectedMap; mapSelect.onchange = () => { selectedMap = mapSelect.value; show('scenes'); };
    mapLabel.append(mapSelect); selection.append(mapLabel, assetSelect('测试主体', () => show('scenes'))); content.append(selection);
    const map = MAPS.find(m => m.id === selectedMap)!;
    content.append(note(map.description));
    const grid = make('div', '', 'wb-scene-grid'), subject = subjects.find(s => s.id === selectedAsset)!;
    for (const region of map.regions) {
      const compatible = region.modes.includes(subject.mode);
      const card = make('section', '', `wb-scene${compatible ? '' : ' wb-incompatible'}`);
      card.style.setProperty('--region-color', region.color);
      card.append(make('span', compatible ? '可准备 · 静态测试场' : '请选择适配主体', 'wb-chip'), make('h3', region.name), note(region.description));
      const launch = button(compatible ? `准备 ${subject.name} →` : '当前主体不适配', () => {
        try { options.onPrepare(map.id, region.id, selectedAsset); close(); } catch (error) { report(error); }
      });
      launch.disabled = !compatible; card.append(launch); grid.append(card);
    }
    content.append(grid);
  }
  function showCamera() {
    content.append(assetSelect('编辑 3C 资产', () => show('camera')));
    content.append(note('操控与相机参数按资产独立应用。进入相应载具后使用它的配置；保存到本地后，下次打开继续使用。'));
    const current = options.getProfile(selectedAsset);
    if(selectedAsset==='person')content.append(note('人物使用已标定的 Playground 默认配置；下方基准参数与实际速度的换算见字段说明。'));
    const mode = SPECS.find(s => s.id === selectedAsset)?.mode;
    const road = mode === 'wheeled' || mode === 'bike';
    if (mode === 'space') content.append(note('默认启用平移稳定辅助：松开某个方向会消除该方向的漂移，Shift 强制制动。辅助设为 0 可测试纯惯性；已输入的方向仍能加速到最高速度。'));
    if (mode === 'sub') content.append(note('侧向阻尼控制转向后的横滑。Space 上浮、Ctrl 下潜，Shift 独立制动。'));
    if (road) content.append(note('转向倍率作用于随速度变化的转弯半径。实际轨迹还受抓地、制动和碰撞影响；松油减速和刹车参数可独立调整。'));
    const grid = make('div', '', 'wb-parameter-grid');
    const inputs: { group: 'camera' | 'control'; key: string; input: HTMLInputElement }[] = [];
    const readFields = () => {
      const next = options.getProfile(selectedAsset);
      for (const { group, key, input } of inputs) (next[group] as unknown as Record<string, number>)[key] = input.value.trim() ? Number(input.value) : NaN;
      return parseAssetProfile(next, selectedAsset);
    };
    const fields: { group: 'camera' | 'control'; key: string; label: string; step: number }[] = [
      { group: 'camera', key: 'distance', label: '跟随距离 / 米', step: .25 },
      ...(['baseFovDegrees','recenterDelaySeconds','followResponsePerSecond'] as const).map(key=>({group:'camera' as const,key,label:`${training.CAMERA_PARAMETERS[key].label} / ${training.CAMERA_PARAMETERS[key].unit}`,step:training.CAMERA_PARAMETERS[key].step})),
      ...controlFields(mode??'character').filter(f=>!f.disabled).map(f=>({group:'control' as const,key:f.key,label:`${f.label} / ${f.unit}`,step:f.step})),
    ];
    for (const { group, key, label, step } of fields) {
      if(selectedAsset==='person'&&key==='recenterDelaySeconds')continue;
      const field = make('label', label, 'wb-field'), input = make('input'); input.type = 'number'; input.step = String(step);
      const bounds=group==='camera'?(key==='distance'?training.CAMERA_DISTANCE_EDITOR_RANGE:training.CAMERA_TUNING_RANGES[key as training.NumericCameraKey]):training.CONTROL_RANGES[key as training.ControlKey];
      input.min=String(bounds[0]);input.max=String(bounds[1]);
      input.value = String((current[group] as unknown as Record<string, number>)[key]);
      inputs.push({ group, key, input });
      input.oninput = () => { try { options.applyProfile(readFields()); inform('已应用到这个资产；保存后可跨刷新保留。'); } catch { /* Allow incomplete numeric edits until blur or save. */ } };
      input.onchange = () => {
        try {
          options.applyProfile(readFields()); inform('已应用到这个资产；保存后可跨刷新保留。');
        } catch (error) { input.value = String((options.getProfile(selectedAsset)[group] as unknown as Record<string, number>)[key]); report(error); }
      };
      field.append(input); grid.append(field);
    }
    const actions = make('div', '', 'wb-actions');
    actions.append(button('保存这个资产的配置', () => {
      try { const profile = readFields(); options.applyProfile(profile); options.saveProfile(profile); inform('已保存到本机浏览器。'); } catch (error) { report(error); }
    }), button('恢复资产默认值', () => {
      try { options.resetProfile(selectedAsset); show('camera'); inform('已恢复并清除这个资产的本地覆盖。'); } catch (error) { report(error); }
    }), button('暂停 / 继续', () => options.togglePause()), button('单步 1/60 秒', () => options.step()));
    const shape = make('details'); shape.append(make('summary', '碰撞体积与资产标识'), make('pre', JSON.stringify({ assetId: current.assetId, version: current.version, envelope: current.envelope }, null, 2), 'wb-telemetry'));
    const output = make('output', JSON.stringify(options.getState(), null, 2), 'wb-telemetry'); output.setAttribute('aria-label', '主体和相机实时状态');
    content.append(grid, actions, shape, make('h3', '当前运行主体 · 实时状态'), output, note('请在门框、楼梯、低顶和转角处结合移动观察镜头。渲染回调频率用于诊断，不代表显示器实际呈现 FPS。'));
  }
  return {
    open(tab: Tab = 'scenes') {
      if (!dialog.open) { previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; selectedMap = options.getMapId(); selectedAsset = options.getAssetId(); dialog.showModal(); options.onOpenChange(true); }
      show(tab);
    },
    close,
    isOpen: () => dialog.open,
    dispose() { clearInterval(tick); close(); dialog.remove(); },
  };
}
