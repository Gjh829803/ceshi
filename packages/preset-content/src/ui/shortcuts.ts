import {humanoid} from '@worldkit/three';

export const controlsFor = humanoid.controlsFor;
export const controlSummaryFor = humanoid.controlSummaryFor;

/** Playground-only pointer/menu/debug shortcuts stay outside the production SDK. */
export function systemControlsFor(...args:Parameters<typeof humanoid.systemControlsFor>):[string,string][] {
  return [...humanoid.systemControlsFor(...args), ['拖动','自由观察'], ['滚轮','镜头距离'], ['Esc','释放 / 暂停'], ['1–6','快速前往（调试）']];
}
