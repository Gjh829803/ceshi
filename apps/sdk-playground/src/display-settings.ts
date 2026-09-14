export const DISPLAY_MODES = [
  {id:'material',label:'正常材质',hint:'查看原有颜色、贴图和光照',guide:'用于整体效果检查。关闭辅助信息并显示全部对象，可返回正常游戏画面。'},
  {id:'clay',label:'白模',hint:'排除材质干扰，检查形状与比例',guide:'统一白灰材质保留真实模型和动作，适合对照尺寸、轮廓及空间连接。'},
  {id:'unlit',label:'无光照',hint:'排除灯光影响，检查颜色和贴图',guide:'如果这里颜色正常，而正常材质模式偏暗或偏色，可以继续检查照明。'},
  {id:'depth',label:'深度图',hint:'用明暗显示远近和遮挡关系',guide:'近黑远白，距离沿相机视线方向计算，单位为米；超出范围的数值截断显示。'},
  {id:'semantic',label:'类型着色',hint:'用颜色区分对象类型',guide:'同一类型使用相同颜色。未分类对象单独标色；类型颜色不代表物理或交互能力。'},
  {id:'normal',label:'法线方向',hint:'检查表面朝向和异常接缝',guide:'颜色表示相机空间中的几何法线方向，随观察方向变化，不包含法线贴图。'},
] as const;
export type DisplayMode = typeof DISPLAY_MODES[number]['id'];
export const DISPLAY_TYPES = [
  {id:'person',label:'人物',color:'#f4b860'}, {id:'vehicle',label:'载具',color:'#65a9f3'},
  {id:'creature',label:'生物',color:'#a68be8'}, {id:'environment',label:'环境',color:'#90a6b5'},
  {id:'interaction',label:'交互物',color:'#69cbaa'}, {id:'unknown',label:'未分类',color:'#e78599'},
] as const;
export type DisplayType = typeof DISPLAY_TYPES[number]['id'];
export type DisplaySection = 'picture'|'objects'|'helpers';
export type DisplayObjectRow = {id:string;name:string;type:DisplayType;parentId?:string;available:boolean;hasCollider:boolean;tags?:readonly string[]};
export type DisplayAvailability = {physics:boolean;anchors:boolean;climbSurfaces:boolean;water:boolean;unmappedColliders:number;scopedColliders?:number;scene?:{anchors:boolean;climbSurfaces:boolean;water:boolean}};
export type DisplaySettings = {
  mode:DisplayMode; scope:'all'|'subject'|'selected'; selectedIds:string[]; hiddenIds:string[]; types:DisplayType[];
  isolation:{scope:'all'|'subject'|'selected';hiddenIds:string[];types:DisplayType[]}|null;
  helperOnly:'none'|'collision'|'wireframe'; colliders:'off'|'person'|'all'; colliderScope:'follow'|'nearby'|'all'; nearbyMeters:number;
  cameras:boolean; cameraRange:number;
  ground:boolean; anchors:boolean; climbSurfaces:boolean; water:boolean; wireframe:boolean; xray:boolean; opacity:number; depthNear:number;depthFar:number;
};
export type DisplayRenderSettings = Omit<DisplaySettings,'mode'> & {mode:DisplayMode|'collision'|'wireframe'};
export function defaultDisplaySettings():DisplaySettings {
  return {mode:'material',scope:'all',selectedIds:[],hiddenIds:[],types:DISPLAY_TYPES.map(t=>t.id),isolation:null,
    helperOnly:'none',colliders:'off',colliderScope:'follow',nearbyMeters:6,cameras:false,cameraRange:10,ground:true,anchors:false,climbSurfaces:false,water:false,
    wireframe:false,xray:false,opacity:.75,depthNear:0,depthFar:60};
}
export function resolveDisplaySettings(s:DisplaySettings):DisplayRenderSettings {
  if(s.helperOnly==='none')return {...s};
  return {...s,mode:s.helperOnly,cameras:false,colliders:s.helperOnly==='collision'?'all':'off',anchors:false,climbSurfaces:false,water:false,wireframe:false};
}
export function isDisplayPreviewActive(s:DisplaySettings):boolean {
  return s.mode!=='material'||s.scope!=='all'||!!s.hiddenIds.length||s.types.length!==DISPLAY_TYPES.length||s.helperOnly!=='none'
    ||s.cameras||s.colliders!=='off'||s.anchors||s.climbSurfaces||s.water||s.wireframe;
}
export function resetDisplaySection(s:DisplaySettings,section:DisplaySection):DisplaySettings {
  const d=defaultDisplaySettings();
  if(section==='picture')return {...s,mode:d.mode,depthNear:d.depthNear,depthFar:d.depthFar};
  if(section==='objects')return {...s,scope:'all',selectedIds:[],hiddenIds:[],types:d.types,isolation:null};
  return {...s,helperOnly:'none',colliders:'off',colliderScope:'follow',nearbyMeters:d.nearbyMeters,cameras:false,cameraRange:d.cameraRange,ground:true,
    anchors:false,climbSurfaces:false,water:false,wireframe:false,xray:false,opacity:d.opacity};
}
export function isolateDisplaySelection(s:DisplaySettings):DisplaySettings {
  if(!s.selectedIds.length)return s;
  return {...s,isolation:s.isolation??{scope:s.scope,hiddenIds:[...s.hiddenIds],types:[...s.types]},scope:'selected',hiddenIds:[],types:DISPLAY_TYPES.map(t=>t.id)};
}
export function exitDisplayIsolation(s:DisplaySettings):DisplaySettings {
  return s.isolation?{...s,...s.isolation,isolation:null}:s;
}
export const DISPLAY_PRESETS = [
  {id:'shape',label:'看形状与比例',hint:'白模 · 当前主体'},
  {id:'collision',label:'对照碰撞范围',hint:'材质 · 主体及附近碰撞体'},
  {id:'interaction',label:'检查交互位置',hint:'材质 · 全场景交互区域'},
  {id:'depth',label:'看空间前后',hint:'深度图 · 全场景'},
] as const;
export function applyDisplayPreset(s:DisplaySettings,id:typeof DISPLAY_PRESETS[number]['id']):DisplaySettings {
  const d=resetDisplaySection(s,'helpers');
  const common={...d,hiddenIds:[],types:DISPLAY_TYPES.map(t=>t.id),isolation:null};
  if(id==='shape')return {...common,mode:'clay',scope:s.selectedIds.length?'selected':'subject'};
  if(id==='collision')return {...common,mode:'material',scope:s.selectedIds.length?'selected':'subject',colliders:'all',colliderScope:'nearby'};
  if(id==='interaction')return {...common,mode:'material',scope:'all',anchors:true,climbSurfaces:true,water:true};
  return {...common,mode:'depth',scope:'all'};
}
