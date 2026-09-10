/** 独立训练场通过页面切换交接执行权；普通地图仍由 Three Session 切换。 */
export const DRAGON_TRAINING = {
  id: "flying-creature-training",
  name: "飞龙 · 空中训练场",
  href: "./dragon-training.html",
} as const;

export function trainingMapHref(mapId: string): string {
  return mapId === DRAGON_TRAINING.id
    ? DRAGON_TRAINING.href
    : `./?map=${encodeURIComponent(mapId)}`;
}
