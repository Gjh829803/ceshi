import {buildUnicycleModel} from './unicycle-model';
import {buildSubmersibleModel} from './submersible-model';
import {buildCanoeModel} from './canoe-model';
import {buildKayakModel} from './kayak-model';
import {buildRaftModel} from './raft-model';
import {buildJetSkiModel} from './jetski-model';
import {buildAtvModel} from './atv-model';
import {buildAircraftCockpit} from './aircraft-cockpit';
import * as T from 'three';
import { SPECS, type VehicleSpec } from './config';
import { ROAD_CUSHIONS } from './road-seating';
import { buildCreatureVisual, type CreatureVisual } from './creatures/visual';
import { buildSkiModel } from './ski-model';
import { buildSledModel } from './sled-model';
import {buildTankModel} from './tank-model';
import { buildBusModel } from './bus-model';
export const material=(color:string|number,metalness=.05,roughness=.65)=>new T.MeshStandardMaterial({color,metalness,roughness});
const dark=material('#25313a',.3),rubber=material('#172128',0,.9),chrome=material('#bfced5',.6,.27),glass=new T.MeshPhysicalMaterial({color:'#9adddf',transparent:true,opacity:.25,roughness:.1,metalness:.3,side:T.DoubleSide});
export function box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,mat:T.Material){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function ball(parent:T.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:T.Material){const m=new T.Mesh(new T.SphereGeometry(1,24,16),mat);m.scale.set(sx,sy,sz);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
function rod(parent:T.Object3D,a:T.Vector3,b:T.Vector3,r:number,mat:T.Material){const d=b.clone().sub(a);const m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),10),mat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());m.castShadow=true;parent.add(m);return m;}
export interface WheelRig { steering:T.Group; spin:T.Group; radius:number }
export interface VehicleVisual {aircraftCockpit?:ReturnType<typeof buildAircraftCockpit>;root:T.Group;seat:T.Group;wheels:T.Object3D[];wheelRigs:WheelRig[];rotors:T.Object3D[];steering:T.Object3D[];engine:T.Mesh[];label:T.Sprite;creature?:CreatureVisual}
export function labelSprite(text:string,color='#233746',width=5,height=.9):T.Sprite {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const c=canvas.getContext('2d')!;
  c.fillStyle='rgba(245,250,251,.95)';c.beginPath();c.roundRect(0,0,768,128,20);c.fill();c.fillStyle=color;c.font='600 49px "Segoe UI", "Microsoft YaHei", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,65);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map,depthTest:true}));sprite.scale.set(width,height,1);return sprite;
}
export function buildVehicle(s:VehicleSpec):VehicleVisual {
  if(s.visualVariant==='bubble-sub'){const root=buildSubmersibleModel(),seat=new T.Group(),label=labelSprite(s.name);seat.position.set(...s.seat);label.position.y=2;root.add(seat,label);return {root,seat,label,wheels:[],wheelRigs:[],rotors:[],steering:[],engine:[]};}
  if(s.archetype==='jetski'){const root=buildJetSkiModel(),seat=new T.Group(),label=labelSprite(s.name);seat.position.set(...s.seat);label.position.y=2.4;root.add(seat,label);return {root,seat,label,wheels:[],wheelRigs:[],rotors:[],steering:[],engine:[]};}
  if(s.archetype==='kayak'||s.archetype==='canoe'||s.archetype==='raft'){const root=s.archetype==='raft'?buildRaftModel():s.archetype==='canoe'?buildCanoeModel():buildKayakModel(),seat=new T.Group(),label=labelSprite(s.name);seat.position.set(...s.seat);label.position.y=1.65;root.add(seat,label);return {root,seat,label,wheels:[],wheelRigs:[],rotors:[],steering:[],engine:[]};}
  if(s.archetype==='bus'){
    const visual=buildBusModel(),seat=new T.Group();seat.position.set(...s.seat);visual.root.add(seat);visual.root.name=s.id;
    const label=labelSprite(s.name);label.position.y=3.2;visual.root.add(label);
    return {...visual,seat,label,rotors:[],engine:[]};
  }
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
  function roadSeat(){const {center,size}=ROAD_CUSHIONS[s.id as keyof typeof ROAD_CUSHIONS];const cushion=box(root,size[0],size[1],size[2],center[0],center[1],center[2],dark);cushion.name='seat-cushion';if(s.mode!=='motorcycle')box(root,.74,.72,.13,center[0],center[1]+.35,center[2]-size[2]/2-.065,dark).name='seat-back';}
  function thruster(x:number,y:number,z:number){const glow=new T.Mesh(new T.ConeGeometry(.18,.8,12),new T.MeshBasicMaterial({color:'#95f9ff',transparent:true,opacity:.65}));glow.rotation.x=-Math.PI/2;glow.position.set(x,y,z);root.add(glow);engine.push(glow);}
  const archetype=s.archetype;
  if(archetype==='unicycle'){root.add(buildUnicycleModel());
  }else if(archetype==='atv'){root.add(buildAtvModel());
  }else if(archetype==='tank'){root.add(buildTankModel());
  }else if(s.id==='supercar') {
    // Concave plan profiles preserve a narrow cockpit between broad wheel
    // shoulders. All bodywork and exhausts fit the existing collision envelope.
    type Point=readonly[number,number];
    function panel(name:string,outline:readonly Point[],bottom:number,top:number|((z:number)=>number),mat:T.Material){
      const points=outline.map(([x,z])=>new T.Vector2(x,z)),faces=T.ShapeUtils.triangulateShape(points,[]),vertices:number[]=[];
      const lower=outline.map(([x,z])=>new T.Vector3(x,bottom,z)),upper=outline.map(([x,z])=>new T.Vector3(x,typeof top==='number'?top:top(z),z));
      const triangle=(a:T.Vector3,b:T.Vector3,c:T.Vector3)=>vertices.push(...a.toArray(),...b.toArray(),...c.toArray());
      // ShapeUtils emits counterclockwise XY faces; the XZ top needs the reverse.
      for(const [a,b,c] of faces){triangle(upper[c!]!,upper[b!]!,upper[a!]!);triangle(lower[a!]!,lower[b!]!,lower[c!]!);}
      const ccw=!T.ShapeUtils.isClockWise(points);
      for(let i=0;i<outline.length;i++){const next=(i+1)%outline.length,a=lower[i]!,b=lower[next]!,c=upper[next]!,d=upper[i]!;
        if(ccw){triangle(a,c,b);triangle(a,d,c);}else{triangle(a,b,c);triangle(a,c,d);}}
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
      const mesh=new T.Mesh(geometry,mat);mesh.name=name;root.add(mesh);return mesh;
    }
    const edge:Point[]=[[.82,2.34],[1.10,1.72],[1.12,1.05],[1.02,.48],[.96,-.30],[1.04,-.90],[1.16,-1.48],[1.06,-2.12],[.86,-2.30]];
    const outline:Point[]=[...edge,...edge.toReversed().map(([x,z]):Point=>[-x,z])];
    panel('supercar-waisted-undertray',outline.map(([x,z]):Point=>[x+Math.sign(x)*.04,z]),.14,.24,dark);
    panel('supercar-waisted-body',outline,.24,.46,paint);
    panel('supercar-wedge-nose',[[-.82,2.34],[.82,2.34],[1.08,1.65],[.84,.66],[-.84,.66],[-1.08,1.65]],.46,z=>.83-(z-.66)*.18,paint);
    // Flared rear haunches taper into the cockpit instead of forming box doors.
    for(const side of [-1,1]){
      const flank=edge.slice(2).map(([x,z]):Point=>[side*x,z]);
      const inner=edge.slice(2).toReversed().map(([x,z]):Point=>[side*(x-.22),z]);
      panel(`supercar-sculpted-flank-${side}`,[...flank,...inner],.43,z=>z<-.9?.86:.70,paint);
      panel(`supercar-side-intake-${side}`,[[side*.98,-.28],[side*1.05,-.88],[side*1.10,-1.28],[side*.97,-1.20],[side*.87,-.45]],.47,.63,dark);
      panel(`supercar-front-shoulder-${side}`,[[side*.84,.68],[side*1.12,1.05],[side*1.1,1.72],[side*.89,1.91],[side*.85,1.15]],.46,z=>.87-(z-.68)*.14,paint);
    }
    for(const x of [-1.02,1.02]) {
      for(const z of [-1.5,1.5]){const axle=wheel(x,.37,z,.37,.32);if(z>0)steering.push(axle);}
      box(root,.09,.32,.10,x*.74,1.01,.50,dark).rotation.x=-.5;
    }
    panel('supercar-rear-deck',[[-.65,-1.03],[.65,-1.03],[1.10,-1.50],[1.02,-2.12],[.86,-2.30],[-.86,-2.30],[-1.02,-2.12],[-1.10,-1.50]],.45,z=>.88+(z+1.03)*.10,paint);
    panel('supercar-engine-cover',[[-.48,-1.10],[.48,-1.10],[.64,-1.92],[-.64,-1.92]],.86,.90,dark);
    roadSeat();
    box(root,1.52,.43,.035,0,1.00,.56,glass).rotation.x=-.48;
    for(const x of [-.68,.68]){
      box(root,.40,.055,.065,x,.56,2.22,accent).rotation.y=x<0?-.16:.16;
      box(root,.55,.065,.05,x,.70,-2.20,new T.MeshBasicMaterial({color:'#9d352c'}));
      tube([x,.75,-1.98],[x,1.12,-1.98],.04);
    }
    panel('supercar-rear-wing',[[-1.18,-2.27],[1.18,-2.27],[1.13,-1.86],[.69,-1.91],[-.69,-1.91],[-1.13,-1.86]],1.10,1.18,dark);
    for(const side of [-1,1])box(root,.06,.25,.43,side*1.15,1.15,-2.06,dark);
    box(root,1.95,.34,.10,0,.43,-2.18,dark);
    // Four large open exhaust tips, with recessed dark bores and metal rims.
    for(const x of [-.72,-.24,.24,.72]){
      const exhaust=new T.Group();exhaust.name='supercar-exhaust';exhaust.position.set(x,.44,-2.16);root.add(exhaust);
      const pipe=new T.Mesh(new T.CylinderGeometry(.16,.18,.55,16,1,true),chrome);pipe.rotation.x=Math.PI/2;exhaust.add(pipe);
      const rim=new T.Mesh(new T.RingGeometry(.135,.18,20),chrome);rim.rotation.y=Math.PI;rim.position.z=-.276;exhaust.add(rim);
      const bore=new T.Mesh(new T.CircleGeometry(.135,20),rubber);bore.rotation.y=Math.PI;bore.position.z=-.23;exhaust.add(bore);
    }
    // +Z is the nose: the column rises rearward from the dashboard toward the driver.
    const columnBase=new T.Vector3(0,.57,.85),wheelCenter=new T.Vector3(0,.95,.19);
    tube(columnBase.toArray(),wheelCenter.toArray(),.04);
    const steeringWheel=new T.Mesh(new T.TorusGeometry(.23,.028,8,24),dark);steeringWheel.position.copy(wheelCenter);
    steeringWheel.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),wheelCenter.clone().sub(columnBase).normalize());root.add(steeringWheel);
  } else if(s.id==='kart') {
    // A compact exposed chassis, four small tyres, side pods and rear engine.
    box(root,1.4,.10,2.5,0,.16,0,dark);
    for(const x of [-.63,.63]){
      tube([x,.22,-1.14],[x,.22,1.12],.045);
      box(root,.32,.22,1.03,x,.32,-.02,paint);
    }
    for(const x of [-.78,.78])for(const z of [-.89,.85]){const axle=wheel(x,.24,z,.24,.24);if(z>0)steering.push(axle);}
    tube([-.78,.24,-.89],[.78,.24,-.89],.035);
    box(root,1.86,.18,.26,0,.28,1.23,paint);
    box(root,1.64,.12,.16,0,.25,-1.25,dark);
    box(root,.66,.15,.7,0,.3,.75,paint).rotation.x=.14;
    roadSeat();
    box(root,.43,.34,.43,.46,.45,-.83,dark);
    box(root,.30,.05,.36,.46,.64,-.83,chrome);
    const columnBase=new T.Vector3(0,.24,.79),wheelCenter=new T.Vector3(0,.88,.30);
    tube(columnBase.toArray(),wheelCenter.toArray(),.035);
    const steeringWheel=new T.Mesh(new T.TorusGeometry(.22,.025,8,24),dark);steeringWheel.position.copy(wheelCenter);
    steeringWheel.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),wheelCenter.clone().sub(columnBase).normalize());root.add(steeringWheel);
  } else if(archetype==='rover'||archetype==='racer') {
    const sporty=archetype==='racer';const h=sporty?.5:.77;
    box(root,2,.25,3.8,0,.48+.125,0,paint);box(root,1.8,.25,1.3,0,h+.45,1.1,paint);
    for(const x of [-.91,.91])box(root,.18,.4,1.8,x,.88,0,paint);
    box(root,1.9,.18,.8,0,h+.5,-1.25,paint);roadSeat();
    box(root,2.2,.2,.18,0,.5,2,dark);box(root,2.2,.2,.18,0,.5,-2,dark);
    for(const x of [-1.1,1.1])for(const z of [-1.27,1.27]){const w=wheel(x,sporty?.39:.52,z,sporty?.39:.52,sporty?.32:.4);if(z>0)steering.push(w);}
    for(const x of [-.93,.93]){tube([x,h+.5,-.6],[x,h+1.4,-.45],.055);tube([x,h+1.4,-.45],[x,h+1.4,.7],.055);tube([x,h+1.4,.7],[x,h+.5,1],.055);}
    box(root,1.7,.55,.025,0,h+1.05,.88,glass).rotation.x=-.25;
    if(sporty){box(root,2.6,.08,.5,0,1.3,-1.85,dark);tube([-.8,.8,-1.85],[-.8,1.3,-1.85]);tube([.8,.8,-1.85],[.8,1.3,-1.85]);}
    for(const x of [-.65,.65]){box(root,.45,.17,.06,x,.85,1.94,new T.MeshBasicMaterial({color:'#fff6d5'}));box(root,.3,.13,.05,x,.8,-1.94,new T.MeshBasicMaterial({color:'#fb6d5c'}));}
    tube([0,.9,.3],[0,1.1,.65]);const steerWheel=new T.Mesh(new T.TorusGeometry(.25,.03,8,24),dark);steerWheel.rotation.x=-.5;steerWheel.position.set(0,1.1,.65);root.add(steerWheel);
  } else if(archetype==='motorcycle') {
    wheel(0,.48,-1.1,.48,.28);steering.push(wheel(0,.48,1.1,.48,.28));
    tube([0,.5,-1.1],[0,1,.4],.13,paint);tube([0,.5,-1.1],[0,.55,.5],.09);tube([0,.55,.5],[0,.48,1.1],.07,chrome);
    box(root,.52,.3,.9,0,.85,.2,paint);roadSeat();
    tube([-.25,.45,1.1],[-.25,1.3,.8],.05,chrome);tube([.25,.45,1.1],[.25,1.3,.8],.05,chrome);tube([-.6,1.35,.85],[.6,1.35,.85],.05);
    ball(root,0,1.2,.9,.23,.2,.16,new T.MeshBasicMaterial({color:'#ffefcd'}));
  } else if(archetype==='ski') {
    root.add(buildSkiModel());
  } else if(archetype==='sled') {
    root.add(buildSledModel());
  } else if(archetype==='skateboard') {
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
  } else if(archetype==='submarine') {
    ball(root,0,-.8,0,1.2,.55,2.7,paint);ball(root,0,.28,.65,.91,.94,1.34,glass);pilotSeat(.1,.5);
    box(root,3.5,.12,.9,0,-.2,-1.4,dark);box(root,.15,1.4,.8,0,.5,-2.1,paint);
    tube([0,.7,-.2],[0,1.65,-.2],.1);tube([0,1.65,-.2],[0,1.65,.2],.1);
    const prop=new T.Group();prop.position.set(0,-.3,-2.8);box(prop,.15,1.25,.12,0,0,0,dark);box(prop,1.25,.15,.12,0,0,0,dark);root.add(prop);rotors.push(prop);
    for(const x of [-.65,.65])ball(root,x,-.05,2.2,.12,.12,.1,new T.MeshBasicMaterial({color:'#e9fff9'}));
  } else if(archetype==='plane') {
    // 有空腔的座舱：地板、侧壳和前后机身分别建模，不用实心椭球吞掉乘员。
    box(root,1.12,.10,1.65,0,.67,.30,paint).name='aircraft-floor';
    for(const x of [-.54,.54])box(root,.10,.60,1.65,x,1.02,.30,paint).name='aircraft-side';
    ball(root,0,1.30,2.02,.52,.46,.98,paint).name='aircraft-nose';
    ball(root,0,1.10,-1.66,.48,.38,1.46,paint).name='aircraft-tail';
    box(root,8,.12,1.35,0,2.20,.05,accent).name='aircraft-wing';
    box(root,3.15,.10,.72,0,1.30,-2.55,paint);
    box(root,.10,1.20,.85,0,1.87,-2.63,paint);
    box(root,.72,.13,.50,0,1.11,.10,dark).name='seat-cushion';
    box(root,.64,.64,.10,0,1.49,-.23,dark).name='seat-back';
    box(root,.42,.37,.40,0,.86,.10,dark);
    for(const x of [-1.10,1.10]){tube([x*.45,.85,.0],[x,.32,.0],.055,chrome);wheel(x,.32,.0,.32,.20);}
    tube([0,1.05,2.10],[0,.26,2.10],.055,chrome);wheel(0,.26,2.10,.26,.18);
    const prop=new T.Group();prop.name='aircraft-propeller';prop.position.set(0,1.30,3.10);
    box(prop,.10,2,.06,0,0,0,dark);ball(prop,0,0,.05,.13,.13,.17,chrome);root.add(prop);rotors.push(prop);
    for(const x of [-.54,.54]){tube([x,.80,.40],[x*5.5,2.14,.05],.035,chrome);box(root,.38,.06,.48,x*1.5,.48,-.25,chrome);}
    for(const x of [-3.9,3.9])ball(root,x,2.23,.05,.09,.06,.10,new T.MeshBasicMaterial({color:x<0?'#fb6a51':'#79f0c5'}));
  } else if(archetype==='glider') {
    ball(root,0,.12,0,.64,.28,3.25,paint);pilotSeat(s.seat[1],s.seat[2]);
    box(root,11,.13,1.4,0,.3,-.2,accent);box(root,3.3,.1,.8,0,.65,-2.4,paint);box(root,.12,1.6,1,0,1.1,-2.5,paint);
    ball(root,0,.81,.55,.67,.7,1.2,glass);box(root,.6,.04,1,0,-.13,0,dark);
  } else if(archetype==='spacecraft') {
    ball(root,0,-.45,0,1.25,.36,1.9,paint);pilotSeat(.15,.4);ball(root,0,.42,.62,.88,.86,1.05,glass);
    for(const x of [-1.55,1.55]) {box(root,.65,.6,2.4,x,0,-.3,dark);box(root,.8,.15,1.3,x,.35,-.4,paint);thruster(x,0,-1.9);}
    box(root,3.6,.1,.55,0,0,.7,accent);box(root,.1,.8,.8,0,.6,-1.4,paint);
  }
  if(s.visualVariant==='utility'){box(root,1.75,.7,1.15,0,1.35,-.75,paint);box(root,1.9,.08,1.3,0,1.74,-.75,dark);}
  else if(s.visualVariant==='touring'){for(const x of [-.42,.42])box(root,.3,.5,.75,x,.72,-.72,paint);box(root,.65,.62,.04,0,1.18,.72,glass);}
  else if(s.visualVariant==='rescue'){box(root,1.25,.32,1.2,0,.72,-.65,accent);for(const x of [-.45,.45])ball(root,x,.95,.15,.14,.1,.14,new T.MeshBasicMaterial({color:'#ffefe0'}));}
  else if(s.visualVariant==='patrol'){box(root,1.35,.8,1.15,0,.75,-.35,paint);box(root,1.1,.5,.04,0,.94,.25,glass);tube([0,1.15,-.3],[0,2,-.3],.035,chrome);}
  else if(s.visualVariant==='trainer'){for(const x of [-3.7,3.7])box(root,.55,.025,1.34,x,2.273,.05,paint);}
  else if(s.visualVariant==='survey'){for(const x of [-2.3,2.3]){const panel=box(root,.9,.04,1.8,x,.35,-.2,new T.MeshBasicMaterial({color:'#4577a5'}));panel.rotation.z=x<0?.08:-.08;}ball(root,0,1.15,-.6,.35,.35,.35,accent);}
  const aircraftCockpit=archetype==='plane'?buildAircraftCockpit(root):undefined;
  const label=labelSprite(`${String(SPECS_INDEX(s)).padStart(2,'0')}  /  ${s.name}`);label.position.set(0,s.mode==='plane'||s.mode==='glider'?3.7:s.mode==='submarine'?3.4:3.5,0);root.add(label);
  root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  return {root,seat,wheels,wheelRigs,rotors,steering,engine,label,...(aircraftCockpit?{aircraftCockpit}:{})};
}
function SPECS_INDEX(s:VehicleSpec){return SPECS.findIndex(spec=>spec.id===s.id)+1;}
