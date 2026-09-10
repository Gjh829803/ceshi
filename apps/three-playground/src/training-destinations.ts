/** 训练地图统一交给当前 Three Session；旧书签跳转到同一个入口。 */
export const DRAGON_TRAINING={id:'flying-creature-training',name:'飞龙 · 空中训练场',href:'./?map=flying-creature-training'} as const;
export function trainingMapHref(mapId:string):string{return './?map='+encodeURIComponent(mapId);}
