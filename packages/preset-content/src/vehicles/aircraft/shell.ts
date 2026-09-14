import * as T from 'three';
import {humanoid} from '@worldkit/three';

/** 从 5191 迁入的飞机外形，按 5190 的 +Z 机头和 Source101 驾驶舱重新定标。
 * 只创建几何；人物、座椅、轮子、仪表、机械更新和动力仍由原训练场拥有。
 */
export function buildAircraftShell(root:T.Group,paint:T.Material,accent:T.Material,kind:NonNullable<humanoid.VehicleSpec['aircraftSubtype']>='fixed-wing') {
  const dark=new T.MeshStandardMaterial({color:'#25313a',roughness:.9});
  const glass=new T.MeshStandardMaterial({color:'#94bbc5',transparent:true,opacity:.16,side:T.DoubleSide,depthWrite:false});
  function box(name:string,size:[number,number,number],at:[number,number,number],mat=paint,parent:T.Object3D=root){
    const mesh=new T.Mesh(new T.BoxGeometry(...size),mat);mesh.name=name;mesh.position.set(...at);parent.add(mesh);return mesh;
  }
  function hull(name:string,size:[number,number,number],at:[number,number,number]){
    const mesh=new T.Mesh(new T.SphereGeometry(.5,24,16),paint);mesh.name=name;mesh.scale.set(...size);mesh.position.set(...at);root.add(mesh);return mesh;
  }
  box('aircraft-floor',[1.12,.10,1.65],[0,.67,.30]);
  for(const x of [-.54,.54]){
    box('aircraft-side',[.08,.60,1.65],[x,1.02,.30]);
    box('aircraft-window',[.012,.78,1.55],[x,1.72,.30],glass);
  }
  box('aircraft-bulkhead',[1.12,1.46,.08],[0,1.42,-.56]);
  box('aircraft-roof',[1.30,.075,1.78],[0,2.20,.30],accent);
  box('aircraft-windshield',[1.08,.79,.012],[0,1.745,1.10],glass);
  hull('aircraft-nose',[1.04,.86,1.96],[0,1.30,2.02]);
  if(kind==='pusher'){
    // 双尾撑绕开后置桨盘；尾翼固定在尾撑上，桨轴接到座舱后的发动机。
    hull('aircraft-engine',[.56,.56,.70],[0,1.30,-.87]);
    box('aircraft-tail-crossmember',[2.8,.14,.12],[0,1.03,-.36],dark);
    for(const x of [-1.35,1.35]){
      box('aircraft-tail-boom',[.15,.18,2.48],[x,1.10,-1.50]);
      box('aircraft-fin',[.10,1.20,.85],[x,1.87,-2.63]);
    }
  }else{
    hull('aircraft-tail',[.65,.66,3.12],[0,1.10,-1.56]);
    box('aircraft-fin',[.10,1.20,.85],[0,1.87,-2.63]);
  }
  box('aircraft-stabilizer',[3.15,.09,.72],[0,1.30,-2.55]);
  const winged=kind!=='helicopter'&&kind!=='multirotor';
  if(winged)box('aircraft-wing',[kind==='glider'?11:8,.12,1.35],[0,2.20,.05],accent);
  const rotors:T.Group[]=[],nacelles:T.Group[]=[];
  let propellerBlur:T.Mesh<T.RingGeometry,T.MeshBasicMaterial>|undefined,propellerBlades:T.Mesh[]=[];
  let bladeMaterial:T.MeshStandardMaterial|undefined;
  function rotor(parent:T.Object3D,radius:number){
    const spin=new T.Group();spin.name='aircraft-rotor';parent.add(spin);
    box('aircraft-blade',[radius*2,.045,.12],[0,0,0],dark,spin);
    box('aircraft-blade',[.12,.045,radius*2],[0,0,0],dark,spin);rotors.push(spin);return spin;
  }
  if(kind==='glider'){
    // 无推进装置，保留经过人物适配的驾驶舱。
  }else if(kind==='fixed-wing'||kind==='pusher'){
    const prop=new T.Group();prop.name='aircraft-propeller';prop.position.set(0,1.30,kind==='pusher'?-1.42:3.10);root.add(prop);
    if(kind==='pusher')box('aircraft-propeller-shaft',[.14,.14,.30],[0,1.30,-1.29],dark);
    // 5190 展示层绕 Z 驱动整组螺旋桨，静态桨盘位于 XY 平面。
    const diameter=kind==='pusher'?1.70:2;
    box('aircraft-blade',[diameter,.10,.06],[0,0,0],dark,prop);
    box('aircraft-blade',[.10,diameter,.06],[0,0,0],dark,prop);rotors.push(prop);
    if(kind==='fixed-wing'){
      // 高速桨叶用曝光平均的桨盘显示，避免四叶桨在 30/60 Hz 下出现停转、倒转假象。
      bladeMaterial=dark.clone();bladeMaterial.transparent=true;
      propellerBlades=prop.children.filter((n):n is T.Mesh=>n instanceof T.Mesh);
      for(const blade of propellerBlades)blade.material=bladeMaterial;
      propellerBlur=new T.Mesh(new T.RingGeometry(.09,diameter/2,64),new T.MeshBasicMaterial({color:'#445058',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));
      propellerBlur.name='aircraft-propeller-blur';propellerBlur.visible=false;prop.add(propellerBlur);
      humanoid.markCameraVisualEffect(propellerBlur);
    }
  }else if(kind==='helicopter'){
    const hub=new T.Group();hub.position.set(0,2.62,.15);root.add(hub);rotor(hub,3.9);
    box('aircraft-mast',[.14,.45,.14],[0,2.42,.15],dark);
    const tail=new T.Group();tail.position.set(.45,2.02,-2.7);tail.rotation.z=Math.PI/2;root.add(tail);rotor(tail,.48);
    box('aircraft-tail-rotor-shaft',[.52,.12,.12],[.25,2.02,-2.7],dark);
  }else if(kind==='multirotor'){
    box('aircraft-rotor-spine',[.20,.16,3.8],[0,2.38,.35],dark);
    for(const z of [-.35,.95])box('aircraft-roof-mount',[.28,.26,.22],[0,2.29,z],dark);
    for(const z of [-1.45,2.15]){
      box('aircraft-rotor-arm',[4.4,.12,.14],[0,2.38,z],dark);
      for(const x of [-2.2,2.2]){
        box('aircraft-motor',[.24,.20,.24],[x,2.46,z],paint);
        box('aircraft-motor-shaft',[.10,.12,.10],[x,2.585,z],dark);
        const hub=new T.Group();hub.position.set(x,2.62,z);root.add(hub);rotor(hub,1.25);
      }
    }
  }else for(const x of [-3.2,3.2]){
    const hub=new T.Group();hub.name='aircraft-nacelle';hub.position.set(x,2.50,.80);root.add(hub);nacelles.push(hub);
    box('aircraft-nacelle-support',[.20,.30,.75],[x,2.35,.48],dark);
    box('aircraft-nacelle-body',[.45,.55,.65],[0,0,0],paint,hub);
    box('aircraft-nacelle-shaft',[.12,.32,.12],[0,.41,0],dark,hub);
    // 桨盘在旋转轴前方；整个发动机舱倾转，桨叶只围绕自己的轴自转。
    rotor(hub,1.2).position.y=.55;
  }
  return {rotors,nacelles,winged,update(state:{rotorPhases:number[];tilt:number;rotorSpeedFraction?:number}){
    rotors.forEach((rotor,n)=>{if(kind==='fixed-wing'||kind==='pusher')rotor.rotation.z=state.rotorPhases[n]??0;else rotor.rotation.y=state.rotorPhases[n]??0;});
    nacelles.forEach(nacelle=>nacelle.rotation.x=state.tilt*Math.PI/2);
    if(propellerBlur&&bladeMaterial){
      const blend=T.MathUtils.smoothstep(state.rotorSpeedFraction??0,.12,.45);
      propellerBlur.visible=blend>0;propellerBlur.material.opacity=.18*blend;
      bladeMaterial.opacity=1-blend;bladeMaterial.depthWrite=blend===0;
      for(const blade of propellerBlades)blade.visible=blend<1;
    }
  }};
}
