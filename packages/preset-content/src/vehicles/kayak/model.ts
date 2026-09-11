import * as T from 'three';
import {KAYAK_SPEC} from './spec';
export function buildKayakModel(){
 const root=new T.Group();root.name='kayak';
 const red=new T.MeshStandardMaterial({color:KAYAK_SPEC.color,roughness:.8,side:T.DoubleSide}),dark=new T.MeshStandardMaterial({color:'#29353b',roughness:.85});
 const stations=[[-2.2,.005],[-1.8,.19],[-1,.34],[-.2,.4],[.7,.36],[1.55,.22],[2.2,.005]],vertices:number[]=[],indices:number[]=[];
 for(const [z,w] of stations)for(let j=0;j<=12;j++){const a=j*Math.PI/12;vertices.push(w!*Math.cos(a),.14-.37*Math.sin(a),z!);}
 for(let n=0;n<stations.length-1;n++)for(let j=0;j<12;j++){const a=n*13+j,b=a+13;indices.push(a,a+1,b,b,a+1,b+1);}
 const hull=new T.BufferGeometry();hull.setAttribute('position',new T.Float32BufferAttribute(vertices,3));hull.setIndex(indices);hull.computeVertexNormals();root.add(new T.Mesh(hull,red));
 const outline=new T.Shape();stations.forEach(([z,w],i)=>i?outline.lineTo(w!,z!):outline.moveTo(w!,z!));[...stations].reverse().forEach(([z,w])=>outline.lineTo(-w!,z!));outline.closePath();
 const hole=new T.Path();hole.absellipse(0,-.18,.31,.88,0,Math.PI*2,true,0);outline.holes.push(hole);
 const deck=new T.Mesh(new T.ShapeGeometry(outline,32),red);deck.rotation.x=Math.PI/2;deck.position.y=.14;deck.name='kayak.deck';root.add(deck);
 const rim=new T.Mesh(new T.TorusGeometry(1,.035,8,48),dark);rim.scale.set(.32,.89,1);rim.rotation.x=Math.PI/2;rim.position.set(0,.16,-.18);root.add(rim);
 const seat=new T.Mesh(new T.BoxGeometry(.48,.06,.45),dark);seat.position.set(0,.07,-.35);root.add(seat);
 const back=new T.Mesh(new T.BoxGeometry(.48,.29,.06),dark);back.position.set(0,.20,-.59);root.add(back);
 const paddle=new T.Group();paddle.name='kayak.paddle';root.add(paddle);
 const shaft=new T.Mesh(new T.CylinderGeometry(.017,.017,1.85,10),dark);shaft.rotation.z=Math.PI/2;paddle.add(shaft);
 for(const side of [-1,1]){const blade=new T.Mesh(new T.SphereGeometry(1,16,8),red);blade.name=`kayak.blade.${side}`;blade.scale.set(.31,.028,.13);blade.position.x=side*1.05;paddle.add(blade);}
 paddle.position.set(0,.53,-.20);
 const foam=new T.MeshBasicMaterial({color:'#d7eff0',transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide});
 for(const side of [-1,1]){const ring=new T.Mesh(new T.RingGeometry(.17,.20,28),foam.clone());ring.name=`kayak.ripple.${side}`;ring.rotation.x=-Math.PI/2;ring.visible=false;ring.renderOrder=3;root.add(ring);}
 for(let i=0;i<3;i++){const wake=new T.Mesh(new T.RingGeometry(.4,.425,32,1,Math.PI*.1,Math.PI*.8),foam.clone());wake.name=`kayak.wake.${i}`;wake.rotation.x=-Math.PI/2;wake.visible=false;wake.renderOrder=3;root.add(wake);}
 return root;
}
