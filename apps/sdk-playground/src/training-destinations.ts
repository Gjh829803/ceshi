/** 训练地图通过当前 Three Session 的 hash 路由打开。 */
export const DRAGON_TRAINING={id:'flying-creature-training',name:'飞龙 · 空中训练场',href:'./#/scenes/flying-creature-training'} as const;
export function trainingMapHref(mapId:string):string{return './#/scenes/'+encodeURIComponent(mapId);}
