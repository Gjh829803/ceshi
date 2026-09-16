import type {createDebugRecording} from '@worldkit/three/debug';

type Recorder=Pick<ReturnType<typeof createDebugRecording>,'inspect'|'start'|'stop'|'setHistory'|'capture'>;
export interface RecordingControlsState {
 busy:boolean;confirmStart:boolean;canRestart:boolean;replacingUnsaved:boolean;recordLabel:string;recording:boolean;saved:boolean;
 elapsedSeconds:number;maximumSeconds:number;status:string;error:string;
 historyEnabled:boolean;hasFrame:boolean;
}
export function recordingError(message:string):string {
 if(message.includes('REQUIRES_ON_FOOT'))return '请先下车或结束当前交互，再开始完整录制。';
 if(message.includes('REQUIRES_FOLLOW'))return '请先切回游玩摄像机，再开始完整录制。';
 if(message.includes('START_BLOCKED'))return '当前位置无法作为回放起点，请移到空旷位置再试。';
 if(message.includes('SOURCE_CHANGED'))return '录制期间代码发生变化，请重新录制。';
 if(message.includes('FRAME_UNAVAILABLE'))return '尚无快照画面，请继续运行一帧后再保存。';
 if(message.includes('WORLD_NOT_READY'))return '场景仍在加载，请稍后再试。';
 return '操作未完成，数据尚未保存，请重试。';
}

/** UI intent and status only; all recording, reset and clock work stays in the SDK. */
export function createRecordingControls(recorder:Recorder,port:{
 ready():boolean;paused():boolean;resume():void;
 publish(state:RecordingControlsState):void;notify(message:string):void;
}){
 let working=false,confirmStart=false,error='',previous='';
 const sync=()=>{
  const s=recorder.inspect(),r=s.recording,saved=!!r&&s.savedRecording?.recordingId===r.id&&r.status!=='recording';
  const recording=r?.status==='recording',pending=!!r&&!saved;
  const status=saved?(s.savedRecording!.replayable?'录制已保存 · 可回放':'录制已保存 · 不可回放')
   :r?.invalidReason?'录制已失效 · 保存后不可回放'
   :r?.status==='limit-reached'?'已到录制上限 · 待保存'
   :recording?(port.paused()?'录制已就绪 · 已暂停':'正在录制 · 含回放起点')
   :pending?'录制已停止 · 待保存':'完整录制包含起点和操作轨迹';
  const state:RecordingControlsState={canRestart:pending&&!recording,replacingUnsaved:confirmStart&&pending,busy:working||s.busy||!port.ready(),confirmStart,
   recordLabel:recording?'停止并保存':pending?'保存录制':saved?'重新录制':'开始录制',recording,saved,
   elapsedSeconds:Math.floor(r?.elapsedSeconds??0),maximumSeconds:r?.maximumSeconds??120,status,error:error|| (s.lastError?recordingError(s.lastError):''),
   historyEnabled:s.enabled,hasFrame:!!s.frame};
  const key=JSON.stringify(state);if(key!==previous){previous=key;port.publish(state);}return state;
 };
 const run=async(work:()=>Promise<unknown>)=>{
  if(working||recorder.inspect().busy||!port.ready())return;
  working=true;error='';sync();
  try{await work();}catch{error='操作未完成，数据尚未保存，请重试。';port.notify(error);}
  finally{working=false;sync();}
 };
 const failed=(result:{error?:unknown})=>{if(!('error' in result))return false;error=recordingError(String(result.error));port.notify(error);return true;};
 const record=async()=>{
  const state=sync();if(state.busy)return;
  if(!recorder.inspect().recording||state.saved){confirmStart=true;error='';sync();return;}
  await run(async()=>{const result=await recorder.stop();if('error' in result&&failed(result))return;
   if(result.status==='saved')port.notify('replayable' in result&&result.replayable?'完整录制已保存，可交给 AI 回放定位。':'录制已保存，但轨迹不可回放；现场仍可用于排查。');});
 };
 const start=async()=>{
  if(!confirmStart)return;confirmStart=false;
  await run(async()=>{const result=await recorder.start({maximumSeconds:120});if('error' in result&&failed(result))return;
   if(result.status==='prepared'){port.resume();port.notify('完整录制已开始。复现后按 F8 停止并保存；录制期间请勿复位或切换场景。');}});
 };
 const snapshot=()=>run(async()=>{
  if(!recorder.inspect().enabled){const result=await recorder.setHistory({enabled:true});if('error' in result&&failed(result))return;
   port.notify('快照缓存已开启。继续运行，异常出现后点击「保存快照」；快照本身不包含完整回放起点。');return;}
  const result=await recorder.capture({pause:true});if('error' in result&&failed(result))return;
  if(result.status==='saved')port.notify('现场快照已保存，游戏已暂停。完整操作轨迹请使用「开始录制」。');
 });
 sync();return {sync,record,start,snapshot,requestRestart:()=>{if(sync().busy)return;confirmStart=true;error='';sync();},cancelStart:()=>{confirmStart=false;sync();}};
}
