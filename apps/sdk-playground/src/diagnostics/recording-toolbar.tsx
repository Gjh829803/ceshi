import React from 'react';
import {Button} from '../components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {Hint} from '../components/hint';
import type {RecordingControlsState} from './recording-controls';

const time=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export function RecordingToolbar({state:s,action}:{state:RecordingControlsState;action:(id:string)=>void}){
 return <div className="recording-tools">
  <Button id="debugRecordButton" variant="secondary" className="subtle-button debug-record-button" aria-keyshortcuts="F8"
   aria-label={s.recordLabel} aria-busy={s.busy} disabled={s.busy}
   data-state={s.recording?'recording':s.saved?'saved':'idle'} onClick={()=>action('debugRecordButton')}>
   {s.recording&&<span className="recording-dot" aria-hidden="true"/>}
   {s.busy?'处理中…':s.recordLabel} <kbd aria-hidden="true">F8</kbd>
  </Button>
  {s.canRestart&&<Button variant="secondary" className="subtle-button" disabled={s.busy} onClick={()=>action('debugRecordingRestart')}>放弃并重录</Button>}
  <Hint side="bottom" content="现场快照保存截图、当前状态和最近操作，不重置场景；它不能代替从起点开始的完整录制。">
   <Button id="debugSnapshotButton" variant="secondary" className="subtle-button" disabled={s.busy||(s.historyEnabled&&!s.hasFrame)}
    aria-label={s.historyEnabled?'保存现场快照':'开启快照缓存'} onClick={()=>action('debugSnapshotButton')}>
    {s.historyEnabled?'保存快照':'启用快照'}
   </Button>
  </Hint>
  {(s.recording||s.saved||s.canRestart||s.error)&&<div className="recording-status" aria-label="录制状态">
   <span className="recording-time" aria-live="off">{time(s.elapsedSeconds)} / {time(s.maximumSeconds)}</span>
   <span role="status">{s.error||s.status}</span>
  </div>}
  <Dialog open={s.confirmStart} onOpenChange={open=>{if(!open)action('debugRecordingCancel');}}>
   <DialogContent className="recording-start-dialog">
    <DialogTitle>开始完整录制</DialogTitle>
    <DialogDescription>将重置场景中的车辆和物件，并保留人物当前位置作为回放起点。最长录制 2 分钟，保存后暂停。</DialogDescription>
    {s.replacingUnsaved&&<p>当前尚未保存的录制将被替换。如需保留，请取消并先保存。</p>}
    <p>车辆问题请先下车，开始录制后再按 F 上车。录制期间请勿复位、切换场景或刷新页面。</p>
    <div className="recording-dialog-actions">
     <Button variant="outline" onClick={()=>action('debugRecordingCancel')}>取消</Button>
     <Button onClick={()=>action('debugRecordingStart')} disabled={s.busy}>重置并开始录制</Button>
    </div>
   </DialogContent>
  </Dialog>
 </div>;
}
