import type {EnvironmentBox} from '../environment/types';
import {BufferAttribute,BufferGeometry,LineBasicMaterial,LineSegments,CapsuleGeometry,Mesh,MeshBasicMaterial,type Scene} from 'three';

type CapsuleCollider={
  isEnabled():boolean;
  radius():number;
  halfHeight():number;
  translation():{x:number;y:number;z:number};
  rotation():{x:number;y:number;z:number;w:number};
};

/** Preview-only visualization of the current physics collider; never a physics input. */
export function createCapsuleDebug(scene:Scene){
  const mesh=new Mesh(new CapsuleGeometry(),new MeshBasicMaterial({
    color:0x72ffb4,wireframe:true,transparent:true,opacity:.7,depthTest:false,depthWrite:false,
  }));
  mesh.name='playground-humanoid-collider';mesh.visible=false;mesh.renderOrder=1000;
  scene.add(mesh);
  return {mesh,
    update(collider:CapsuleCollider|undefined,enabled:boolean){
      mesh.visible=enabled&&!!collider?.isEnabled();
      if(!mesh.visible||!collider)return;
      const radius=collider.radius(),height=collider.halfHeight()*2;
      if(mesh.geometry.parameters.radius!==radius||mesh.geometry.parameters.height!==height){
        mesh.geometry.dispose();mesh.geometry=new CapsuleGeometry(radius,height,6,12);
      }
      mesh.position.copy(collider.translation());mesh.quaternion.copy(collider.rotation());
    },
    dispose(){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();},
  };
}

export type CollisionDebugMode='person'|'all'|'off';
type DebugCollider={handle:number};
type PhysicsSource={capsule:CapsuleCollider;world:{forEachCollider(callback:(collider:DebugCollider)=>void):void;debugRender(flags?:undefined,predicate?:(collider:DebugCollider)=>boolean):{vertices:Float32Array;colors:Float32Array}}};
const noBoxes:readonly EnvironmentBox[]=[];


export function createCollisionDebug(scene:Scene,colliderId:(handle:number)=>string|undefined){
  const person=createCapsuleDebug(scene);
  let filteredBoxes:readonly EnvironmentBox[]|undefined;
  const groundIds=new Set<string>();
  const showCollider=(collider:DebugCollider)=>!groundIds.has(colliderId(collider.handle)??'');
  function updateGroundFilter(boxes:readonly EnvironmentBox[]){
    if(boxes===filteredBoxes)return;
    filteredBoxes=boxes;groundIds.clear();
    for(const box of boxes)if(box.collision!==false&&(/(^|-)ground($|-)/.test(box.id)||box.id==='basin-floor')&&(!box.rotation||box.rotation.every(a=>a===0)))groundIds.add(box.id);
  }
  const all=new LineSegments(new BufferGeometry(),new LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8,depthTest:false,depthWrite:false}));
  all.name='playground-all-colliders';all.visible=false;all.frustumCulled=false;all.renderOrder=1000;scene.add(all);
  function writeAttribute(name:string,data:Float32Array,size:number){
    const attribute=all.geometry.getAttribute(name);
    if(attribute&&attribute.array.length===data.length){attribute.array.set(data);attribute.needsUpdate=true;}
    else all.geometry.setAttribute(name,new BufferAttribute(data,size));
  }
  return {person,all,
    update(source:PhysicsSource|undefined,mode:CollisionDebugMode,boxes:readonly EnvironmentBox[]=noBoxes,includeGround=false,filter?:(collider:DebugCollider)=>boolean){
      person.update(source?.capsule,mode==='person');
      all.visible=mode==='all'&&!!source;
      if(!all.visible||!source)return;
      // Read the current world each time: map switches replace and free the old world.
      updateGroundFilter(boxes);
      const predicate=filter?(collider:DebugCollider)=>(includeGround||showCollider(collider))&&filter(collider):includeGround?undefined:showCollider;
      const {vertices,colors}=source.world.debugRender(undefined,predicate);
      const previous=all.geometry.getAttribute('position');
      if(previous&&previous.array.length!==vertices.length){all.geometry.dispose();all.geometry=new BufferGeometry();}
      writeAttribute('position',vertices,3);writeAttribute('color',colors,4);
      all.geometry.setDrawRange(0,vertices.length/3);
    },
    dispose(){person.dispose();all.removeFromParent();all.geometry.dispose();all.material.dispose();},
  };
}
