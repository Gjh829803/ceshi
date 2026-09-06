import {describe,it,expect} from 'vitest';
import {selectTriviewTargets} from './capture-plan.js';
const targets=['player','10','2','landmark','vehicle','animal','gate'].map(id=>({id,sourceEntityId:id}));
describe('ordered primary five object sheets',()=>{
 it('preserves explicit importance order, counting subject but not the separate opening',()=>{
  const plan=selectTriviewTargets(targets);
  expect(plan.selectedTargets.map(value=>value.id)).toEqual(['player','10','2','landmark','vehicle']);
  expect(plan.conditioningEntityIds).toEqual(['player','10','2','landmark','vehicle']);
  expect(plan.omittedEntityIds).toEqual(['animal','gate']);
 });
 it('can capture additional declared targets while keeping conditioning limited and ordered',()=>{
  const plan=selectTriviewTargets(targets,true);
  expect(plan.selectedTargets).toEqual(targets);expect(plan.conditioningEntityIds).toHaveLength(5);expect(plan.omittedEntityIds).toEqual([]);
  expect(selectTriviewTargets(targets.slice(0,1)).conditioningEntityIds).toEqual(['player']);
 });
 it('rejects missing subject, duplicated target identity and ambiguous all-target requests',()=>{
  for(const list of [[],targets.slice(1),[targets[0]!,targets[0]!]])expect(()=>selectTriviewTargets(list)).toThrow('THREE_CAPTURE_PLAN_INVALID');
  expect(()=>selectTriviewTargets(targets,'yes' as any)).toThrow('THREE_CAPTURE_PLAN_INVALID');
  const large=[targets[0]!,...Array.from({length:100},(_,i)=>({id:'target-'+i,sourceEntityId:'target-'+i}))];
  expect(selectTriviewTargets(large).selectedTargets).toHaveLength(5);
  expect(()=>selectTriviewTargets(large,true)).toThrow('THREE_CAPTURE_TARGET_BUDGET_EXCEEDED');
 });
});
