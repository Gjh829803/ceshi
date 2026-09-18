import {UiHistory} from '@worldkit/world-ui/core';
import type {UiSnapshot,UiCommit} from '@worldkit/world-ui/schema';
import {validateFrame,type FrameHeader} from '@worldkit/stream-protocol';

/** No DOM or media codec dependency. State becomes visible only through a selected source frame. */
export class PresentationCoordinator {
  readonly history=new UiHistory();
  private lastTime=-1;private mediaGeneration=-1;
  constructor(readonly sessionId:string,private epoch:number){}
  reset(epoch:number):void{this.epoch=epoch;this.lastTime=-1;this.mediaGeneration=-1;this.history.clear();}
  snapshot(snapshot:UiSnapshot):void{this.history.add(snapshot);}
  commit(commit:UiCommit):void{this.history.commit(commit);}
  select(frame:FrameHeader):UiSnapshot|undefined {
    validateFrame(frame);
    if(frame.sessionId!==this.sessionId||frame.epoch!==this.epoch||frame.mediaGeneration<this.mediaGeneration)return;
    if(frame.source.sourceTimeUs<this.lastTime)return;
    const snapshot=this.history.at(frame.uiRevision,frame.source.sourceTimeUs);
    if(!snapshot||frame.uiCompleteThroughUs<frame.source.sourceTimeUs)return;
    this.mediaGeneration=frame.mediaGeneration;this.lastTime=frame.source.sourceTimeUs;return snapshot;
  }
}
