import {ACTION_MANIFEST,type SkillRequest,type SkillResult} from './action-schema';
import type {HumanoidController as Simulation} from './controller';

/** Host adapter: expose these JSON methods as Agent tools, never raw key presses. */
export function createActionBridge(getSimulation:()=>Simulation,canExecute=()=>true){
  const owners=new Map<string,Simulation>();
  const archived=new Map<string,SkillResult>();
  const getStatus=(requestId:string):SkillResult|null=>{
    const existing=archived.get(requestId);if(existing)return {...existing};
    const owner=owners.get(requestId),result=owner?.skills.status(requestId)??null;
    // A disposed world's Rapier objects must never be touched by a later poll
    // or cancellation. Reading the action result map is independent of Rapier.
    if(owner&&owner!==getSimulation()&&result?.status==='running'){
      const closed:SkillResult={...result,status:'cancelled',code:'WORLD_CHANGED',message:'场地已切换，之前的动作已终止；请重新查询当前目标'};
      archived.set(requestId,closed);return {...closed};
    }
    return result;
  };
  return {
    describe:()=>structuredClone(ACTION_MANIFEST),
    listTargets:()=>getSimulation().skills.listTargets(),
    execute:(request:SkillRequest):SkillResult=>{
      if(!canExecute()||getSimulation().isMounted)return {requestId:request?.requestId??'',action:request?.action??'',status:'rejected',code:'SIMULATION_PAUSED',message:'先关闭操作窗口并恢复模拟，再执行动作'};
      const sim=getSimulation(),owner=owners.get(request?.requestId);
      if(owner&&owner!==sim)return {requestId:request.requestId,action:request.action,status:'rejected',code:'STALE_WORLD_REQUEST',message:'该 requestId 属于之前的场地；请重新查询目标并使用新的 requestId'};
      const result=sim.skills.request(request);
      if(result.code!=='INVALID_REQUEST')owners.set(result.requestId,sim);
      while(owners.size>128){
        const old=[...owners.keys()].find(id=>getStatus(id)?.status!=='running');
        if(!old)break;owners.delete(old);archived.delete(old);
      }
      return result;
    },
    getStatus,
    cancel:(requestId:string)=>{
      const result=getStatus(requestId),owner=owners.get(requestId);
      if(!owner||owner!==getSimulation()||result?.status!=='running')return result;
      if(!canExecute()||getSimulation().isMounted)return null;
      return owner.skills.cancel(requestId)??null;
    },
  };
}
