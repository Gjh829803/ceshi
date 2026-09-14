import * as T from 'three';
import type {CameraCollisionProbeSample,CameraCollisionQuerySamples} from '@worldkit/three';
export type CameraProbeSample=CameraCollisionProbeSample;

/** Select the pose used by the caller's render phase.
 * An empty presentation sample is authoritative
 * (for example first person), so do not revive fixed probes.
 */
export function selectDisplayCameraProbeSample(samples:CameraCollisionQuerySamples|undefined,source:'fixed'|'presentation'):CameraProbeSample|undefined {
  return source==='fixed'?samples?.fixed:samples?.presentation??samples?.fixed;
}

/** 查询几何只在诊断渲染期间入场；没有 Rapier 刚体。 */
export function createCameraProbes(){
  const geometry=new T.BufferGeometry(),material=new T.LineBasicMaterial({vertexColors:true,depthTest:false,depthWrite:false,transparent:true});
  const mesh=new T.LineSegments(geometry,material);mesh.name='camera-collision-probes';mesh.frustumCulled=false;mesh.renderOrder=1100;
  return {mesh,update(sample:CameraProbeSample|undefined,eye:T.Vector3,enabled:boolean,opacity:number){
    mesh.visible=enabled&&!!sample?.probes.length;if(!mesh.visible||!sample)return;
    const positions:number[]=[],colors:number[]=[];
    const clear=new T.Color('#54e9de'),blocked=new T.Color('#ffad42'),contact=new T.Color('#ff4969');
    function line(a:readonly number[],b:readonly number[],color:T.Color){positions.push(...a,...b);colors.push(color.r,color.g,color.b,color.r,color.g,color.b);}
    function sphere(center:readonly number[],radius:number,color:T.Color){
      for(let axis=0;axis<3;axis++)for(let n=0;n<24;n++){
        const point=(angle:number)=>{const p=[...center];p[(axis+1)%3]!+=Math.cos(angle)*radius;p[(axis+2)%3]!+=Math.sin(angle)*radius;return p;};
        line(point(n*Math.PI/12),point((n+1)*Math.PI/12),color);
      }
    }
    for(const probe of sample.probes){
      const from=new T.Vector3(...probe.from),to=new T.Vector3(...probe.to),length=from.distanceTo(to),hit=probe.hit;
      const limited=!!hit.startedOverlapping||hit.colliderEntityId!==undefined||hit.distanceMeters<length-1e-8,color=limited?blocked:clear;
      line(probe.from,probe.to,color);
      const stop=from.clone().lerp(to,length?Math.min(1,hit.distanceMeters/length):0);
      sphere(stop.toArray(),probe.radius,color);
      if(hit.hitPositionWorldMetersXYZ){
        const p=new T.Vector3(...hit.hitPositionWorldMetersXYZ);sphere(p.toArray(),.07,contact);
        if(hit.normalWorldXYZ)line(p.toArray(),p.clone().addScaledVector(new T.Vector3(...hit.normalWorldXYZ),.5).toArray(),contact);
      }
    }
    sphere(eye.toArray(),sample.probes.at(-1)!.radius,clear);
    let position=geometry.getAttribute('position'),color=geometry.getAttribute('color');
    if(!position||position.array.length<positions.length){
      // 容量只在需要时增长，并释放旧 GPU 缓冲，避免每帧替换 attribute。
      geometry.dispose();const capacity=3*Math.pow(2,Math.ceil(Math.log2(Math.max(1,positions.length/3))));
      position=new T.BufferAttribute(new Float32Array(capacity),3);color=new T.BufferAttribute(new Float32Array(capacity),3);
      geometry.setAttribute('position',position);geometry.setAttribute('color',color);
    }
    position.array.set(positions);color.array.set(colors);position.needsUpdate=true;color.needsUpdate=true;geometry.setDrawRange(0,positions.length/3);material.opacity=opacity;
    mesh.userData.sampleId=sample.sampleId;mesh.userData.source=sample.source;mesh.userData.simulationTick=sample.simulationTick;
  },dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
