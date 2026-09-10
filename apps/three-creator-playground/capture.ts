import * as THREE from 'three';
import type {CaptureTargetRepresentative, WorldObservation} from '@worldkit/three';

type CaptureWorld=Pick<WorldObservation,'scene'|'camera'|'renderer'|'controlledObject'|'targets'|'captureTargetIds'|'targetRepresentativesById'|'targetFrontYawRadiansById'|'withPresentation'>;
export type CaptureTargetDescriptor={id:string;sourceEntityId:string;representative?:{kind:'object'|'instance';objectUuid:string;instanceIndex?:number}};
type Selection={descriptor:CaptureTargetDescriptor;object:THREE.Object3D;representative?:CaptureTargetRepresentative};
function fail(code:string):never{throw new Error(`THREE_CAPTURE_${code}`);}
function belongs(object:THREE.Object3D,root:THREE.Object3D):boolean {
  for(let current:THREE.Object3D|null=object;current;current=current.parent)if(current===root)return true;
  return false;
}
function ownValue<T>(values:Readonly<Record<string,T>>|undefined,id:string):T|undefined {
  return values&&Object.hasOwn(values,id)?values[id]:undefined;
}
function selections(world:CaptureWorld):Selection[] {
  if(!world.controlledObject?.isObject3D||!belongs(world.controlledObject,world.scene))fail('CONTROLLED_OBJECT_NOT_IN_SCENE');
  const entries=Object.entries(world.targets),sourceId=entries.find(([id,object])=>object===world.controlledObject&&id!=='player')?.[0]??entries.find(([,object])=>object===world.controlledObject)?.[0]??'player';
  const subjectRepresentative=ownValue(world.targetRepresentativesById,sourceId);
  if(subjectRepresentative&&(subjectRepresentative.kind!=='object'||subjectRepresentative.object!==world.controlledObject))fail('SUBJECT_MUST_BE_COMPLETE');
  const result:Selection[]=[{descriptor:{id:'player',sourceEntityId:sourceId},object:world.controlledObject}];
  const seenObjects=new Set<THREE.Object3D>([world.controlledObject]),seenInstances=new Map<THREE.InstancedMesh,Set<number>>();
  const ids=world.captureTargetIds??entries.map(([id])=>id);
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id))fail('TARGET_ORDER_INVALID');
  for(const id of ids){
    const root=Object.hasOwn(world.targets,id)?world.targets[id]:undefined;
    if(!root?.isObject3D||!belongs(root,world.scene))fail('TARGET_NOT_IN_SCENE');
    const representative=ownValue(world.targetRepresentativesById,id);
    if(root===world.controlledObject){
      if(representative&&(representative.kind!=='object'||representative.object!==world.controlledObject))fail('SUBJECT_MUST_BE_COMPLETE');
      continue;
    }
    if(id==='player')fail('PLAYER_ALIAS_CONFLICT');
    if(representative){
      if(!['object','instance'].includes(representative.kind)||!representative.object?.isObject3D||!belongs(representative.object,root))fail('REPRESENTATIVE_NOT_IN_ENTITY');
      if(representative.kind==='instance'&&(!(representative.object as THREE.InstancedMesh).isInstancedMesh||!Number.isSafeInteger(representative.object.count)||!Number.isSafeInteger(representative.object.instanceMatrix.count)||representative.object.count<0||representative.object.count>representative.object.instanceMatrix.count||!Number.isSafeInteger(representative.instanceIndex)||representative.instanceIndex<0||representative.instanceIndex>=representative.object.count))fail('INSTANCE_INVALID');
    }
    const object=representative?.object??root;
    if(representative?.kind==='instance'){
      const indices=seenInstances.get(representative.object)??new Set<number>();
      if(indices.has(representative.instanceIndex))continue;indices.add(representative.instanceIndex);seenInstances.set(representative.object,indices);
    }else{if(seenObjects.has(object))continue;seenObjects.add(object);}
    result.push({descriptor:{id,sourceEntityId:id,...(representative?{representative:{kind:representative.kind,objectUuid:object.uuid,...(representative.kind==='instance'?{instanceIndex:representative.instanceIndex}:{})}}:{})},object,...(representative?{representative}:{})});
  }
  return result;
}
/** Ordered real representatives; player is an alias for the complete controlled subject. */
export function captureTargets(world:CaptureWorld):CaptureTargetDescriptor[]{return selections(world).map(value=>value.descriptor);}
function basisFromMatrix(matrix:THREE.Matrix4,frontYawRadians:number){
  if(!Number.isFinite(frontYawRadians))throw new Error('THREE_TARGET_FRONT_YAW_INVALID');
  const rotation=new THREE.Quaternion();matrix.decompose(new THREE.Vector3(),rotation,new THREE.Vector3());
  const front=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),frontYawRadians).applyQuaternion(rotation).normalize();
  const up=new THREE.Vector3(0,1,0).applyQuaternion(rotation).normalize();
  const right=front.clone().cross(up).normalize();return{front,right,back:front.clone().negate(),up};
}
/** Semantic local front is -Z; retain parent and instance orientation. */
export function targetTriviewBasis(object:THREE.Object3D,frontYawRadians=0){object.updateWorldMatrix(true,false);return basisFromMatrix(object.matrixWorld,frontYawRadians);}

/** Match isolated capture visibility without allowing hidden variants to enlarge the frame. */
function visibleObjectBounds(root:THREE.Object3D){
  const bounds=new THREE.Box3(),vertex=new THREE.Vector3();root.updateWorldMatrix(true,true);
  const visit=(object:THREE.Object3D,isRoot=false)=>{
    // Capture explicitly reveals the selected root/ancestors, but leaves children as authored.
    if(!isRoot&&!object.visible)return;
    const mesh=object as THREE.Mesh,geometry=mesh.geometry,material=mesh.material;
    const materialVisible=!material||(Array.isArray(material)?material.some(value=>value.visible):material.visible);
    if(geometry&&materialVisible){
      if((object as THREE.InstancedMesh).isInstancedMesh){
        const instances=object as THREE.InstancedMesh;instances.computeBoundingBox();
        if(instances.boundingBox)bounds.union(instances.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }else{
        const positions=geometry.getAttribute('position');
        if(positions)for(let index=0;index<positions.count;index++){
          if(mesh.isMesh)mesh.getVertexPosition(index,vertex);else vertex.fromBufferAttribute(positions,index);
          bounds.expandByPoint(vertex.applyMatrix4(object.matrixWorld));
        }
      }
    }
    for(const child of object.children)visit(child);
  };
  visit(root,true);return bounds;
}

function releaseProxy(proxy:THREE.InstancedMesh){
  const errors:unknown[]=[],morph=proxy.morphTexture;
  for(const release of [()=>proxy.removeFromParent(),()=>proxy.dispose(),()=>{if(morph&&proxy.morphTexture===morph){try{morph.dispose();}finally{proxy.morphTexture=null;}}}])try{release();}catch(error){errors.push(error);}
  if(errors.length)throw errors[0];
}

function instanceProxy(selection:Selection,scene:THREE.Scene){
  const representative=selection.representative;
  if(representative?.kind!=='instance')return null;
  const source=representative.object,instance=new THREE.Matrix4();
  if(source.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender||source.onAfterRender!==THREE.Object3D.prototype.onAfterRender)fail('INSTANCE_CALLBACK_UNSUPPORTED');
  if(Object.values(source.geometry.attributes).some(attribute=>(attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute))fail('INSTANCE_ATTRIBUTES_UNSUPPORTED');
  source.getMatrixAt(representative.instanceIndex,instance);
  source.updateWorldMatrix(true,false);scene.updateWorldMatrix(true,false);
  const worldMatrix=source.matrixWorld.clone().multiply(instance);
  if(!worldMatrix.elements.every(Number.isFinite)||!Number.isFinite(worldMatrix.determinant())||Math.abs(worldMatrix.determinant())<1e-12||Math.abs(scene.matrixWorld.determinant())<1e-12)fail('INSTANCE_TRANSFORM_INVALID');
  // One actual source instance; node children are not replicated per-instance by Three.
  // The proxy owns only its instance attributes/morph texture, never source resources.
  const proxy=new THREE.InstancedMesh(source.geometry,source.material,1);
  try{
    proxy.name=`capture:${selection.descriptor.id}`;proxy.matrixAutoUpdate=false;
    proxy.matrix.copy(scene.matrixWorld.clone().invert().multiply(source.matrixWorld));proxy.matrixWorldNeedsUpdate=true;proxy.setMatrixAt(0,instance);
    if(source.instanceColor){const color=new THREE.Color();source.getColorAt(representative.instanceIndex,color);if(!color.toArray().every(Number.isFinite))fail('INSTANCE_COLOR_INVALID');proxy.setColorAt(0,color);}
    const morph=new THREE.Mesh(source.geometry,source.material);
    if(source.morphTexture){source.getMorphAt(representative.instanceIndex,morph);proxy.setMorphAt(0,morph);}
    const bounds=new THREE.Box3(),position=source.geometry.getAttribute('position'),vertex=new THREE.Vector3();
    if(!position)throw new Error('THREE_TARGET_BOUNDS_EMPTY');
    for(let index=0;index<position.count;index++)bounds.expandByPoint(morph.getVertexPosition(index,vertex).applyMatrix4(worldMatrix));
    proxy.castShadow=source.castShadow;proxy.receiveShadow=source.receiveShadow;proxy.renderOrder=source.renderOrder;proxy.frustumCulled=false;
    scene.add(proxy);proxy.updateWorldMatrix(true,false,true);return{proxy,worldMatrix,bounds};
  }catch(error){try{releaseProxy(proxy);}catch{}throw error;}
}

/** Capture only: no second scene, simulation clock, physics world or fabricated mesh. */
export function captureObjectViews(world:CaptureWorld,view:'top-down'|'entity-triview',entityIds:string[]=[],frontYawRadians:number|null=null){
  let renderPrimary=false,failed=false;
  try{return withCapturePresentation(world,()=>{
    if(view==='entity-triview'&&entityIds.length>1)fail('SINGLE_TARGET_REQUIRED');
    renderPrimary=world.renderer.getRenderTarget()===null;
    return capturePresentedObjectViews(world,view,entityIds,frontYawRadians);
  },{view:'object'});}
  catch(error){failed=true;throw error;}
  finally{
    // The object-view override must end before restoring the primary framebuffer.
    // eslint-disable-next-line no-unsafe-finally -- Report restore failure only when capture itself succeeded.
    if(renderPrimary)try{withCapturePresentation(world,()=>world.renderer.render(world.scene,world.camera));}catch(error){if(!failed)throw error;}
  }
}
/** Raw Three observers retain their direct capture behavior. */
export function withCapturePresentation<T>(world:Pick<WorldObservation,'withPresentation'>,work:()=>T,options?:{readonly view?:'world'|'object'}):T {
  return world.withPresentation?world.withPresentation(work,options):work();
}
function capturePresentedObjectViews(world:CaptureWorld,view:'top-down'|'entity-triview',entityIds:string[],frontYawRadians:number|null){
  const {scene,renderer}=world;scene.updateMatrixWorld(true);
  if(view==='entity-triview'&&entityIds.length>1)fail('SINGLE_TARGET_REQUIRED');
  const available=selections(world),ids=entityIds.length?entityIds:view==='entity-triview'?['player']:[];
  const chosen=ids.map(id=>{const selection=available.find(value=>value.descriptor.id===id||value.descriptor.id==='player'&&value.descriptor.sourceEntityId===id);if(!selection)throw new Error(`THREE_TARGET_UNKNOWN: ${id}`);return selection;});
  const old={size:renderer.getSize(new THREE.Vector2()),pixelRatio:renderer.getPixelRatio(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),background:scene.background,fog:scene.fog,autoClear:renderer.autoClear,renderTarget:renderer.getRenderTarget(),cubeFace:renderer.getActiveCubeFace(),mipmapLevel:renderer.getActiveMipmapLevel(),xr:renderer.xr.enabled,shadows:renderer.shadowMap.enabled};
  const objectState=new Map<THREE.Object3D,{visible:boolean;layers:number;lodAutoUpdate?:boolean}>();
  scene.traverse(object=>objectState.set(object,{visible:object.visible,layers:object.layers.mask,...((object as THREE.LOD).isLOD?{lodAutoUpdate:(object as THREE.LOD).autoUpdate}:{})}));
  const proxies:Array<NonNullable<ReturnType<typeof instanceProxy>>>=[];let hasPrimaryFailure=false;
  try{
    const targets=chosen.map(selection=>{const item=instanceProxy(selection,scene);if(item)proxies.push(item);return item?.proxy??selection.object;});
    const bounds=new THREE.Box3();for(const object of targets.length?targets:[scene])bounds.union(proxies.find(item=>item.proxy===object)?.bounds??(view==='entity-triview'?visibleObjectBounds(object):new THREE.Box3().setFromObject(object,true)));
    if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))throw new Error('THREE_TARGET_BOUNDS_EMPTY');
    const selection=chosen[0],orientationTargetId=selection?.descriptor.sourceEntityId??'player';
    const yaw=frontYawRadians??ownValue(world.targetFrontYawRadiansById,orientationTargetId)??ownValue(world.targetFrontYawRadiansById,ids[0]??'player')??0;
    const basis=proxies[0]&&selection?.representative?.kind==='instance'?basisFromMatrix(proxies[0].worldMatrix,yaw):targetTriviewBasis(targets[0]??scene,yaw);
    if(view==='entity-triview'){
      const included=new Set<THREE.Object3D>();for(const target of targets){target.traverse(object=>included.add(object));for(let parent:THREE.Object3D|null=target;parent;parent=parent.parent)parent.visible=true;}
      scene.traverse(object=>{
        const renderable=object as THREE.Mesh & THREE.Line & THREE.Points & THREE.Sprite & THREE.Light;
        // Layer exclusion suppresses ancestor mesh drawing without suppressing its children.
        if(renderable.isMesh||renderable.isLine||renderable.isPoints||renderable.isSprite)object.layers.mask=included.has(object)?1:0;
        else if(renderable.isLight)object.layers.enable(0);
        if((object as THREE.LOD).isLOD)(object as THREE.LOD).autoUpdate=false;
      });
      scene.background=new THREE.Color('#e6e9ef');scene.fog=null;
      // Preserve source illumination; unrelated cached shadow maps are not part of an isolated object.
      renderer.shadowMap.enabled=false;
    }
    renderer.xr.enabled=false;renderer.setRenderTarget(null);
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z,.1)*.65;
    const panels=view==='entity-triview'?3:1,panelWidth=view==='entity-triview'?512:960,height=view==='entity-triview'?640:720;
    renderer.setPixelRatio(1);renderer.setSize(panelWidth*panels,height,false);renderer.autoClear=false;renderer.setScissorTest(false);renderer.clear(true,true,true);renderer.setScissorTest(true);
    for(let index=0;index<panels;index++){
      const halfY=extent*Math.max(1,height/panelWidth),halfX=halfY*panelWidth/height;
      const camera=new THREE.OrthographicCamera(-halfX,halfX,halfY,-halfY,.01,extent*30+100);
      if(view==='top-down'){camera.position.copy(center).add(new THREE.Vector3(0,extent*4+5,0));camera.up.set(0,0,-1);}
      else{camera.position.copy(center).addScaledVector([basis.front,basis.right,basis.back][index]!,extent*4);camera.up.copy(basis.up);}
      camera.lookAt(center);camera.updateMatrixWorld(true);renderer.setViewport(index*panelWidth,0,panelWidth,height);renderer.setScissor(index*panelWidth,0,panelWidth,height);renderer.render(scene,camera);
    }
    return{view,entityIds:ids.length?ids:['player'],orientationTargetId,frontYawRadians:yaw,frontDirectionWorldXYZ:basis.front.toArray(),rightDirectionWorldXYZ:basis.right.toArray(),upDirectionWorldXYZ:basis.up.toArray(),image:renderer.domElement.toDataURL('image/png'),bounds:{minimumMetersXYZ:bounds.min.toArray(),maximumMetersXYZ:bounds.max.toArray()},panelOrder:view==='entity-triview'?['front','right','back']:['top-down'],...(selection?{captureTarget:selection.descriptor}:{})};
  }catch(error){hasPrimaryFailure=true;throw error;}
  finally{
    const cleanupErrors:unknown[]=[];const restore=(work:()=>void)=>{try{work();}catch(error){cleanupErrors.push(error);}};
    for(const {proxy} of proxies)restore(()=>releaseProxy(proxy));
    for(const [object,state] of objectState)restore(()=>{object.visible=state.visible;object.layers.mask=state.layers;if(state.lodAutoUpdate!==undefined)(object as THREE.LOD).autoUpdate=state.lodAutoUpdate;});
    restore(()=>{scene.background=old.background;scene.fog=old.fog;renderer.autoClear=old.autoClear;renderer.xr.enabled=old.xr;renderer.shadowMap.enabled=old.shadows;});
    restore(()=>renderer.setPixelRatio(old.pixelRatio));restore(()=>renderer.setSize(old.size.x,old.size.y,false));restore(()=>renderer.setRenderTarget(old.renderTarget,old.cubeFace,old.mipmapLevel));restore(()=>renderer.setViewport(old.viewport));restore(()=>renderer.setScissor(old.scissor));restore(()=>renderer.setScissorTest(old.scissorTest));
    // eslint-disable-next-line no-unsafe-finally -- Preserve a primary failure; otherwise fail an incomplete restore.
    if(!hasPrimaryFailure&&cleanupErrors.length)throw cleanupErrors[0];
  }
}
