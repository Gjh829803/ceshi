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
type DebugCollider={handle:number;parent():unknown;halfExtents():{x:number;y:number;z:number}|null;translation():{x:number;y:number;z:number};rotation():{x:number;y:number;z:number;w:number}};
type PhysicsSource={capsule:CapsuleCollider;world:{forEachCollider(callback:(collider:DebugCollider)=>void):void;debugRender(flags?:undefined,predicate?:(collider:DebugCollider)=>boolean):{vertices:Float32Array;colors:Float32Array}}};
const noBoxes:readonly EnvironmentBox[]=[];


export function createCollisionDebug(scene:Scene){
  const person=createCapsuleDebug(scene);
  let filteredWorld:PhysicsSource['world']|undefined,filteredBoxes:readonly EnvironmentBox[]|undefined;
  const groundHandles=new Set<number>();
  const showCollider=(collider:DebugCollider)=>!groundHandles.has(collider.handle);
  function updateGroundFilter(world:PhysicsSource['world'],boxes:readonly EnvironmentBox[]){
    if(world===filteredWorld&&boxes===filteredBoxes)return;
    filteredWorld=world;filteredBoxes=boxes;groundHandles.clear();
    const grounds=boxes.filter(b=>b.collision!==false&&(/(^|-)ground($|-)/.test(b.id)||b.id==='basin-floor')&&(!b.rotation||b.rotation.every(a=>a===0)));
    // Broad ground slabs are tiled by physics. Match every actual tile against
    // its authored slab, rather than hiding all fixed bodies or low objects.
    world.forEachCollider(c=>{
      if(c.parent())return;
      const half=c.halfExtents(),p=c.translation(),q=c.rotation(),eps=.001;
      if(!half||Math.abs(q.x)+Math.abs(q.y)+Math.abs(q.z)>eps)return;
      if(grounds.some(b=>Math.abs(p.y-b.position[1])<eps&&Math.abs(half.y-b.size[1]/2)<eps&&Math.abs(p.x-b.position[0])+half.x<=b.size[0]/2+eps&&Math.abs(p.z-b.position[2])+half.z<=b.size[2]/2+eps))groundHandles.add(c.handle);
    });
  }
  const all=new LineSegments(new BufferGeometry(),new LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8,depthTest:false,depthWrite:false}));
  all.name='playground-all-colliders';all.visible=false;all.frustumCulled=false;all.renderOrder=1000;scene.add(all);
  function writeAttribute(name:string,data:Float32Array,size:number){
    const attribute=all.geometry.getAttribute(name);
    if(attribute&&attribute.array.length===data.length){attribute.array.set(data);attribute.needsUpdate=true;}
    else all.geometry.setAttribute(name,new BufferAttribute(data,size));
  }
  return {person,all,
    update(source:PhysicsSource|undefined,mode:CollisionDebugMode,boxes:readonly EnvironmentBox[]=noBoxes){
      person.update(source?.capsule,mode==='person');
      all.visible=mode==='all'&&!!source;
      if(!all.visible||!source)return;
      // Read the current world each time: map switches replace and free the old world.
      updateGroundFilter(source.world,boxes);
      const {vertices,colors}=source.world.debugRender(undefined,showCollider);
      const previous=all.geometry.getAttribute('position');
      if(previous&&previous.array.length!==vertices.length){all.geometry.dispose();all.geometry=new BufferGeometry();}
      writeAttribute('position',vertices,3);writeAttribute('color',colors,4);
      all.geometry.setDrawRange(0,vertices.length/3);
    },
    dispose(){person.dispose();all.removeFromParent();all.geometry.dispose();all.material.dispose();},
  };
}
