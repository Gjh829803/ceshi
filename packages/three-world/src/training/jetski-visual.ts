import {CircleGeometry,DoubleSide,Group,SphereGeometry,InstancedMesh,Matrix4,MeshBasicMaterial,Object3D} from 'three';
import type {JetSkiState} from './jetski';
/** Pure sampling: repeated renders do not emit particles or advance their ages. */
export function sampleJetSkiVisual(root:Object3D,s:JetSkiState,time:number){
 const bar=root.getObjectByName('jetski.handlebar');if(bar)bar.rotation.y=s.steeringAngle;
 const nozzle=root.getObjectByName('jetski.nozzle');if(nozzle)nozzle.rotation.y=s.steeringAngle;
 let fx=root.getObjectByName('jetski.water-fx') as Group|undefined;
 if(!fx){fx=new Group();fx.name='jetski.water-fx';fx.matrixAutoUpdate=false;
  const drops=new InstancedMesh(new SphereGeometry(1,6,4),new MeshBasicMaterial({color:'#f5fcff'}),1536);drops.name='jetski.drops';drops.frustumCulled=false;
  const foam=new InstancedMesh(new CircleGeometry(1,16),new MeshBasicMaterial({color:'#edfaff',transparent:true,opacity:.62,depthWrite:false,side:DoubleSide}),1536);foam.name='jetski.foam';foam.frustumCulled=false;
  drops.count=0;foam.count=0;fx.add(drops,foam);root.add(fx);
 }
 root.updateWorldMatrix(true,false);fx.matrix.copy(new Matrix4().copy(root.matrixWorld).invert());
 const drops=fx.getObjectByName('jetski.drops') as InstancedMesh,foam=fx.getObjectByName('jetski.foam') as InstancedMesh,dummy=new Object3D();let nd=0,nf=0;
 for(const p of s.particles){const age=time-p.born;if(age<0||age>=p.life)continue;const fade=1-age/p.life;
  dummy.position.set(p.position[0]+p.velocity[0]*age,p.position[1]+p.velocity[1]*age-(p.foam?0:4.905*age*age),p.position[2]+p.velocity[2]*age);
  if(!p.foam&&dummy.position.y<p.position[1])continue;
  dummy.rotation.set(p.foam?-Math.PI/2:0,0,p.yaw);const size=p.size*(p.foam?1+age*2:1)*Math.sqrt(fade);
  dummy.scale.set(size,p.foam?size*1.7:size*1.35,size);dummy.updateMatrix();(p.foam?foam:drops).setMatrixAt(p.foam?nf++:nd++,dummy.matrix);
 }
 drops.count=nd;foam.count=nf;drops.instanceMatrix.needsUpdate=true;foam.instanceMatrix.needsUpdate=true;
}

/** SDK-owned pools are released independently of caller-owned vehicle geometry. */
export function disposeJetSkiVisual(root:Object3D){
 const fx=root.getObjectByName('jetski.water-fx');if(!fx)return;
 fx.traverse(node=>{if(node instanceof InstancedMesh){node.dispose();node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});fx.removeFromParent();
}
