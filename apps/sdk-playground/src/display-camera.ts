import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createCameraProbes,type CameraProbeSample} from './display-camera-probes';
import type {DisplaySettings} from './display-settings';

type CameraSettings=Pick<DisplaySettings,'cameras'|'cameraRange'|'xray'|'opacity'|'colliders'>;
type SceneCamera=T.PerspectiveCamera|T.OrthographicCamera;
/** 世界视口只拥有鼠标观察；键盘和游玩摄像机继续由 SDK 驱动。 */
export function createCameraDisplay(options:{source:T.Camera;mount:HTMLElement;collisionDiagnostics?():CameraProbeSample|undefined;focusGameplay():void;redraw():void}) {
  const worldCamera=new T.PerspectiveCamera(50,1,.05,10000);
  const surface=document.createElement('div');surface.dataset.worldCameraView='';surface.setAttribute('aria-label','世界视角');
  surface.style.cssText='position:absolute;inset:0;pointer-events:auto;touch-action:none';surface.hidden=true;options.mount.append(surface);
  const controls=new OrbitControls(worldCamera,surface);controls.enableDamping=false;controls.enabled=false;controls.minDistance=.5;controls.maxDistance=5000;controls.panSpeed=2.4;controls.zoomSpeed=2;
  controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.PAN,RIGHT:T.MOUSE.PAN};
  let enabled=false,framed=false,drawing=false,following=false;
  const previousFollowPosition=new T.Vector3(),followPosition=new T.Vector3(),followDelta=new T.Vector3();
  // 在原 SDK 输入面上聚焦，保持键盘归属；仅拦截鼠标事件，避免同时转动游玩镜头。
  surface.addEventListener('pointerdown',event=>{options.focusGameplay();event.stopPropagation();});
  // 拖动事件继续到 document，让 OrbitControls 收到移动与释放；SDK 未收到按下，不会启动镜头拖动。
  for(const type of ['wheel','contextmenu'])surface.addEventListener(type,event=>event.stopPropagation());
  controls.addEventListener('change',()=>{if(enabled&&!drawing)options.redraw();});
  const root=new T.Group();root.name='display-camera';
  const probes=createCameraProbes();root.add(probes.mesh);
  const entries=new Map<SceneCamera,ReturnType<typeof createHelper>>();
  function createHelper(camera:SceneCamera){
    const group=new T.Group();group.name=`camera-helper:${camera.uuid}`;
    const proxy=camera instanceof T.PerspectiveCamera?new T.PerspectiveCamera():new T.OrthographicCamera();
    const frustum=new T.CameraHelper(proxy);
    const body=new T.Group();body.name='camera-model';group.add(body,frustum);
    const blue=new T.MeshBasicMaterial({color:'#368ccc',toneMapped:false});
    const dark=new T.MeshBasicMaterial({color:'#153245',toneMapped:false});
    const glass=new T.MeshBasicMaterial({color:'#70e4ff',toneMapped:false});
    const geometries:T.BufferGeometry[]=[];
    function part(geometry:T.BufferGeometry,material:T.Material,position:[number,number,number],rotationX=0){
      geometries.push(geometry);const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.x=rotationX;body.add(mesh);
    }
    part(new T.BoxGeometry(.85,.6,.85),blue,[0,0,.6]);
    part(new T.CylinderGeometry(.23,.32,.38,24),dark,[0,0,.16],Math.PI/2);
    part(new T.CylinderGeometry(.21,.21,.025,24),glass,[0,0,-.04],Math.PI/2);
    part(new T.BoxGeometry(.5,.12,.16),dark,[0,.43,.6]);
    part(new T.BoxGeometry(.1,.2,.16),dark,[-.2,.34,.6]);
    part(new T.BoxGeometry(.1,.2,.16),dark,[.2,.34,.6]);
    return {group,update(settings:CameraSettings){
      camera.updateWorldMatrix(true,false);
      if(proxy instanceof T.PerspectiveCamera&&camera instanceof T.PerspectiveCamera)proxy.copy(camera,false);
      else if(proxy instanceof T.OrthographicCamera&&camera instanceof T.OrthographicCamera)proxy.copy(camera,false);
      proxy.matrixAutoUpdate=true;proxy.matrixWorldAutoUpdate=true;
      camera.getWorldPosition(proxy.position);camera.getWorldQuaternion(proxy.quaternion);proxy.scale.setScalar(1);
      proxy.far=Math.max(proxy.near+.01,Math.min(camera.far,settings.cameraRange));
      proxy.updateProjectionMatrix();proxy.updateMatrixWorld(true);frustum.update();frustum.updateMatrixWorld(true);frustum.geometry.computeBoundingBox();frustum.geometry.computeBoundingSphere();
      body.position.copy(proxy.position);body.quaternion.copy(proxy.quaternion);
      group.traverse(object=>{const material=(object as T.Mesh).material;for(const m of Array.isArray(material)?material:material?[material]:[]){m.depthTest=!settings.xray;m.transparent=true;m.opacity=settings.opacity;}});
    },dispose(){group.removeFromParent();frustum.dispose();geometries.forEach(g=>g.dispose());blue.dispose();dark.dispose();glass.dispose();}};
  }
  return {
    get camera(){return worldCamera;},
    locate(){if(!enabled)return;framed=false;options.redraw();},
    // Keep the last displayed anchor. Reading the root here (between renders)
    // would read the restored fixed pose and reintroduce a one-frame jump.
    setFollowing(value:boolean){following=value;},
    setEnabled(value:boolean){if(enabled===value)return;enabled=value;surface.hidden=!value;controls.enabled=value;framed=false;if(value){if(surface.ownerDocument.pointerLockElement)surface.ownerDocument.exitPointerLock();}},
    render(scene:T.Scene,view:T.Camera,settings:CameraSettings,subjects:readonly T.Object3D[],width:number,height:number,draw:(camera:T.Camera,helper:T.Object3D)=>void,followTarget=subjects[0]??options.source){
      const cameras=new Set<SceneCamera>();
      if(options.source instanceof T.PerspectiveCamera||options.source instanceof T.OrthographicCamera)cameras.add(options.source);
      scene.traverseVisible(node=>{if(node instanceof T.PerspectiveCamera||node instanceof T.OrthographicCamera)cameras.add(node);});
      for(const [camera,entry] of entries)if(!cameras.has(camera)){entry.dispose();entries.delete(camera);}
      for(const camera of cameras){
        let entry=entries.get(camera);if(!entry){entry=createHelper(camera);entries.set(camera,entry);root.add(entry.group);}
        // 世界视口显式显示游玩摄像机，包括未挂到场景树上的 SDK 摄像机。
        entry.group.visible=camera!==worldCamera;if(entry.group.visible)entry.update(settings);
      }
      worldCamera.aspect=Math.max(.01,width/height);worldCamera.updateProjectionMatrix();
      drawing=true;
      try{
        followTarget.getWorldPosition(followPosition);
        if(!framed){
          const bounds=new T.Box3(),entry=entries.get(options.source as SceneCamera);
          if(entry)bounds.setFromObject(entry.group.getObjectByName('camera-model')!);
          for(const subject of subjects)bounds.union(new T.Box3().setFromObject(subject));
          if(bounds.isEmpty())bounds.setFromCenterAndSize(view.getWorldPosition(new T.Vector3()),new T.Vector3(4,4,4));
          const sphere=bounds.getBoundingSphere(new T.Sphere()),angle=Math.atan(Math.tan(T.MathUtils.degToRad(worldCamera.fov/2))*Math.min(1,worldCamera.aspect));
          controls.target.copy(sphere.center);
          const offset=new T.Vector3(1,.6,1).applyQuaternion(view.getWorldQuaternion(new T.Quaternion())).normalize();
          worldCamera.position.copy(sphere.center).addScaledVector(offset,Math.max(5,sphere.radius/Math.sin(angle)*1.15));
          worldCamera.lookAt(controls.target);controls.update();framed=true;
        }else if(following){
          // Follow the displayed subject, not the orbiting gameplay camera.
          // Turning, recentering and collision pull-in must not drag this view.
          followDelta.subVectors(followPosition,previousFollowPosition);
          worldCamera.position.add(followDelta);controls.target.add(followDelta);controls.update();
        }
        previousFollowPosition.copy(followPosition);
        probes.update(options.collisionDiagnostics?.(),options.source.getWorldPosition(new T.Vector3()),settings.colliders==='all',settings.opacity);
        scene.add(root);draw(worldCamera,root);
      }finally{root.removeFromParent();drawing=false;}
    },
    dispose(){enabled=false;controls.dispose();probes.dispose();surface.remove();root.removeFromParent();for(const entry of entries.values())entry.dispose();entries.clear();},
  };
}
