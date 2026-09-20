import * as T from 'three';
import {createInstancedParts} from '../shared/instanced-parts';
import type {WheelRig} from '../../models';
import {BUS_SPEC} from './spec';
import type {VehicleSpec} from '../../config';

/** Vehicle geometry only; rider, camera, input and physics belong to the SDK. */
export function buildBusModel(spec:VehicleSpec=BUS_SPEC){
  const wheelPhysics=spec.wheelPhysics;
  if(!wheelPhysics?.wheels||wheelPhysics.wheelWidth===undefined)throw new Error('Bus model requires an explicit wheel profile');
  const {radius,hubHeight,wheelWidth}=wheelPhysics;
  const root=new T.Group();root.name='retro-minibus';
  const mint=new T.MeshStandardMaterial({color:spec.color,roughness:.8});
  const cream=new T.MeshStandardMaterial({color:'#eee9db',roughness:.85});
  const dark=new T.MeshStandardMaterial({color:'#26363a',roughness:.9});
  const steel=new T.MeshStandardMaterial({color:'#9aa6a5',roughness:.7,metalness:.1});
  const glass=new T.MeshStandardMaterial({color:'#b1d4d7',transparent:true,opacity:.12,depthWrite:false,side:T.DoubleSide,roughness:1});
  const lamp=new T.MeshStandardMaterial({color:'#efe5c7',roughness:.6});
  const wheels:T.Object3D[]=[],wheelRigs:WheelRig[]=[],steering:T.Object3D[]=[];
  const box=(name:string,size:number[],pos:number[],mat:T.Material)=>{
    const m=new T.Mesh(new T.BoxGeometry(size[0],size[1],size[2]),mat);m.name=name;m.position.set(pos[0]!,pos[1]!,pos[2]!);root.add(m);return m;
  };
  const rod=(name:string,a:number[],b:number[],r=.025,mat:T.Material=steel)=>{
    const start=new T.Vector3(...a as [number,number,number]),end=new T.Vector3(...b as [number,number,number]),d=end.sub(start);
    const m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),8),mat);m.name=name;m.position.copy(start).addScaledVector(d,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());root.add(m);return m;
  };
  box('floor',[2.08,.12,5.48],[0,.46,0],dark);
  box('chassis',[1.6,.2,4.7],[0,.33,-.12],dark);
  // Lower sides leave real wheel arches open. Cream window rails frame clear panes.
  for(const side of [-1,1]){
    const x=side*1.04;
    box('side.upper',[.07,.45,5.45],[x,1.16,0],mint);
    for(const [z,length] of [[-2.51,.48],[.2,2.1],[2.59,.28]])box('side.lower',[.07,.5,length!],[x,.7,z!],mint);
    for(const z of [-1.45,1.85]){
      const arc=new T.Mesh(new T.TorusGeometry(.54,.045,8,24,Math.PI),mint);arc.rotation.y=Math.PI/2;arc.position.set(x,.47,z);root.add(arc);
    }
    box('window.lower-rail',[.09,.12,5.48],[x,1.44,0],cream);
    box('window.upper-rail',[.09,.13,5.45],[x,2.42,0],cream);
    const divisions=[-2.7,-1.62,-.54,.54,1.62,2.68];
    const pillars=createInstancedParts(new T.BoxGeometry(.09,.96,.065),cream,divisions.map(z=>new T.Matrix4().makeTranslation(x,1.94,z)));pillars.name='window.pillar';root.add(pillars);
    for(let n=0;n<divisions.length-1;n++){
      const z=(divisions[n]!+divisions[n+1]!)/2,length=divisions[n+1]!-divisions[n]!-.07;
      box('window.side',[.012,.87,length],[x,1.94,z],glass);
    }
    // Door seams/handles and mirrors identify the reference without decorative wear.
    for(const z of [.54,1.62])box('door.seam',[.012,.83,.018],[x+side*.04,.97,z],dark);
    for(const z of [.42,1.5])box('door.handle',[.06,.04,.14],[x+side*.07,1.22,z],steel);
    rod('mirror.arm',[x,1.64,2.35],[side*1.19,1.7,2.52],.018);
    box('mirror',[.07,.25,.13],[side*1.18,1.81,2.51],dark);
  }
  // Rounded roof cross-section extruded along the long cabin.
  const roofShape=new T.Shape();roofShape.moveTo(-1.09,2.40);roofShape.quadraticCurveTo(-1.09,2.65,-.82,2.65);
  roofShape.lineTo(.82,2.65);roofShape.quadraticCurveTo(1.09,2.65,1.09,2.40);
  roofShape.lineTo(.99,2.40);roofShape.quadraticCurveTo(.99,2.55,.79,2.55);roofShape.lineTo(-.79,2.55);roofShape.quadraticCurveTo(-.99,2.55,-.99,2.40);roofShape.closePath();
  const roof=new T.Mesh(new T.ExtrudeGeometry(roofShape,{depth:5.5,bevelEnabled:false,curveSegments:8}),cream);roof.position.z=-2.75;roof.name='roof';root.add(roof);
  box('nose',[2.08,.77,.13],[0,.99,2.7],mint);
  box('windscreen.lower',[2.12,.16,.12],[0,1.46,2.7],cream);
  for(const x of [-1.03,0,1.03])box('windscreen.pillar',[.055,.95,.09],[x,1.98,2.7],cream);
  for(const x of [-.52,.52])box('windscreen',[.96,.87,.018],[x,1.98,2.7],glass);
  box('rear.panel',[2.08,1.02,.10],[0,1.06,-2.73],mint);
  box('rear.window',[1.96,.8,.02],[0,1.98,-2.73],glass);
  for(const y of [1.5,2.43])box('rear.window.rail',[2.12,.10,.09],[0,y,-2.73],cream);
  box('grille.frame',[.94,.6,.045],[0,.88,2.79],steel);
  box('grille',[.82,.5,.035],[0,.88,2.82],dark);
  const grilleSlats=createInstancedParts(new T.BoxGeometry(.8,.018,.04),steel,[.72,.85,.98,1.11].map(y=>new T.Matrix4().makeTranslation(0,y,2.845)));grilleSlats.name='grille.slat';root.add(grilleSlats);
  for(const z of [-2.84,2.84])box('bumper',[2.21,.14,.16],[0,.5,z],steel);
  for(const x of [-.8,.8])for(const y of [.8,1.13]){
    const ring=new T.Mesh(new T.CylinderGeometry(.145,.145,.075,20),steel);ring.rotation.x=Math.PI/2;ring.position.set(x,y,2.8);root.add(ring);
    const light=new T.Mesh(new T.CircleGeometry(.113,20),lamp);light.position.set(x,y,2.84);root.add(light);
  }
  for(const x of [-.83,.83])box('tail.lamp',[.16,.3,.045],[x,.91,-2.80],new T.MeshStandardMaterial({color:'#ba5548'}));
  for(const layout of wheelPhysics.wheels){
    const pivot=new T.Group(),spin=new T.Group();pivot.position.set(layout.x,hubHeight,layout.z);pivot.add(spin);root.add(pivot);
    const tire=new T.Mesh(new T.CylinderGeometry(radius,radius,wheelWidth,24),dark);tire.rotation.z=Math.PI/2;spin.add(tire);
    const rim=new T.Mesh(new T.CylinderGeometry(radius*(29/46),radius*(29/46),wheelWidth+.015,20),cream);rim.rotation.z=Math.PI/2;spin.add(rim);
    const hub=new T.Mesh(new T.CylinderGeometry(radius*(7/23),radius*(7/23),wheelWidth+.03,12),steel);hub.rotation.z=Math.PI/2;spin.add(hub);
    wheels.push(spin);wheelRigs.push({steering:pivot,spin,radius});if(layout.steering)steering.push(pivot);
  }
  const seats=[[.47,1.38],[-.47,1.38],...[.24,-.94,-2.04].flatMap(z=>[-.49,.49].map(x=>[x,z]))] as [number,number][];
  const cushions=createInstancedParts(new T.BoxGeometry(.66,.10,.62),dark,seats.map(([x,z])=>new T.Matrix4().makeTranslation(x,.94,z)));cushions.name='seat.cushion';
  const backs=createInstancedParts(new T.BoxGeometry(.68,.67,.11),dark,seats.map(([x,z])=>new T.Matrix4().makeTranslation(x,1.3,z-.32)));backs.name='seat.back';
  const legs=createInstancedParts(new T.CylinderGeometry(.025,.025,.38,8),dark,seats.flatMap(([x,z])=>[-.23,.23].map(dx=>new T.Matrix4().makeTranslation(x+dx,.71,z))));legs.name='seat.leg';
  root.add(cushions,backs,legs);
  box('dashboard',[1.97,.16,.38],[0,1.27,2.35],dark);
  const instrument=box('instrument.panel',[.48,.19,.045],[.47,1.40,2.19],steel);instrument.rotation.x=.2;
  for(const x of [.35,.59]){const dial=new T.Mesh(new T.CircleGeometry(.065,16),dark);dial.rotation.y=Math.PI;dial.position.set(x,1.42,2.16);root.add(dial);}
  rod('steering.column',[.47,.62,2.13],[.47,1.42,1.85],.035,dark);
  const steeringWheel=new T.Group();steeringWheel.name='steering.wheel';steeringWheel.position.set(.47,1.42,1.85);steeringWheel.rotation.x=-.62;root.add(steeringWheel);
  steeringWheel.add(new T.Mesh(new T.TorusGeometry(.23,.018,8,24),dark));
  for(const angle of [0,2.1,4.2]){const spoke=new T.Mesh(new T.BoxGeometry(.018,.23,.018),steel);spoke.position.set(Math.sin(angle)*.11,Math.cos(angle)*.11,0);spoke.rotation.z=-angle;steeringWheel.add(spoke);}
  for(const x of [.31,.58])box('pedal',[.12,.03,.19],[x,.55,2.01],dark);
  root.traverse(node=>{if(node instanceof T.Mesh){node.castShadow=node.material!==glass;node.receiveShadow=node.material!==glass;}});
  return {root,wheels,wheelRigs,steering};
}
