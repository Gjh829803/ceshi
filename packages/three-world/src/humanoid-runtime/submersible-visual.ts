import {Group,SphereGeometry,InstancedMesh,Matrix4,MeshBasicMaterial,Object3D} from 'three';
import type {SubmersibleState} from './submersible';
import {markCameraVisualEffect} from './camera-visual-effects';
export function sampleSubmersibleVisual(root:Object3D,s:SubmersibleState,time:number){
 for(const side of [-1,1]){const rotor=root.getObjectByName(`submersible.rotor.${side}`);if(rotor)rotor.rotation.z=s.rotorPhase;}
 let fx=root.getObjectByName('submersible.water-fx') as Group|undefined;
 if(!fx){fx=new Group();fx.name='submersible.water-fx';fx.matrixAutoUpdate=false;
  markCameraVisualEffect(fx);
  const drops=new InstancedMesh(new SphereGeometry(1,8,6),new MeshBasicMaterial({color:'#edfaff',transparent:true,opacity:.65,depthWrite:false}),384);drops.count=0;drops.name='submersible.particles';drops.frustumCulled=false;fx.add(drops);root.add(fx);
 }
 root.updateWorldMatrix(true,false);fx.matrix.copy(new Matrix4().copy(root.matrixWorld).invert());
 const mesh=fx.children[0] as InstancedMesh,dummy=new Object3D();let count=0;
 for(const p of s.particles){const age=time-p.born;if(age<0||age>=p.life)continue;
  dummy.position.set(p.position[0]+p.velocity[0]*age,p.position[1]+p.velocity[1]*age-(p.bubble?0:4.905*age*age),p.position[2]+p.velocity[2]*age);
  if(p.bubble?dummy.position.y>p.surface:dummy.position.y<p.surface)continue;
  const size=p.size*(p.bubble?1+age*.25:1)*Math.sqrt(1-age/p.life);dummy.scale.setScalar(size);dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
 }mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
}
export function disposeSubmersibleVisual(root:Object3D){const fx=root.getObjectByName('submersible.water-fx');if(!fx)return;fx.traverse(n=>{if(n instanceof InstancedMesh){n.dispose();n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();}});fx.removeFromParent();}
