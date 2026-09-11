import * as T from 'three';
import {CANOE_SPEC} from './spec';
import {humanoid} from '@worldkit/three';
export function buildCanoeModel(){
 const root=new T.Group();root.name='canoe';
 const wood=new T.MeshStandardMaterial({color:CANOE_SPEC.color,roughness:.95,side:T.DoubleSide});
 const dark=new T.MeshStandardMaterial({color:'#594027',roughness:1});
 const stations=[[-2.4,0],[-1.9,.35],[-1.1,.54],[0,.60],[1.1,.53],[1.9,.31],[2.4,0]];
 const vertices:number[]=[],indices:number[]=[];
 // Open concave hull, with raised ends and a usable interior rather than a solid deck.
 for(const [z,w] of stations)for(let j=0;j<=12;j++){
  const a=j*Math.PI/12;vertices.push(w!*Math.cos(a),.42+.10*Math.abs(z!)/2.4-.66*Math.sin(a),z!);
 }
 for(let n=0;n<stations.length-1;n++)for(let j=0;j<12;j++){const a=n*13+j,b=a+13;indices.push(a,a+1,b,b,a+1,b+1);}
 const hull=new T.BufferGeometry();hull.setAttribute('position',new T.Float32BufferAttribute(vertices,3));hull.setIndex(indices);hull.computeVertexNormals();root.add(new T.Mesh(hull,wood));
 const box=(x:number,y:number,z:number,px:number,py:number,pz:number,mat=wood)=>{const mesh=new T.Mesh(new T.BoxGeometry(x,y,z),mat);mesh.position.set(px,py,pz);root.add(mesh);return mesh;};
 for(const side of [-1,1]){
  const path=new T.CatmullRomCurve3(stations.map(([z,w])=>new T.Vector3(side*w!, .42+.10*Math.abs(z!)/2.4,z!)));
  root.add(new T.Mesh(new T.TubeGeometry(path,48,.035,6,false),dark));
 }
 for(const x of [-.18,-.06,.06,.18])box(.11,.04,2.4,x,-.12,0);
 box(.99,.07,.36,0,.29,-.45);box(.85,.07,.29,0,.29,1.10);box(.76,.07,.27,0,.29,-1.35);
 const paddle=new T.Group(),pose=humanoid.kayakPaddlePose({...humanoid.createKayakState(),craft:'canoe',side:-1});paddle.name='kayak.paddle';paddle.position.copy(pose.position);paddle.quaternion.copy(pose.rotation);root.add(paddle);
 const shaft=new T.Mesh(new T.CylinderGeometry(.021,.021,1.32,10),dark);shaft.position.y=-.66;paddle.add(shaft);
 const grip=new T.Mesh(new T.CylinderGeometry(.025,.025,.18,10),wood);grip.rotation.z=Math.PI/2;paddle.add(grip);
 const blade=new T.Mesh(new T.SphereGeometry(1,12,8),wood);blade.name='canoe.single-blade';blade.position.y=-1.55;blade.scale.set(.14,.31,.025);paddle.add(blade);
 const foam=new T.MeshBasicMaterial({color:'#d7eff0',transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide});
 for(const side of [-1,1]){const ring=new T.Mesh(new T.RingGeometry(.17,.20,28),foam.clone());ring.name=`kayak.ripple.${side}`;ring.visible=false;ring.renderOrder=3;root.add(ring);}
 for(let n=0;n<3;n++){const wake=new T.Mesh(new T.RingGeometry(.55,.575,32,1,Math.PI*.1,Math.PI*.8),foam.clone());wake.name=`kayak.wake.${n}`;wake.visible=false;wake.renderOrder=3;root.add(wake);}
 return root;
}
