import { humanoid } from '@worldkit/three';
const { emptyInput }=humanoid;
type Input=humanoid.Input;
import type { CharacterTrial } from '../environment/types';

type HumanoidController=humanoid.HumanoidController;

const { SWIM_ROOT_DEPTH }=humanoid;

/** UI/demo readiness only; the controller rechecks the probe and motion path. */
export function humanoidTraversalReady(h:HumanoidController|undefined):boolean {
  if(!h||!h.probe||h.probe.kind==='blocked'||h.cooldown>0||h.traversal||h.stance!=='stand'
    ||h.skills.active||h.skills.carrying||h.skills.seated||h.surface.mode!=='none')return false;
  if(h.swimming)return !!h.water&&Math.abs(h.position.y-(h.water.surfaceY-SWIM_ROOT_DEPTH))<.2
    &&Math.abs(h.vertical)<2&&h.probe.top.y>=h.water.surfaceY-.1;
  return h.grounded;
}

/** Bounded source-style demonstrations, interruptible by ordinary input. */
export class HumanoidDemo {
  elapsed=0;readonly duration:number;
  private traversalRequested=false;
  constructor(readonly trial:CharacterTrial,readonly startEvent=0){this.duration=trial.id==='tall-stairs'?32:trial.action==='prone'?12:trial.action==='stair'?12:trial.action==='surface'||trial.action==='ladder'?6.5:8;}
  completed(position:{y:number;z:number}){const c=this.trial.completion;return !!c&&(c.minY===undefined||position.y>c.minY)&&(c.minZ===undefined||position.z>c.minZ)&&(c.maxZ===undefined||position.z<c.maxZ);}
  step(dt:number,traversalReady=false):Input|null {
    const previous=this.elapsed;this.elapsed+=dt;if(this.elapsed>this.duration)return null;
    const t=this.elapsed,i=emptyInput(),pulse=(at:number)=>previous<at&&t>=at;i.forward=1;i.actions={};
    switch(this.trial.action){
      case 'traverse':case 'swim':
        if(traversalReady&&!this.traversalRequested){i.jump=true;this.traversalRequested=true;}
        break;
      case 'jump':i.boost=true;i.jump=pulse(.55);break;
      case 'crouch':i.actions.toggleCrouch=pulse(.1);i.slow=true;break;
      case 'roll':i.forward=t<.25?1:0;i.actions.roll=pulse(.3);break;
      case 'slide':i.actions.slide=pulse(.75);break;
      case 'pickup':i.forward=0;i.actions.interact=pulse(.2);i.steer=t>1.8&&t<3.5?-1:0;break;
      case 'sit':i.forward=0;i.actions.interact=pulse(.2)||pulse(3.5);break;
      case 'prone':i.forward=t<1.6?0:1;i.actions.prone=pulse(.15);break;
      case 'surface':case 'ladder':i.forward=t<1.2?0:t<3.4?1:t<4.8?0:-1;i.steer=this.trial.action==='surface'&&t>=3.4&&t<4.8?1:0;i.actions.climb=pulse(.2);i.jump=pulse(5.7);break;
      case 'turn':i.forward=t<1.2?1:t<1.8?0:t<3?-1:t<3.6?0:t<4.8?1:0;break;
      case 'stair':i.slow=true;break;
    }return i;
  }
}
