import type {EnvironmentBox} from './types';
import {block,ramp} from './modules';
export function launchAccess(cx:number,deckBack:number,height=120):EnvironmentBox[]{
 const out:EnvironmentBox[]=[],cz=deckBack-15,flights=24,rise=height/flights;
 for(let n=0;n<flights;n++){
  const sign=n%2===0?1:-1,x=cx+(n%2===0?-2:2),start=n*rise;
  out.push(ramp(`launch-access-ramp-${n}`,x,cz,3.6,12,sign*rise,start+(sign<0?rise:0),'#91acb4'));
  const end=cz+sign*7.5;
  out.push(block(`launch-access-landing-${n}`,[cx,(n+1)*rise-.15,end],[8,.3,3]));
  for(const dx of [-1.8,1.8]){const rail=ramp(`launch-access-rail-${n}-${dx}`,x+dx,cz,.12,12,sign*rise,start+(sign<0?rise:0)+1,'#dfb15f');rail.size=[.12,1,Math.hypot(12,rise)];rail.position=[rail.position[0],rail.position[1]-.35,rail.position[2]];out.push(rail);}
  out.push(block(`launch-access-end-rail-${n}`,[cx,(n+1)*rise+.5,end+sign*1.5],[8,1,.12],'#dfb15f'));
 }
 out.push(block('launch-access-base',[cx-.2,-.15,cz-8],[8,.3,4]));
 out.push(block('launch-access-bridge',[cx-2,height-.15,deckBack-10.5],[3.6,.3,21]));
 for(const x of [cx-3.8,cx-.2])out.push(block(`launch-access-bridge-rail-${x}`,[x,height+.5,deckBack-10.5],[.12,1,21],'#dfb15f'));
 return out;
}


/** 双向贯通轿厢；地面从后方进入，顶层向前走出。 */
export function launchLift(cx:number,back:number){
 const x=cx+10,z=back-3,id='launch-lift';
 const boxes=[block('lift-floor',[x,-.05,z],[6,.3,6],'#72aeb9'),block('lift-roof',[x,3.6,z],[6,.2,6])];
 for(const side of [-1,1])boxes.push(block(`lift-side-${side}`,[x+side*2.95,1.7,z],[.1,3.4,6],'#d4b06b'));
 for(const b of boxes)b.liftId=id;
 for(const side of [-1,1])boxes.push(block(`lift-guide-${side}`,[x+side*3.2,60,z],[.2,120,.3],'#819ca5'));
 return {boxes,lift:{id,position:[x,0,z] as const,height:120,speed:10}};
}
