import { Object3D, Quaternion, Vector3 } from 'three';

/** Pure pose projection; no clock, physics, resources or extra animation owner.
 * Named nodes also survive the catalog GLB load. Call after rider interpolation.
 */
export function sampleSkiEquipment(equipment:Object3D,rider:Object3D|null):void {
  equipment.updateWorldMatrix(true,true);
  rider?.updateWorldMatrix(true,true);
  for(const [suffix,boneSide,side] of [['left','l',1],['right','r',-1]] as const){
    const pole=equipment.getObjectByName(`ski.pole.${suffix}`);
    if(!pole?.parent)continue;
    const hand=rider?.getObjectByName(`hand_${boneSide}`);
    if(hand){
      pole.position.copy(pole.parent.worldToLocal(hand.getWorldPosition(new Vector3())));
      // Keep the shaft trailing behind the hand, with its basket above the snow.
      const down=new Vector3(side*.25,-1,-.5).normalize();
      pole.quaternion.setFromUnitVectors(new Vector3(0,-1,0),down);
    }else{pole.position.set(side*.55,1.05,0);pole.rotation.set(.35,0,0);}
    const board=equipment.getObjectByName(`ski.board.${suffix}`);
    const foot=rider?.getObjectByName(`foot_${boneSide}`);
    if(board?.parent){
      if(foot){const p=board.parent.worldToLocal(foot.getWorldPosition(new Vector3()));board.position.set(p.x,0,p.z+.06);}
      else board.position.set(side*.16,0,0);
      board.quaternion.copy(new Quaternion());
    }
  }
  equipment.updateWorldMatrix(false,true);
}
