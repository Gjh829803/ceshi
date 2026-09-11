import * as T from 'three';
/** 固定方向的星点提供姿态参照；只绘制天空，不参与运动、碰撞或相机更新。 */
export function buildSpaceTrainingStars(){
 const points:number[]=[];let seed=731;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let n=0;n<800;n++){const y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);points.push(Math.cos(a)*r,y,Math.sin(a)*r);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
 const material=new T.ShaderMaterial({depthWrite:false,depthTest:true,vertexShader:'void main(){vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=clip.xyww;gl_PointSize=1.6;}',fragmentShader:'void main(){if(distance(gl_PointCoord,vec2(.5))>.5)discard;gl_FragColor=vec4(.67,.75,.84,1.);}'});
 const root=new T.Points(geometry,material);root.name='space-training-stars';root.frustumCulled=false;root.renderOrder=1;
 return {root,dispose(){root.removeFromParent();geometry.dispose();material.dispose();}};
}
