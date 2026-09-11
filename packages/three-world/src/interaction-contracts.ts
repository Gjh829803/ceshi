import type {InteractionSlot} from './contracts';

export function validateInteractionSlots(slots:readonly InteractionSlot[]):void{
 if(!Array.isArray(slots))throw new Error('INTERACTION_SLOTS_INVALID');
 const ids=new Set<string>(),fields=['slotId','label','kind','positionLocalMetersXYZ','approachLocalMetersXYZ','rotationLocalRadiansXYZ','capacity'];
 for(const slot of slots){
  if(!slot||typeof slot.slotId!=='string'||!slot.slotId.trim()||slot.slotId.length>256||ids.has(slot.slotId)||typeof slot.label!=='string'||!slot.label.trim()||!['pickup','seat'].includes(slot.kind)||slot.capacity!==1||Object.keys(slot).some(key=>!fields.includes(key)))throw new Error('INTERACTION_SLOT_INVALID');
  for(const v of [slot.positionLocalMetersXYZ,slot.approachLocalMetersXYZ,slot.rotationLocalRadiansXYZ])if(!Array.isArray(v)||v.length!==3||!v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))throw new Error('INTERACTION_SLOT_TRANSFORM_INVALID');
  ids.add(slot.slotId);
 }
}

const vectorSchema={type:'array',items:{type:'number'},minItems:3,maxItems:3};
export const INTERACTION_SLOT_SCHEMA={type:'object',properties:{slotId:{type:'string',minLength:1},label:{type:'string',minLength:1},kind:{enum:['pickup','seat']},positionLocalMetersXYZ:vectorSchema,approachLocalMetersXYZ:vectorSchema,rotationLocalRadiansXYZ:vectorSchema,capacity:{const:1}},required:['slotId','label','kind','positionLocalMetersXYZ','approachLocalMetersXYZ','rotationLocalRadiansXYZ','capacity'],additionalProperties:false};
