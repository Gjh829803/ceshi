import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

/** Render the actual loaded model, once per asset. No external thumbnail images. */
export function renderAssetThumbnails(assets:readonly {id:string;object:T.Object3D}[],onReady:(id:string,url:string)=>void){
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(176,128);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(33,176/128,.01,500);
  scene.add(new T.HemisphereLight(0xe6faff,0x405451,2.2));
  const key=new T.DirectionalLight(0xffffff,3.3);key.position.set(5,9,8);scene.add(key);
  const fill=new T.DirectionalLight(0xc4eddf,1.5);fill.position.set(-6,3,-3);scene.add(fill);
  let index=0,cancelled=false,frame=0;
  const dispose=()=>{if(cancelled)return;cancelled=true;cancelAnimationFrame(frame);renderer.dispose();renderer.forceContextLoss();};
  const step=()=>{
    if(cancelled)return;
    const entry=assets[index++];if(!entry){dispose();return;}
    const model=clone(entry.object);model.position.set(0,0,0);model.quaternion.identity();model.visible=true;
    // Staging signs and active rider attachments are not part of an asset preview.
    model.traverse(object=>{if(object instanceof T.Sprite)object.visible=false;});
    const sprites:T.Object3D[]=[];model.traverse(o=>{if(o instanceof T.Sprite)sprites.push(o);});sprites.forEach(o=>o.removeFromParent());
    model.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
    if(!bounds.isEmpty()){
      model.position.sub(center);scene.add(model);
      const distance=Math.max(size.x*.7,size.y,size.z*.65)/Math.tan(T.MathUtils.degToRad(16.5))*.78;
      camera.position.set(distance*.75,distance*.42,distance*.9);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
      renderer.render(scene,camera);onReady(entry.id,renderer.domElement.toDataURL('image/webp',.88));scene.remove(model);
    }
    // SkeletonUtils creates new skeleton textures; geometry/materials are borrowed.
    const skeletons=new Set<T.Skeleton>();model.traverse(o=>{if(o instanceof T.SkinnedMesh)skeletons.add(o.skeleton);});skeletons.forEach(s=>s.dispose());
    frame=requestAnimationFrame(step);
  };
  frame=requestAnimationFrame(step);
  return dispose;
}
