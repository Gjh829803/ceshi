import * as T from 'three';
/** 无动力载具只建外形；人物仍来自原训练场。 */
export function buildSoaringShell(root:T.Group,kind:'paraglider'|'wingsuit'|'balloon',paint:T.Material){
 const dark=new T.MeshStandardMaterial({color:'#34434b'}),fabric=new T.MeshStandardMaterial({color:kind==='wingsuit'?'#ef792f':'#e6d994',side:T.DoubleSide});
 const part=(name:string,size:[number,number,number],p:[number,number,number],mat:T.Material=dark,parent:T.Object3D=root)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.name=name;m.position.set(...p);parent.add(m);return m;};
 const line=(a:T.Vector3,b:T.Vector3,parent:T.Object3D=root)=>{const m=new T.Line(new T.BufferGeometry().setFromPoints([a,b]),new T.LineBasicMaterial({color:'#34434b'}));parent.add(m);return m;};
 const canopy=new T.Group();root.add(canopy);canopy.name='soaring-canopy';
 const cloth=new T.Mesh(new T.BufferGeometry(),fabric);root.add(cloth);cloth.name='wingsuit-membrane';
 if(kind==='balloon'){
  part('basket-floor',[1.6,.16,1.6],[0,.08,0],paint);
  for(const x of [-.75,.75])part('basket-wall',[.10,.8,1.6],[x,.56,0],paint);
  for(const z of [-.75,.75])part('basket-wall',[1.4,.8,.10],[0,.56,z],paint);
  for(const x of [-.65,.65])for(const z of [-.65,.65]){part('burner-support',[.05,2.6,.05],[x,1.3,z]);line(new T.Vector3(x,2.6,z),new T.Vector3(x*3,5,z*3));}
  part('burner',[.5,.15,.5],[0,2.6,0]);
  const envelope=new T.Mesh(new T.SphereGeometry(6.6,32,20),paint);envelope.name='balloon-envelope';envelope.position.y=10.8;root.add(envelope);
  const flame=part('burner-flame',[.12,.7,.12],[0,3.0,0],new T.MeshBasicMaterial({color:'#ffad42'}));
  canopy.visible=cloth.visible=false;
  return {update:(state:{throttle:number})=>{flame.visible=state.throttle>0;}};
 }
 const wing=new T.PlaneGeometry(6.4,2.1,20,4);wing.rotateX(-Math.PI/2);
 const points=wing.attributes.position!;for(let n=0;n<points.count;n++)points.setY(n,6-.12*points.getX(n)**2);wing.computeVertexNormals();
 const sail=new T.Mesh(wing,paint);sail.material=new T.MeshStandardMaterial({color:(paint as T.MeshStandardMaterial).color,side:T.DoubleSide});sail.name='paraglider-wing';canopy.add(sail);
 const suspension:{line:T.Line;x:number;z:number}[]=[];
 for(const x of [-2.4,2.4])for(const z of [-.8,.8])suspension.push({line:line(new T.Vector3(Math.sign(x)*.28,1.5,0),new T.Vector3(x,6-.12*x*x,z),canopy),x,z});
 const equipment=new T.Group();equipment.name='wingsuit-ground-equipment';root.add(equipment);
 if(kind==='wingsuit'){
  const orange=new T.MeshStandardMaterial({color:'#ef792f',side:T.DoubleSide});
  part('equipment-mat',[2.8,.035,2.8],[0,.025,0],new T.MeshStandardMaterial({color:'#193b50'}),equipment);
  part('suit-torso',[.55,.12,.85],[0,.13,.15],orange,equipment);
  for(const sign of [-1,1]){
   const arm=part('suit-arm',[.86,.11,.23],[sign*.61,.13,.48],orange,equipment);arm.rotation.y=-sign*.18;
   part('suit-leg',[.23,.11,.75],[sign*.2,.13,-.6],orange,equipment);
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([sign*.98,.125,.4,sign*.25,.125,.2,sign*.25,.125,-.85],3));g.computeVertexNormals();equipment.add(new T.Mesh(g,orange));
  }
  part('packed-parachute',[.38,.22,.43],[0,.27,.18],dark,equipment);
 }
 const harness=part('soaring-harness',[.58,.10,.45],[0,.825,0]);
 const handles=[-1,1].map(sign=>part('soaring-brake-handle',[.12,.035,.07],[sign*.3,2,.25]));
 const brakeLines=handles.map(handle=>line(handle.position.clone(),new T.Vector3(Math.sign(handle.position.x)*2.4,5.31,-.8),canopy));
 let rider:T.Object3D|undefined;
 const bones:Record<string,T.Object3D|undefined>={};
 const rootPosition=new T.Vector3(),rootRotation=new T.Quaternion(),rootScale=new T.Vector3();
 const offset=new T.Vector3(),startPoint=new T.Vector3(),endPoint=new T.Vector3(),delta=new T.Vector3(),lineScale=new T.Vector3(),lineRotation=new T.Quaternion(),upAxis=new T.Vector3(0,1,0);
 const rootTransform=()=>root.matrixWorld.decompose(rootPosition,rootRotation,rootScale);
 const localWorld=(out:T.Vector3,x:number,y:number,z:number)=>out.set(x,y,z).applyMatrix4(root.matrixWorld);
 const bonePoint=(name:string,out:T.Vector3)=>{const bone=bones[name];if(!bone)return false;out.setFromMatrixPosition(bone.matrixWorld);return true;};
 const harnessPoint=(out:T.Vector3)=>bonePoint('pelvis',out)?out.add(offset.set(0,-.175,0).applyQuaternion(rootRotation)):localWorld(out,0,.825,0);
 const handPoint=(n:number,out:T.Vector3)=>bonePoint(n===0?'hand_r':'hand_l',out)?out.add(offset.set(0,-.025,.025).applyQuaternion(rootRotation)):localWorld(out,n===0?-.3:.3,2,.25);
 // 读取渲染器已经更新的最终矩阵，避免每根绳索递归更新人物和场景祖先。
 harness.frustumCulled=false;harness.onBeforeRender=()=>{rootTransform();harness.matrixWorld.compose(harnessPoint(startPoint),rootRotation,rootScale);};
 handles.forEach((handle,n)=>{handle.frustumCulled=false;handle.onBeforeRender=()=>{rootTransform();handle.matrixWorld.compose(handPoint(n,startPoint),rootRotation,rootScale);};});
 const bindLine=(rope:T.Line,start:(out:T.Vector3)=>T.Vector3,end:(out:T.Vector3)=>T.Vector3)=>{
  rope.geometry.setFromPoints([new T.Vector3(),new T.Vector3(0,1,0)]);rope.frustumCulled=false;
  rope.onBeforeRender=()=>{
   rootTransform();start(startPoint);end(endPoint);delta.subVectors(endPoint,startPoint);const length=delta.length();
   if(length>1e-8)delta.multiplyScalar(1/length);else delta.copy(upAxis);
   rope.matrixWorld.compose(startPoint,lineRotation.setFromUnitVectors(upAxis,delta),lineScale.set(1,length,1));
  };
 };
 suspension.forEach(({line:rope,x,z})=>bindLine(rope,out=>harnessPoint(out).add(offset.set(Math.sign(x)*.28,.08,Math.sign(z)*.16).applyQuaternion(rootRotation)),out=>out.set(x,6-.12*x*x,z).applyMatrix4(canopy.matrixWorld)));
 brakeLines.forEach((rope,n)=>{rope.name='soaring-brake-line-'+n;bindLine(rope,out=>handPoint(n,out),out=>out.set(n===0?-2.4:2.4,5.31,-.8).applyMatrix4(canopy.matrixWorld));});

 const positions=new T.BufferAttribute(new Float32Array(18),3).setUsage(T.DynamicDrawUsage);
 const normals=new T.BufferAttribute(new Float32Array(18),3).setUsage(T.DynamicDrawUsage);
 cloth.geometry.setAttribute('position',positions);cloth.geometry.setAttribute('normal',normals);cloth.frustumCulled=false;
 const inverseRoot=new T.Matrix4(),hand=new T.Vector3(),hip=new T.Vector3(),foot=new T.Vector3(),normal=new T.Vector3(),edge=new T.Vector3();
 cloth.onBeforeRender=()=>{
  if(!rider||!cloth.visible)return;
  inverseRoot.copy(root.matrixWorld).invert();
  const point=(name:string,out:T.Vector3)=>{if(!bonePoint(name,out))out.set(0,0,0);else out.applyMatrix4(inverseRoot);};
  for(let n=0;n<2;n++){
   const side=n===0?'l':'r';point('hand_'+side,hand);point('pelvis',hip);point('foot_'+side,foot);
   hand.y-=.035;hip.y-=.08;foot.y-=.035;
   positions.setXYZ(n*3,hand.x,hand.y,hand.z);positions.setXYZ(n*3+1,hip.x,hip.y,hip.z);positions.setXYZ(n*3+2,foot.x,foot.y,foot.z);
   normal.subVectors(foot,hip).cross(edge.subVectors(hand,hip)).normalize();
   for(let j=0;j<3;j++)normals.setXYZ(n*3+j,normal.x,normal.y,normal.z);
  }
  cloth.matrixWorld.copy(root.matrixWorld);positions.needsUpdate=true;normals.needsUpdate=true;
 };
 function update(state:{grounded?:boolean;aircraft?:{canopy:number;wearable?:{phase:string;landingSeconds:number}}|undefined},avatar?:T.Object3D){
  // 人物资源可能异步挂入同一根节点；未找到骨架前允许重新绑定。
  if(rider!==avatar||(avatar&&!bones.pelvis)){
   rider=avatar;
   for(const name of ['pelvis','hand_l','hand_r','foot_l','foot_r'])bones[name]=avatar?.getObjectByName(name);
  }
  equipment.visible=kind==='wingsuit'&&!avatar;
  const landing=state.aircraft?.wearable?.landingSeconds??0;
  const open=(kind==='paraglider'?1:state.aircraft?.canopy??0)*Math.max(0,1-Math.max(0,landing-1));
  const inflated=Math.max(0,Math.min(1,(open-.15)/.85));
  canopy.visible=open>0;canopy.scale.set(Math.max(.03,inflated),.2+.8*Math.min(1,open/.3),Math.max(.03,inflated));
  harness.visible=open>.15&&!!avatar&&!state.grounded;handles.forEach(h=>h.visible=open>.15&&!!avatar);cloth.visible=kind==='wingsuit'&&open<.8&&!!avatar;

 }
 update({});return {update};
}
