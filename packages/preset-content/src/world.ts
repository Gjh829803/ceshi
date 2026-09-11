import {buildSpaceTrainingStars} from './environment/space-training-visual';
import * as T from 'three';
import {buildInteractionVisuals} from './humanoid/interaction-visuals';
import { getMap } from './environment/maps';
import { buildGrandPrixVisuals } from './environment/grand-prix-visuals';
import { START_FINISH } from './environment/grand-prix';
import type { EnvironmentDefinition } from './environment/types';
export interface WorldVisual {interactionProps:ReturnType<typeof buildInteractionVisuals>;root:T.Group;solids:T.Object3D[];sun:T.DirectionalLight;update:(time:number,target:T.Vector3,underwater:boolean)=>void;dispose:()=>void}
/** The mesh transform is exactly the box transform consumed by environment queries. */
export function buildWorld(scene:T.Scene,map:EnvironmentDefinition=getMap('campus')):WorldVisual{
 const space=map.id==='space-training',stars=space?buildSpaceTrainingStars():null;
 const root=new T.Group();root.name=`map:${map.id}`;scene.add(root);if(stars)root.add(stars.root);
 const interactionProps=buildInteractionVisuals(root,[...(map.interactions??[]).filter(target=>target.kind==='pickup').map(target=>({id:target.id,size:target.size??[.13,.13,.13],position:target.position})),...(map.looseCrates??[]).map(crate=>({id:crate.id,size:[crate.size,crate.size,crate.size],position:crate.position}))]);
 const solids:T.Object3D[]=[],geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>(),instances=new Set<T.InstancedMesh>();
 const unit=new T.BoxGeometry(1,1,1);geometries.add(unit);
 const palette=new Map<string,T.MeshStandardMaterial>();
 function mat(color:string){let m=palette.get(color);if(!m){m=new T.MeshStandardMaterial({color,roughness:.88});palette.set(color,m);materials.add(m);}return m;}
 const circuit=map.id==='grand-prix'?buildGrandPrixVisuals(map):null;
 if(circuit){root.add(circuit.root);solids.push(...circuit.solids);}
 else for(const descriptor of map.boxes){const mesh=new T.Mesh(unit,mat(descriptor.color??'#b8c8cc'));mesh.name=descriptor.id;mesh.position.set(...descriptor.position);mesh.scale.set(...descriptor.size);mesh.rotation.set(...(descriptor.rotation??[0,0,0]));mesh.receiveShadow=true;mesh.castShadow=descriptor.size[1]>.4;mesh.userData.environmentBoxId=descriptor.id;root.add(mesh);if(descriptor.collision!==false)solids.push(mesh);}
 // Paint is deliberately non-colliding; batch by colour into instanced draws.
 const paint=new Map<string,{position:[number,number,number];size:[number,number,number];yaw:number}[]>();
 function stripe(x:number,z:number,w:number,d:number,color='#e5ece7',y=.035,yaw=0){const items=paint.get(color)??[];items.push({position:[x,y,z],size:[w,.025,d],yaw});paint.set(color,items);}
 function label(text:string,x:number,y:number,z:number,w:number,h:number,floor=true,color='#eef4f1',yaw=0,textureWidth=1024){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=textureWidth;canvas.height=160;const c=canvas.getContext('2d');if(!c)return;
  c.clearRect(0,0,textureWidth,160);c.fillStyle=color;c.font='600 70px "Segoe UI", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,textureWidth/2,80,textureWidth-24);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;textures.add(texture);
  const geometry=new T.PlaneGeometry(w,h);geometries.add(geometry);const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide});materials.add(material);
  const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);if(floor)mesh.rotation.x=-Math.PI/2;if(yaw)mesh.rotateOnWorldAxis(new T.Vector3(0,1,0),yaw);root.add(mesh);
 }
 for(const region of map.regions){if(map.id==='grand-prix'||(space&&region.id!=='space-dock')||region.id==='water'||region.id==='circuit'||region.id==='launch')continue;const [x,y,z]=region.center,[w,d]=region.size;
  for(const side of [-1,1]){stripe(x+side*w/2,z,.3,d,region.color,y+.045);stripe(x,z+side*d/2,w,.3,region.color,y+.045);}
  label(region.name,x,y+.07,z-d/2-5,Math.min(w,38),3);
 }
 if(circuit){
  for(const side of [-1,1])label('Zing Race',START_FINISH.x,9.7,START_FINISH.z+side*.71,19,1.7,false,'#24343b',side===-1?Math.PI:0,512);
  for(const {number,x,z} of START_FINISH.grid)label(String(number).padStart(2,'0'),x,.07,z-3,1.4,1.8,true,'#f4f1df',Math.PI,160);
  label('GRAND PRIX / PIT EXIT',-562,.07,-100,40,4);
  label('START / 800 M STRAIGHT',-620,.07,-398,17,2.8);
  for(const [distance,z] of [[150,150],[100,200],[50,250]])label(String(distance),-636,1.5,z!-.12,3,1.4,false,'#24343b',Math.PI);
 }
 if(map.id==='campus'){
  stripe(-285,0,46,620,'#425762',.014);for(let z=-280;z<=285;z+=28)stripe(-285,z,1.2,11);for(const x of [-306,-264])stripe(x,0,.3,590);
  for(const z of [-272,272])for(let x=-300;x<-268;x+=5)stripe(x,z,2,19);
  stripe(-12,66,130,38,'#9aafb5',.014);for(let x=-34;x<=38;x+=14){stripe(x,55,10,.18);stripe(x-5,64,.18,18);}
  const ringGeo=new T.RingGeometry(128,147,128);geometries.add(ringGeo);const ring=new T.Mesh(ringGeo,mat('#425762'));ring.rotation.x=-Math.PI/2;ring.position.set(-28,.028,73);ring.receiveShadow=true;root.add(ring);
  for(let j=0;j<100;j++){const a=j/100*Math.PI*2;stripe(-28+137.5*Math.sin(a),73+137.5*Math.cos(a),.32,4,'#e5ece7',.07,a);}
  for(let j=0;j<90;j++){const a=j/90*Math.PI*2;stripe(-28+148*Math.sin(a),73+148*Math.cos(a),1.2,5,j%2?'#e5ece7':'#d69e75',.08,a);}
  label('SUSPENSION / 逐轮悬架测试',-24,.08,96,30,2.4);
  label('VECTOR / PLAYER CAMPUS',-12,.08,41,64,6);label('22 M / DROP',-94,22.06,184,35,4);label('33 M / GLIDE',-130,33.04,-166,26,3);
  for(const [i,degree] of [5,12,22].entries())label(`${degree}° / GRADE`,5+i*22,.08,138,15,2.5);
  label('SHALLOW BANK',187,.07,-213,30,3);label('DEEP WATER / 42 M',146,.08,-65,36,3);
  label('HANGAR / 80 M CLEAR',-285,15,-294,65,5,false);label('6 DOF',-84,.06,-106,32,5);
 }
 if(map.id==='campus'||map.id==='indoor-lab'){
 const cx=map.id==='campus'?-180:0,cz=map.id==='campus'?-20:0;
 stripe(cx,cz-24,4,5,'#7dbcc5');stripe(cx-13,cz-3,12,12,'#c0ad8f');stripe(cx+14,cz-12,5,5,'#b6c9a6');
 label('INDOOR LAB',cx,6.8,cz-24.3,27,2,false);label('LOW / 2.5 M',cx-13,2.99,cz-3,11,2);label('STAIRS / 4.4 M',cx+14,.07,cz-13,14,2);label('GARAGE',cx+28,5,cz-7.2,11,2,false);
 for(let i=0;i<21;i++)stripe(cx+14,cz-7+i*.6-.25,4.8,.08,'#e3be7f',(i+1)*.2+.025);
 }
 for(const [color,items] of paint){const mesh=new T.InstancedMesh(unit,mat(color),items.length),dummy=new T.Object3D();items.forEach((item,i)=>{dummy.position.set(...item.position);dummy.scale.set(...item.size);dummy.rotation.set(0,item.yaw,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.name='paint:collision-false';mesh.receiveShadow=true;instances.add(mesh);root.add(mesh);}
 const waterMaterials:T.MeshPhysicalMaterial[]=[];
 for(const water of map.water){const geometry=new T.PlaneGeometry(water.max[0]-water.min[0],water.max[2]-water.min[2],32,32);geometry.rotateX(-Math.PI/2);geometries.add(geometry);
 const material=new T.MeshPhysicalMaterial({color:'#398d9b',roughness:.24,metalness:.2,transparent:true,opacity:.68,side:T.DoubleSide,depthWrite:false});materials.add(material);waterMaterials.push(material);
 const mesh=new T.Mesh(geometry,material);mesh.name='water:'+water.id;mesh.position.set((water.min[0]+water.max[0])/2,water.surface,(water.min[2]+water.max[2])/2);mesh.renderOrder=2;root.add(mesh);
 }
 // Camera-centred sky at the far depth plane: large maps must not expose the clear colour.
 const skyGeometry=new T.SphereGeometry(1500,24,12);geometries.add(skyGeometry);
 const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color(space?'#030712':'#76a9bd')},bottom:{value:new T.Color(space?'#030712':'#dae7e5')}},vertexShader:'varying float h;void main(){h=position.y/1500.;vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=clip.xyww;}',fragmentShader:'varying float h;uniform vec3 top;uniform vec3 bottom;void main(){gl_FragColor=vec4(mix(bottom,top,pow(max(h,0.),.7)),1.);}'});materials.add(skyMaterial);
 const sky=new T.Mesh(skyGeometry,skyMaterial);sky.frustumCulled=false;root.add(sky);root.add(new T.HemisphereLight('#e4f4fb','#728a7e',2.1));
 const sun=new T.DirectionalLight('#fff0d6',3);sun.position.set(-70,140,-90);root.add(sun,sun.target);
 const previousFog=scene.fog,previousBackground=scene.background,airFog=space?null:new T.Fog('#c1d7dd',280,1000),waterFog=new T.Fog('#246879',8,105),waterBackground=new T.Color('#246879'),sunOffset=new T.Vector3(-70,140,-90);
 scene.fog=airFog;root.updateMatrixWorld(true);
 let disposed=false;
 return {interactionProps,root,solids,sun,update(time,target,underwater){sun.position.copy(target).add(sunOffset);sun.target.position.copy(target);sky.visible=!underwater;scene.background=underwater?waterBackground:previousBackground;scene.fog=underwater?waterFog:airFog;for(const material of waterMaterials)material.roughness=.24+Math.sin(time*.6)*.025;},dispose(){if(disposed)return;disposed=true;stars?.dispose();interactionProps.dispose();circuit?.dispose();root.removeFromParent();instances.forEach(mesh=>mesh.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());sun.shadow.dispose();if(scene.fog===airFog||scene.fog===waterFog){scene.fog=previousFog;scene.background=previousBackground;}solids.length=0;root.clear();}};
}
