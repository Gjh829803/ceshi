import type { WorldCommand } from '@worldkit/three';
import { objectSchema } from './schema-helpers.js';
const string={type:'string',minLength:1}, boolean={type:'boolean'}, number={type:'number'};
const vec3={type:'array',items:number,minItems:3,maxItems:3};
const duration={type:'number',minimum:0};
const scalar={anyOf:[{type:'number'},{type:'boolean'},{type:'string'}]};
const command=(type:WorldCommand['type'], fields:Record<string,unknown>, optional:string[]=[])=>objectSchema({type:{const:type},...fields},['type',...Object.keys(fields).filter(name=>!optional.includes(name))]);
/** Closed transport shape; current capability/range/ownership checks remain in World.execute. */
export const WORLD_COMMAND_SCHEMA={oneOf:[
 command('entity.set-visible',{entityId:string,isVisible:boolean}),
 command('entity.set-scale',{entityId:string,scaleLocalXYZ:vec3,durationSeconds:duration},['durationSeconds']),
 command('entity.set-position',{entityId:string,positionWorldMetersXYZ:vec3,durationSeconds:duration},['durationSeconds']),
 command('entity.set-rotation',{entityId:string,rotationLocalRadiansXYZ:vec3,durationSeconds:duration},['durationSeconds']),
 command('entity.spawn',{prototypeId:string,entityId:string,positionWorldMetersXYZ:vec3}),
 command('entity.despawn',{entityId:string}),
 command('entity.attach',{childEntityId:string,parentEntityId:string,positionLocalMetersXYZ:vec3}),
 command('entity.play-action',{entityId:string,actionId:string,playback:{enum:['once','loop']}},['playback']),
 command('entity.stop-action',{entityId:string}),
 command('entity.apply-impulse',{entityId:string,impulseNewtonSecondsXYZ:vec3}),
 command('actor.move-to',{entityId:string,targetPositionWorldMetersXYZ:vec3,run:boolean},['run']),
 command('actor.follow',{entityId:string,targetEntityId:string,distanceMeters:{type:'number',minimum:0}},['distanceMeters']),
 command('actor.stop',{entityId:string}),
 command('actor.resume-autonomy',{entityId:string}),
 command('actor.set-movement',{entityId:string,movementId:string}),
 command('entity.set-geometry',{entityId:string,geometryId:string}),
 command('parameter.set',{parameterId:string,value:scalar}),
 command('action.invoke',{actionId:string,arguments:{type:'object',additionalProperties:scalar}}),
]};
