import * as T from 'three';
import {training} from '@worldkit/three';
import {UNICYCLE_SOCKETS} from './unicycle';

/** Single fat tyre, yellow rim, fork, saddle and opposed direct-drive pedals. */
export function buildUnicycleModel():T.Group {
  const root=new T.Group();root.name='unicycle';
  const dark=new T.MeshStandardMaterial({color:'#262a2c',roughness:1}),rim=new T.MeshStandardMaterial({color:'#d9bd36',roughness:1}),metal=new T.MeshStandardMaterial({color:'#8d9497',roughness:1});
  const box=(parent:T.Object3D,name:string,size:[number,number,number],p:[number,number,number],m:T.Material)=>{const mesh=new T.Mesh(new T.BoxGeometry(...size),m);mesh.name=name;mesh.position.set(...p);parent.add(mesh);return mesh;};
  const rod=(parent:T.Object3D,a:number[],b:number[],r:number,m:T.Material)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start),mesh=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),10),m);mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());parent.add(mesh);};
  const wheel=new T.Group();wheel.name='unicycle.wheel';wheel.position.y=.36;root.add(wheel);
  const tyre=new T.Mesh(new T.TorusGeometry(.29,.07,12,40),dark);tyre.rotation.y=Math.PI/2;wheel.add(tyre);
  const ring=new T.Mesh(new T.TorusGeometry(.225,.025,8,36),rim);ring.rotation.y=Math.PI/2;wheel.add(ring);
  rod(wheel,[-.12,0,0],[.12,0,0],.038,metal);
  for(let n=0;n<12;n++){const a=n*Math.PI/6;rod(wheel,[0,0,0],[0,Math.cos(a)*.225,Math.sin(a)*.225],.005,metal);}
  for(const side of [1,-1] as const){
    rod(root,[side*.12,.36,0],[side*.12,.76,0],.022,metal);rod(root,[side*.12,.76,0],[0,.79,0],.023,metal);
    const crank=new T.Group();crank.name=`unicycle.crank.${side}`;crank.position.set(side*.15,.36,0);root.add(crank);rod(crank,[0,0,0],[0,0,.135],.018,metal);
    const pedal=new T.Group();pedal.name=`unicycle.pedal.${side}`;root.add(pedal);box(pedal,'pedal.platform',[.15,.028,.105],[0,-.014,0],dark);
  }
  rod(root,[0,.74,0],[0,.85,0],.028,metal);box(root,'saddle',[.20,.075,.31],[0,.845,0],dark);
  for(const [name,p] of Object.entries(UNICYCLE_SOCKETS)){const socket=new T.Group();socket.name=name;socket.position.set(...p);root.add(socket);}
  training.sampleUnicycleVisual(root,training.createUnicycleState());return root;
}
