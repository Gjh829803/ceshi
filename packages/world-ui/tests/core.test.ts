import {describe,it,expect} from 'vitest';
import {UiRecorder,UiHistory,applyUiCommit,evaluateAnimation} from '../src/core.js';
import {validateDocument,type UiCatalog,type UiDocument} from '../src/schema.js';

const catalog:UiCatalog={schemaVersion:1,catalogId:'test',components:{Bar:{propsSchema:{type:'object',required:['value'],additionalProperties:false,properties:{value:{type:'number'}}},bindableProps:['value'],animatableProps:{value:{presentationProperty:'fill',fallbackProp:'value',interpolation:'number'}},events:[],slots:[]}},actions:{}};
const doc:UiDocument={schemaVersion:1,catalogId:'test',designViewport:{width:1280,height:720},spec:{root:'bar',elements:{bar:{type:'Bar',props:{value:{$state:'/health'}},children:[]}}},transitions:{bar:{value:{targetProperty:'fill',durationMs:300,easing:'linear',interrupt:'from-current'}}}};
describe('source-timed UI transactions',()=>{
  it('retargets from the source-time value and resumes without restarting',()=>{
    const source=new UiRecorder(doc,catalog,{health:100});
    source.sample({health:60},1_000_000);
    const next=source.sample({health:40},1_150_000);
    const t=next.snapshot.activeAnimations[0]!;
    expect(t.from).toBe(80);expect(t.to).toBe(40);
    expect(evaluateAnimation(t,1_300_000)).toBe(60);
    const restored=new UiHistory();restored.add(source.snapshot(1_300_000));
    expect(restored.at(2,1_200_000)).toBeUndefined();
    expect(evaluateAnimation(restored.at(2,1_300_000)!.activeAnimations[0]!,1_300_000)).toBe(60);
  });
  it('does not apply a half-valid patch or skip revisions',()=>{
    const source=new UiRecorder(doc,catalog,{health:100});const before=source.snapshot();
    const next=source.sample({health:60},1_000).commit!;
    expect(()=>applyUiCommit(before,{...next,statePatch:[...next.statePatch,{op:'replace',path:'/absent/value',value:1}]})).toThrow();
    expect(before.state).toEqual({health:100});
    expect(()=>applyUiCommit(before,{...next,baseRevision:5,revision:6})).toThrow('UI_REVISION_GAP');
    expect(()=>applyUiCommit(before,{...next,statePatch:[{op:'add',path:'/__proto__/owned',value:true}]})).toThrow('UI_UNSAFE_PATH');
    expect(({} as {owned?:boolean}).owned).toBeUndefined();
  });
  it('does not replay a finished tween or use future UI for old video',()=>{
    const source=new UiRecorder(doc,catalog,{health:100});source.sample({health:60},1000);
    const snapshot=source.sample({health:60},401000).snapshot;
    expect(snapshot.activeAnimations).toEqual([]);
    const history=new UiHistory(2);history.add(snapshot);
    expect(history.at(snapshot.revision,1000)).toBeUndefined();
  });
  it('rejects undefined components, graph cycles and invalid props',()=>{
    expect(()=>validateDocument({...doc,spec:{...doc.spec,elements:{bar:{type:'Unknown',props:{},children:[]}}}},catalog)).toThrow();
    expect(()=>validateDocument(doc,catalog,{health:'not a number'})).toThrow('UI_PROPS');
  });
});
