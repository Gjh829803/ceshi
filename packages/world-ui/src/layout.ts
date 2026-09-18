/** React/CSS positioning subset. Numeric lengths are design pixels, not video pixels. */
export type UiLength = number | `${number}px` | `${number}%`;
export type UiSize = UiLength | 'auto';
export interface UiInsets {top?:number;right?:number;bottom?:number;left?:number}
export type UiLayoutReference = 'viewport'|'safe-area';
export interface UiLayout {
  position?:'absolute';
  top?:UiSize;right?:UiSize;bottom?:UiSize;left?:UiSize;
  width?:UiSize;height?:UiSize;
  minWidth?:UiLength;maxWidth?:UiLength;minHeight?:UiLength;maxHeight?:UiLength;
  transform?:string;
  overflow?:'visible'|'hidden';
  zIndex?:number;
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateUiInsets(value:unknown):asserts value is UiInsets {
  if(!record(value)||Object.entries(value).some(([key,v])=>!['top','right','bottom','left'].includes(key)||!finite(v,0,8192)))throw new Error('UI_LAYOUT_INSETS_INVALID');
}
function length(value:unknown,negative:boolean,auto:boolean):boolean {
  if(auto&&value==='auto')return true;
  if(typeof value==='number')return finite(value,negative?-8192:0,8192);
  if(typeof value!=='string')return false;
  const match=/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%)$/.exec(value);if(!match)return false;
  const limit=match[2]==='%'?100:8192;return finite(Number(match[1]),negative?-limit:0,limit);
}
function translation(value:unknown):boolean {
  if(value==='none')return true;if(typeof value!=='string')return false;
  const match=/^translate(X|Y)?\(\s*([^,()]+?)\s*(?:,\s*([^,()]+?)\s*)?\)$/.exec(value);if(!match)return false;
  const valid=(v:string)=>v==='0'||length(v,true,false);
  return valid(match[2]!)&&(match[1]?match[3]===undefined:match[3]===undefined||valid(match[3]));
}
export function validateUiLayout(value:unknown):asserts value is UiLayout {
  if(!record(value))throw new Error('UI_LAYOUT_INVALID');
  for(const [key,v]of Object.entries(value)){
    if(['top','right','bottom','left'].includes(key)){if(!length(v,true,true))throw new Error(`UI_LAYOUT_LENGTH_INVALID: ${key}`);}
    else if(['width','height'].includes(key)){if(!length(v,false,true))throw new Error(`UI_LAYOUT_SIZE_INVALID: ${key}`);}
    else if(['minWidth','maxWidth','minHeight','maxHeight'].includes(key)){if(!length(v,false,false))throw new Error(`UI_LAYOUT_SIZE_INVALID: ${key}`);}
    else if(key==='position'){if(v!=='absolute')throw new Error('UI_LAYOUT_POSITION_INVALID');}
    else if(key==='transform'){if(!translation(v))throw new Error('UI_LAYOUT_TRANSFORM_INVALID');}
    else if(key==='overflow'){if(!['visible','hidden'].includes(String(v)))throw new Error('UI_LAYOUT_OVERFLOW_INVALID');}
    else if(key==='zIndex'){if(!Number.isSafeInteger(v)||Math.abs(Number(v))>1000)throw new Error('UI_LAYOUT_Z_INDEX_INVALID');}
    else throw new Error(`UI_LAYOUT_UNSUPPORTED_FIELD: ${key}`);
  }
}
export interface ResolvedUiLayout {
  referenceBox:{left:number;top:number;width:number;height:number};
  style:UiLayout & {position:'absolute'};
}
export function resolveUiLayout(layout:UiLayout,viewport:{width:number;height:number},safeArea:UiInsets={},reference:UiLayoutReference='safe-area'):ResolvedUiLayout {
  validateUiLayout(layout);validateUiInsets(safeArea);
  if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<=0||viewport.height<=0)throw new Error('UI_LAYOUT_VIEWPORT_INVALID');
  if(!['safe-area','viewport'].includes(reference))throw new Error('UI_LAYOUT_REFERENCE_INVALID');
  const safe=reference==='viewport'?{}:safeArea;
  const left=Math.min(viewport.width,safe.left??0),top=Math.min(viewport.height,safe.top??0);
  return {referenceBox:{left,top,width:Math.max(0,viewport.width-left-(safe.right??0)),height:Math.max(0,viewport.height-top-(safe.bottom??0))},style:{...layout,position:'absolute'}};
}
