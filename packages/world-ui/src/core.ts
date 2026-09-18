import { applyPatch, compare, type Operation } from 'fast-json-patch';
import { clone, pointerParts, resolveValue, trackKey, validateDocument, validateTrack,
  type AnimationTrack,type UiCatalog,type UiCommit,type UiDocument,type UiSnapshot,type UiState } from './schema.js';
export type { AnimationTrack,UiCommit,UiSnapshot,UiState } from './schema.js';

export function evaluateAnimation(track:AnimationTrack,timeUs:number):number {
  const p=track.durationUs===0?1:Math.max(0,Math.min(1,(timeUs-track.startSourceTimeUs)/track.durationUs));
  const t=track.easing==='easeOut'?1-(1-p)**3:p;return track.from+(track.to-track.from)*t;
}
export function applyUiCommit(snapshot:UiSnapshot,commit:UiCommit):UiSnapshot {
  clone(commit);
  if(commit.baseRevision!==snapshot.revision||commit.revision!==commit.baseRevision+1||!Number.isSafeInteger(commit.effectiveSourceTimeUs)||commit.effectiveSourceTimeUs<snapshot.effectiveSourceTimeUs)throw new Error('UI_REVISION_GAP');
  for(const patch of commit.statePatch){if(!['add','replace','remove'].includes(patch.op))throw new Error('UI_PATCH_UNSUPPORTED');pointerParts(patch.path);}
  const candidate=clone(snapshot);
  candidate.state=applyPatch(candidate.state,clone(commit.statePatch) as Operation[],true,true,true).newDocument;
  if(!candidate.state||typeof candidate.state!=='object'||Array.isArray(candidate.state))throw new Error('UI_STATE_INVALID');
  const tracks=new Map(candidate.activeAnimations.map(t=>[trackKey(t.nodeInstanceId,t.property),t]));
  for(const op of commit.animationOps){
    if(op.op==='replace'){validateTrack(op.track);if(op.track.startSourceTimeUs!==commit.effectiveSourceTimeUs)throw new Error('UI_TRACK_TIME');tracks.set(trackKey(op.track.nodeInstanceId,op.track.property),clone(op.track));}
    else if(op.op==='cancel')tracks.delete(trackKey(op.nodeInstanceId,op.property));else throw new Error('UI_ANIMATION_OP');
  }
  return {revision:commit.revision,effectiveSourceTimeUs:commit.effectiveSourceTimeUs,completeThroughUs:commit.effectiveSourceTimeUs,state:candidate.state,activeAnimations:[...tracks.values()].filter(t=>t.startSourceTimeUs+t.durationUs>commit.effectiveSourceTimeUs)};
}

/** Source-side observer. It never writes gameplay state or owns a simulation clock. */
export class UiRecorder {
  private current:UiSnapshot;
  constructor(private readonly document:UiDocument,private readonly catalog:UiCatalog,initialState:UiState,timeUs=0){
    validateDocument(document,catalog,initialState);
    this.current={revision:0,effectiveSourceTimeUs:timeUs,completeThroughUs:timeUs,state:clone(initialState),activeAnimations:[]};
  }
  sample(state:UiState,timeUs:number):{snapshot:UiSnapshot;commit?:UiCommit}{
    if(!Number.isSafeInteger(timeUs)||timeUs<this.current.completeThroughUs)throw new Error('UI_TIME_REGRESSION');
    validateDocument(this.document,this.catalog,state);
    const patches=compare(this.current.state,state);
    if(!patches.length){this.current.completeThroughUs=timeUs;this.current.activeAnimations=this.current.activeAnimations.filter(t=>t.startSourceTimeUs+t.durationUs>timeUs);return {snapshot:this.snapshot(timeUs)};}
    const revision=this.current.revision+1,animationOps:UiCommit['animationOps']=[];
    for(const [id,rules]of Object.entries(this.document.transitions)){
      const element=this.document.spec.elements[id]!;
      const before=resolveValue(element.props,this.current.state) as UiState,after=resolveValue(element.props,state) as UiState;
      for(const [prop,rule]of Object.entries(rules)){
        if(before[prop]===after[prop])continue;
        if(typeof before[prop]!=='number'||typeof after[prop]!=='number')throw new Error('UI_ANIMATION_VALUE');
        const previous=this.current.activeAnimations.find(t=>t.nodeInstanceId===id&&t.property===rule.targetProperty);
        animationOps.push({op:'replace',track:{animationId:`${revision}:${id}:${prop}`,nodeInstanceId:id,property:rule.targetProperty,startSourceTimeUs:timeUs,durationUs:Math.round(rule.durationMs*1000),from:previous?evaluateAnimation(previous,timeUs):before[prop],to:after[prop],easing:rule.easing,fill:'forwards'}});
      }
    }
    const commit:UiCommit={baseRevision:this.current.revision,revision,effectiveSourceTimeUs:timeUs,statePatch:patches as UiCommit['statePatch'],animationOps};
    this.current=applyUiCommit(this.current,commit);return {snapshot:this.snapshot(timeUs),commit};
  }
  snapshot(timeUs=this.current.completeThroughUs):UiSnapshot {return clone({...this.current,effectiveSourceTimeUs:timeUs,completeThroughUs:timeUs});}
}

/** Bounded checkpoints: never uses a later snapshot to render an earlier frame. */
export class UiHistory {
  private snapshots:UiSnapshot[]=[];
  constructor(private readonly capacity=256){}
  clear():void{this.snapshots=[];}
  add(snapshot:UiSnapshot):void {
    clone(snapshot);
    if(!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||!Number.isSafeInteger(snapshot.effectiveSourceTimeUs)||snapshot.effectiveSourceTimeUs<0||snapshot.completeThroughUs<snapshot.effectiveSourceTimeUs)throw new Error('UI_SNAPSHOT_INVALID');
    for(const t of snapshot.activeAnimations)validateTrack(t);
    const old=this.snapshots.find(s=>s.revision===snapshot.revision&&s.effectiveSourceTimeUs===snapshot.effectiveSourceTimeUs);
    if(old){if(JSON.stringify(old)!==JSON.stringify(snapshot))throw new Error('UI_SNAPSHOT_CONFLICT');return;}
    this.snapshots.push(clone(snapshot));this.snapshots.sort((a,b)=>a.effectiveSourceTimeUs-b.effectiveSourceTimeUs);
    while(this.snapshots.length>this.capacity)this.snapshots.shift();
  }
  commit(commit:UiCommit):void {
    const base=[...this.snapshots].reverse().find(s=>s.revision===commit.baseRevision&&s.effectiveSourceTimeUs<=commit.effectiveSourceTimeUs);
    if(!base)throw new Error('UI_REVISION_GAP');this.add(applyUiCommit(base,commit));
  }
  at(revision:number,timeUs:number):UiSnapshot|undefined {
    const item=[...this.snapshots].reverse().find(s=>s.revision===revision&&s.effectiveSourceTimeUs<=timeUs);
    return item?clone(item):undefined;
  }
}
