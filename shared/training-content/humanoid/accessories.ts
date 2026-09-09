import * as T from 'three';
import type {TrainingCharacter,CharacterAttachmentPoint} from '@worldkit/three';

export const ACCESSORY_CHOICES = [
  {point:'head',label:'帽子'},
  {point:'back',label:'披风（固定）'},
  {point:'handLeft',label:'左手提灯'},
  {point:'handRight',label:'右手手杖'},
  {point:'footLeft',label:'左脚护具'},
  {point:'footRight',label:'右脚护具'},
] as const;

function buildAccessory(point:CharacterAttachmentPoint):T.Group {
  const root=new T.Group();root.name=`playground-accessory:${point}`;
  const material=new T.MeshStandardMaterial({color:point==='back'?'#356b98':'#c89435',roughness:.8});
  const add=(geometry:T.BufferGeometry,position:T.Vector3)=>{const mesh=new T.Mesh(geometry,material);mesh.position.copy(position);root.add(mesh);return mesh;};
  if(point==='head'){
    // Seat the smaller hat over the crown of the Source101 head.
    root.position.y=-.04;
    add(new T.CylinderGeometry(.16,.16,.02,20),new T.Vector3(0,.01,0));
    add(new T.CylinderGeometry(.10,.115,.11,20),new T.Vector3(0,.075,0));
  }else if(point==='back'){
    // A rigid sample, deliberately short to make posture changes easy to inspect.
    add(new T.BoxGeometry(.48,.62,.025),new T.Vector3(0,-.23,-.07));
  }else if(point==='handLeft'){
    const handle=add(new T.TorusGeometry(.065,.012,6,12),new T.Vector3(0,-.045,0));handle.rotation.y=Math.PI/2;
    add(new T.BoxGeometry(.12,.16,.12),new T.Vector3(0,-.18,0));
  }else if(point==='handRight'){
    add(new T.CylinderGeometry(.022,.025,.68,10),new T.Vector3(0,-.21,0));
    add(new T.SphereGeometry(.04,10,8),new T.Vector3(0,.15,0));
  }else{
    // Source101 foot anchors are at the ankles; the toe extends along reference +Z.
    add(new T.BoxGeometry(.16,.045,.29),new T.Vector3(0,-.067,.065));
    add(new T.BoxGeometry(.15,.075,.22),new T.Vector3(0,-.027,.07));
  }
  return root;
}

/** Playground owns all sample geometry. Toggle changes use no simulation loop. */
export function createAccessoryPreview(character:TrainingCharacter){
  const objects=new Map<CharacterAttachmentPoint,T.Group>(),attached=new Map<CharacterAttachmentPoint,()=>void>();
  return {
    enabled:(point:CharacterAttachmentPoint)=>attached.has(point),
    set(point:CharacterAttachmentPoint,enabled:boolean){
      if(enabled===attached.has(point))return;
      if(!enabled){attached.get(point)!();attached.delete(point);return;}
      let object=objects.get(point);
      if(!object){object=buildAccessory(point);objects.set(point,object);}
      attached.set(point,character.attach(point,object));
    },
    snapshot:()=>Object.fromEntries(ACCESSORY_CHOICES.map(({point})=>[point,attached.has(point)])),
    dispose(){
      for(const detach of attached.values())detach();attached.clear();
      const materials=new Set<T.Material>();
      for(const object of objects.values())object.traverse(node=>{if(node instanceof T.Mesh){node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}});
      for(const material of materials)material.dispose();objects.clear();
    },
  };
}
