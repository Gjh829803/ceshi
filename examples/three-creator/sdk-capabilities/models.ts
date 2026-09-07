import * as T from 'three';
import type { VehicleSpec } from './config';
import { buildCreatureVisual, type CreatureVisual } from './creatures/visual';
export const material=(color:string|number,metalness=.05,roughness=.65)=>new T.MeshStandardMaterial({color,metalness,roughness});
const dark=material('#25313a',.3),rubber=material('#172128',0,.9),chrome=material('#bfced5',.6,.27),glass=new T.MeshPhysicalMaterial({color:'#9adddf',transparent:true,opacity:.25,roughness:.1,metalness:.3,side:T.DoubleSide});
export function box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,mat:T.Material){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function ball(parent:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:T.Material){const m=new T.Mesh(new T.SphereGeometry(1,24,16),mat);m.scale.set(sx,sy,sz);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
function rod(parent:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,mat:T.Material){const d=b.clone().sub(a);const m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),10),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());m.castShadow=true;parent.add(m);return m;}
export interface WheelRig { steering:T.Group; spin:T.Group; radius:number }
export interface VehicleVisual {root:T.Group;seat:T.Group;wheels:T.Object3D[];wheelRigs:WheelRig[];rotors:T.Object3D[];steering:T.Object3D[];engine:T.Mesh[];label:T.Sprite;creature?:CreatureVisual}
export function labelSprite(text:string,color='#233746',width=5,height=.9):T.Sprite {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const c=canvas.getContext('2d')!;
  c.fillStyle='rgba(245,250,251,.95)';c.beginPath();c.roundRect(0,0,768,128,20);c.fill();c.fillStyle=color;c.font='600 49px "Segoe UI", "Microsoft YaHei", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,65);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map,depthTest:true}));sprite.scale.set(width,height,1);return sprite;
}
export function buildVehicle(s:VehicleSpec):VehicleVisual {
  if(['horse','carriage','dragon'].includes(s.archetype)){
    const root=new T.Group(),creature=buildCreatureVisual(s);root.name=s.id;root.add(creature.content,creature.seat);
    const label=labelSprite(s.name);label.position.y=s.mode==='dragon'?6.8:3.9;root.add(label);
    return {root,seat:creature.seat,creature,label,wheels:[],wheelRigs:[],rotors:[],steering:[],engine:[]};
  }
  const root=new T.Group(),seat=new T.Group(),wheels:T.Object3D[]=[],wheelRigs:WheelRig[]=[],rotors:T.Object3D[]=[],steering:T.Object3D[]=[],engine:T.Mesh[]=[];
  const paint=material(s.color,.32,.34),accent=material('#f4f4ec',.1,.6);
  root.name=s.id;seat.position.set(...s.seat);root.add(seat);
  const tube=(a:number[],b:number[],r=.05,mat:T.Material=dark)=>rod(root,new T.Vector3(a[0],a[1],a[2]),new T.Vector3(b[0],b[1],b[2]),r,mat);
  function wheel(x:number,y:number,z:number,r=.45,w=.3) {
    // The axle steers around Y; its child rolls around local X. Mixing both on
    // one Euler rotation makes the axle wobble as the wheel spins.
    const pivot=new T.Group(),spin=new T.Group();pivot.position.set(x,y,z);pivot.add(spin);
    const m=new T.Mesh(new T.CylinderGeometry(r,r,w,20),rubber);m.rotation.z=Math.PI/2;spin.add(m);
    const rim=new T.Mesh(new T.CylinderGeometry(r*.56,r*.56,w+.02,10),chrome);rim.rotation.z=Math.PI/2;spin.add(rim);
    root.add(pivot);wheels.push(spin);wheelRigs.push({steering:pivot,spin,radius:r});return pivot;
  }
  function pilotSeat(y:number,z=0){box(root,.72,.13,.75,0,y,z,dark);box(root,.74,.72,.13,0,y+.35,z-.38,dark);}
  function thruster(x:number,y:number,z:number){const glow=new T.Mesh(new T.ConeGeometry(.18,.8,12),new T.MeshBasicMaterial({color:'#95f9ff',transparent:true,opacity:.65}));glow.rotation.x=-Math.PI/2;glow.position.set(x,y,z);root.add(glow);engine.push(glow);}
  const archetype=s.archetype;
  if(archetype==='rover'||archetype==='racer') {
    const sporty=archetype==='racer';const h=sporty?.5:.77;
    box(root,2,.25,3.8,0,.48+.125,0,paint);box(root,1.8,.25,1.3,0,h+.45,1.1,paint);
    for(const x of [-.91,.91])box(root,.18,.4,1.8,x,.88,0,paint);
    box(root,1.9,.18,.8,0,h+.5,-1.25,paint);pilotSeat(s.seat[1]);
    box(root,2.2,.2,.18,0,.5,2,dark);box(root,2.2,.2,.18,0,.5,-2,dark);
    for(const x of [-1.1,1.1])for(const z of [-1.27,1.27]){const w=wheel(x,sporty?.39:.52,z,sporty?.39:.52,sporty?.32:.4);if(z>0)steering.push(w);}
    for(const x of [-.93,.93]){tube([x,h+.5,-.6],[x,h+1.4,-.45],.055);tube([x,h+1.4,-.45],[x,h+1.4,.7],.055);tube([x,h+1.4,.7],[x,h+.5,1],.055);}
    box(root,1.7,.55,.025,0,h+1.05,.88,glass).rotation.x=-.25;
    if(sporty){box(root,2.6,.08,.5,0,1.3,-1.85,dark);tube([-.8,.8,-1.85],[-.8,1.3,-1.85]);tube([.8,.8,-1.85],[.8,1.3,-1.85]);}
    for(const x of [-.65,.65]){box(root,.45,.17,.06,x,.85,1.94,new T.MeshBasicMaterial({color:'#fff6d5'}));box(root,.3,.13,.05,x,.8,-1.94,new T.MeshBasicMaterial({color:'#fb6d5c'}));}
    tube([0,.9,.3],[0,1.1,.65]);const steerWheel=new T.Mesh(new T.TorusGeometry(.25,.03,8,24),dark);steerWheel.rotation.x=-.5;steerWheel.position.set(0,1.1,.65);root.add(steerWheel);
  } else if(archetype==='bike') {
    wheel(0,.48,-1.1,.48,.28);steering.push(wheel(0,.48,1.1,.48,.28));
    tube([0,.5,-1.1],[0,1,.4],.13,paint);tube([0,.5,-1.1],[0,.55,.5],.09);tube([0,.55,.5],[0,.48,1.1],.07,chrome);
    box(root,.52,.3,.9,0,.85,.2,paint);box(root,.54,.16,.95,0,.89,-.48,dark);
    tube([-.25,.45,1.1],[-.25,1.3,.8],.05,chrome);tube([.25,.45,1.1],[.25,1.3,.8],.05,chrome);tube([-.6,1.35,.85],[.6,1.35,.85],.05);
    ball(root,0,1.2,.9,.23,.2,.16,new T.MeshBasicMaterial({color:'#ffefcd'}));
  } else if(archetype==='slide') {
    box(root,.8,.18,2.1,0,.15,0,paint);box(root,.52,.035,1.35,0,.255,0,dark);
    for(const x of [-.34,.34])for(const z of [-.75,.75])wheel(x,.08,z,.09,.09);
    box(root,.65,.07,.28,0,.25,1,accent).rotation.x=-.23;
  } else if(archetype==='hover') {
    ball(root,0,.05,0,1.5,.35,2.1,paint);pilotSeat(.48,-.1);
    for(const x of [-1,1])for(const z of [-1.3,1.3]) {
      const ring=new T.Mesh(new T.TorusGeometry(.5,.12,10,24),dark);ring.rotation.x=Math.PI/2;ring.position.set(x,-.2,z);root.add(ring);
      const disk=new T.Mesh(new T.CircleGeometry(.41,24),new T.MeshBasicMaterial({color:'#a1fff4',transparent:true,opacity:.55,side:T.DoubleSide}));disk.rotation.x=-Math.PI/2;disk.position.set(x,-.22,z);root.add(disk);engine.push(disk);
    }
    box(root,1,.16,1,0,.4,1.3,paint);
  } else if(archetype==='boat') {
    ball(root,0,-.15,0,1.3,.55,2.6,paint);box(root,2.15,.2,3.2,0,.05,-.2,accent);pilotSeat(.35,-.3);
    box(root,1.6,.6,.08,0,.65,1,glass).rotation.x=-.25;box(root,.5,.8,.4,0,-.2,-2.6,dark);
    tube([-.9,.25,1.1],[-.65,.45,2],.025,chrome);tube([.9,.25,1.1],[.65,.45,2],.025,chrome);tube([-.65,.45,2],[.65,.45,2],.025,chrome);
  } else if(archetype==='sub') {
    ball(root,0,-.8,0,1.2,.55,2.7,paint);ball(root,0,.28,.65,.91,.94,1.34,glass);pilotSeat(.1,.5);
    box(root,3.5,.12,.9,0,-.2,-1.4,dark);box(root,.15,1.4,.8,0,.5,-2.1,paint);
    tube([0,.7,-.2],[0,1.65,-.2],.1);tube([0,1.65,-.2],[0,1.65,.2],.1);
    const prop=new T.Group();prop.position.set(0,-.3,-2.8);box(prop,.15,1.25,.12,0,0,0,dark);box(prop,1.25,.15,.12,0,0,0,dark);root.add(prop);rotors.push(prop);
    for(const x of [-.65,.65])ball(root,x,-.05,2.2,.12,.12,.1,new T.MeshBasicMaterial({color:'#e9fff9'}));
  } else if(archetype==='plane'||archetype==='glider') {
    const glider=archetype==='glider';
    ball(root,0,.12,0,.64,.28,3.25,paint);pilotSeat(s.seat[1],s.seat[2]);
    box(root,glider?11:8,.13,1.4,0,.3,-.2,accent);box(root,3.3,.1,.8,0,.65,-2.4,paint);box(root,.12,1.6,1,0,1.1,-2.5,paint);
    ball(root,0,.81,.55,.67,.7,1.2,glass);
    if(!glider){const prop=new T.Group();prop.position.set(0,.4,3.25);box(prop,2.8,.13,.08,0,0,0,dark);box(prop,.13,2.8,.08,0,0,0,dark);root.add(prop);rotors.push(prop);wheel(-1.1,.27,.5,.27,.2);wheel(1.1,.27,.5,.27,.2);wheel(0,.2,-2,.2,.15);}
    else {box(root,.6,.04,1,0,-.13,0,dark);}
    for(const x of [-3.9,3.9])ball(root,x,.65,0,.12,.09,.15,new T.MeshBasicMaterial({color:x<0?'#fb6a51':'#79f0c5'}));
  } else if(archetype==='space') {
    ball(root,0,-.45,0,1.25,.36,1.9,paint);pilotSeat(.15,.4);ball(root,0,.42,.62,.88,.86,1.05,glass);
    for(const x of [-1.55,1.55]) {box(root,.65,.6,2.4,x,0,-.3,dark);box(root,.8,.15,1.3,x,.35,-.4,paint);thruster(x,0,-1.9);}
    box(root,3.6,.1,.55,0,0,.7,accent);box(root,.1,.8,.8,0,.6,-1.4,paint);
  }
  if(s.visualVariant==='utility'){box(root,1.75,.7,1.15,0,1.35,-.75,paint);box(root,1.9,.08,1.3,0,1.74,-.75,dark);}
  else if(s.visualVariant==='touring'){for(const x of [-.42,.42])box(root,.3,.5,.75,x,.72,-.72,paint);box(root,.65,.62,.04,0,1.18,.72,glass);}
  else if(s.visualVariant==='rescue'){box(root,1.25,.32,1.2,0,.72,-.65,accent);for(const x of [-.45,.45])ball(root,x,.95,.15,.14,.1,.14,new T.MeshBasicMaterial({color:'#ffefe0'}));}
  else if(s.visualVariant==='patrol'){box(root,1.35,.8,1.15,0,.75,-.35,paint);box(root,1.1,.5,.04,0,.94,.25,glass);tube([0,1.15,-.3],[0,2,-.3],.035,chrome);}
  else if(s.visualVariant==='trainer'){box(root,1.35,.12,1.1,0,1.45,-.65,accent);for(const x of [-3.7,3.7])box(root,.55,.08,.75,x,.42,-.15,paint);}
  else if(s.visualVariant==='survey'){for(const x of [-2.3,2.3]){const panel=box(root,.9,.04,1.8,x,.35,-.2,new T.MeshBasicMaterial({color:'#4577a5'}));panel.rotation.z=x<0?.08:-.08;}ball(root,0,1.15,-.6,.35,.35,.35,accent);}
  const label=labelSprite(`${String(SPECS_INDEX(s)).padStart(2,'0')}  /  ${s.name}`);label.position.set(0,s.mode==='plane'||s.mode==='glider'?3.7:s.mode==='sub'?3.4:3.5,0);root.add(label);
  root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  return {root,seat,wheels,wheelRigs,rotors,steering,engine,label};
}
function SPECS_INDEX(s:VehicleSpec){const index=['rover','racer','bike','slide','hover','boat','sub','glider','plane','space','trail-rover','touring-bike','rescue-hover','patrol-boat','trainer-plane','survey-space'].indexOf(s.id);return index+1;}
