import * as T from 'three';
import {createInstancedParts} from '../shared/instanced-parts';
import {humanoid} from '@worldkit/three';
import {ATV_SPEC,ATV_SOCKETS} from './spec';

/** Racing quad silhouette, open straddle seat and separate steering/spin transforms. */
export function buildAtvModel():T.Group{
 const root=new T.Group();root.name='racing-quad';
 const red=new T.MeshStandardMaterial({color:ATV_SPEC.color,roughness:1}),dark=new T.MeshStandardMaterial({color:'#20262b',roughness:1}),metal=new T.MeshStandardMaterial({color:'#737b7d',roughness:1}),accent=new T.MeshStandardMaterial({color:'#e3dfd1',roughness:1});
 const box=(parent:T.Object3D,name:string,size:[number,number,number],p:[number,number,number],mat:T.Material=red)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.name=name;m.position.set(...p);parent.add(m);return m;};
 const rod=(parent:T.Object3D,name:string,a:number[],b:number[],r:number,mat:T.Material=metal)=>{const from=new T.Vector3(...a),to=new T.Vector3(...b),d=to.clone().sub(from);const m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),10),mat);m.name=name;m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());parent.add(m);return m;};
 const shell=(name:string,points:[number,number][],depth:number,p:[number,number,number],mat:T.Material=red)=>{const shape=new T.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false});geo.rotateY(-Math.PI/2);geo.translate(depth/2,0,0);const m=new T.Mesh(geo,mat);m.name=name;m.position.set(...p);root.add(m);return m;};
 box(root,'body.engine',[.38,.36,.62],[0,.48,-.05],dark);
 box(root,'body.spine',[.23,.19,1.65],[0,.66,-.08],dark);
 box(root,'seat-cushion',[.20,.09,.91],[0,.82,-.44],dark);
 shell('body.nose',[[.28,.82],[.65,1.06],[1.23,.57],[.95,.49]],.51,[0,0,0]);
 for(const side of [-1,1]){
  shell('fender.front',[[.48,.85],[.74,1.03],[1.19,.80],[1.20,.72],[.52,.74]],.43,[side*.64,0,0]);
  shell('fender.rear',[[-1.2,1.03],[-.5,.81],[-.5,.7],[-1.17,.85]],.46,[side*.59,0,0]);
  box(root,'foot.platform',[.26,.035,.39],[side*.42,.233,.01],dark);
  rod(root,'frame.rail',[side*.35,.28,-.67],[side*.35,.28,.63],.035,dark);
  rod(root,'bumper.side',[side*.35,.35,1.15],[side*.32,.61,1.18],.035);
  rod(root,'front.shock',[side*.27,.72,.74],[side*.64,.39,.8],.046,accent);
  rod(root,'rear.shock',[side*.27,.63,-.7],[side*.64,.39,-.8],.046,accent);
  const light=box(root,'headlight',[.17,.085,.025],[side*.27,.72,1.04],accent);light.rotation.y=side*.25;
 }
 rod(root,'bumper.bar',[-.35,.35,1.15],[.35,.35,1.15],.035);
 rod(root,'handlebar.stem',[0,.76,.25],[0,1.285,.12],.035);
 const g=humanoid.ATV_GEOMETRY,bar=new T.Group();bar.name='atv.handlebar';bar.position.set(...g.handlebar);root.add(bar);
 rod(bar,'handlebar.cross',[-.34,0,0],[.34,0,0],.022);
 g.grips.forEach((p,index)=>{const socket=new T.Group();socket.name=index===0?'control.hand.left':'control.hand.right';socket.position.set(...p);bar.add(socket);rod(socket,'grip',[-.065,0,0],[.065,0,0],.034,dark);box(bar,'handguard',[.20,.085,.075],[p[0],.035,.085]);});
 g.wheelPositions.forEach((p,index)=>{
  const pivot=new T.Group(),spin=new T.Group();pivot.name=`atv.wheel.${index}`;spin.name=`atv.spin.${index}`;pivot.position.set(...p);pivot.add(spin);root.add(pivot);
  const tyre=new T.Mesh(new T.CylinderGeometry(.365,.365,.35,20),dark);tyre.rotation.z=Math.PI/2;spin.add(tyre);
  const rim=new T.Mesh(new T.CylinderGeometry(.21,.21,.365,12),metal);rim.rotation.z=Math.PI/2;spin.add(rim);
  const treads=createInstancedParts(new T.BoxGeometry(.36,.05,.09),dark,Array.from({length:24},(_,n)=>{const a=n*Math.PI/12;return new T.Matrix4().makeRotationX(a).setPosition(0,Math.cos(a)*.37,Math.sin(a)*.37);}));
  treads.name='tread';spin.add(treads);
  const axle=box(spin,'hub',[.38,.07,.07],[0,0,0],dark);axle.rotation.x=Math.PI/4;
 });
 for(const [name,p] of Object.entries(ATV_SOCKETS)){const socket=new T.Group();socket.name=name;socket.position.set(...p);root.add(socket);}
 humanoid.sampleAtvVisual(root,humanoid.createAtvState());return root;
}
