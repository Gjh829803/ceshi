import {expect,it,vi} from 'vitest';
import {createRecordingControls,type RecordingControlsState} from './recording-controls';

function fixture(){
 type Recorder=Parameters<typeof createRecordingControls>[0];
 const snapshot:ReturnType<Recorder['inspect']>={enabled:false,busy:false,replaying:false,lastError:null,savedRecording:null,replayOperation:null,recentInputTicks:0,frame:null,recording:null};
 let state:RecordingControlsState;
 const recorder={inspect:()=>snapshot,start:vi.fn(async()=>{
  snapshot.recording={id:'trace',status:'recording',events:1,inputTicks:0,elapsedSeconds:0,maximumSeconds:120,invalidReason:null,source:{head:'head',sourceHash:'hash',serverId:'server',revision:1}};
  return {status:'prepared'};
 }),stop:vi.fn(async()=>{
  snapshot.recording!.status='stopped';snapshot.savedRecording={recordingId:'trace',bundleId:'bundle',replayable:true,inputTicks:60};
  return {status:'saved',replayable:true};
 }),setHistory:vi.fn(async()=>{snapshot.enabled=true;return {status:'applied'};}),capture:vi.fn(async()=>({status:'saved'}))};
 const port={ready:()=>true,paused:()=>false,resume:vi.fn(),publish:(s:RecordingControlsState)=>{state=s;},notify:vi.fn()};
 const controls=createRecordingControls(recorder as unknown as Recorder,port);
 return {controls,recorder,port,snapshot,state:()=>state!};
}
it('confirms reset before starting, resumes only after preparation, and saves on the next action',async()=>{
 const f=fixture();await f.controls.record();expect(f.state().confirmStart).toBe(true);expect(f.recorder.start).not.toHaveBeenCalled();
 f.controls.cancelStart();await f.controls.start();expect(f.recorder.start).not.toHaveBeenCalled();
 await f.controls.record();await f.controls.start();expect(f.port.resume).toHaveBeenCalledOnce();expect(f.state().recordLabel).toBe('停止并保存');
 await f.controls.record();expect(f.recorder.stop).toHaveBeenCalledOnce();expect(f.state()).toMatchObject({saved:true,status:'录制已保存 · 可回放',recordLabel:'重新录制'});
 await f.controls.record();expect(f.state().confirmStart).toBe(true);expect(f.recorder.start).toHaveBeenCalledOnce();
});
it('shows failed preparation without resuming or claiming a recording',async()=>{
 const f=fixture();f.recorder.start.mockRejectedValueOnce(Error('failure'));await f.controls.record();await f.controls.start();
 expect(f.port.resume).not.toHaveBeenCalled();expect(f.state()).toMatchObject({busy:false,saved:false,recordLabel:'开始录制'});expect(f.state().error).toContain('未完成');
});
it('preserves the stopped trace for retry when saving fails',async()=>{
 const f=fixture();await f.controls.record();await f.controls.start();
 f.recorder.stop.mockImplementationOnce(async()=>{f.snapshot.recording!.status='stopped';throw Error('offline');});
 await f.controls.record();expect(f.state()).toMatchObject({saved:false,recordLabel:'保存录制'});
 await f.controls.record();expect(f.recorder.start).toHaveBeenCalledOnce();expect(f.state()).toMatchObject({saved:true,error:''});
});
it('reflects duration limits and externally saved invalid traces without a reset',async()=>{
 const f=fixture();await f.controls.record();await f.controls.start();
 Object.assign(f.snapshot.recording!,{status:'limit-reached',elapsedSeconds:120});f.controls.sync();
 expect(f.state()).toMatchObject({recordLabel:'保存录制',elapsedSeconds:120,status:'已到录制上限 · 待保存'});
 Object.assign(f.snapshot.recording!,{invalidReason:'simulation-tick-discontinuity'});
 f.snapshot.savedRecording={recordingId:'trace',bundleId:'external',replayable:false,inputTicks:120};f.controls.sync();
 expect(f.state()).toMatchObject({saved:true,status:'录制已保存 · 不可回放'});expect(f.recorder.start).toHaveBeenCalledOnce();
});
it('allows abandoning an unsavable trace only after a fresh confirmation',async()=>{
 const f=fixture();await f.controls.record();await f.controls.start();
 f.recorder.stop.mockImplementationOnce(async()=>{f.snapshot.recording!.status='stopped';return {status:'failed',error:'DEBUG_SOURCE_CHANGED'} as any;});
 await f.controls.record();expect(f.state()).toMatchObject({saved:false,canRestart:true,error:'录制期间代码发生变化，请重新录制。'});
 f.controls.requestRestart();expect(f.state()).toMatchObject({confirmStart:true,replacingUnsaved:true});expect(f.recorder.start).toHaveBeenCalledOnce();
 f.controls.cancelStart();expect(f.snapshot.recording).not.toBeNull();
 f.controls.requestRestart();await f.controls.start();expect(f.recorder.start).toHaveBeenCalledTimes(2);
});
it('keeps snapshots separate from full recordings and suppresses duplicate busy requests',async()=>{
 const f=fixture();await f.controls.snapshot();expect(f.recorder.setHistory).toHaveBeenCalledWith({enabled:true});
 await f.controls.snapshot();expect(f.recorder.capture).toHaveBeenCalledWith({pause:true});expect(f.recorder.start).not.toHaveBeenCalled();
 f.snapshot.busy=true;await f.controls.record();expect(f.state().confirmStart).toBe(false);
});
