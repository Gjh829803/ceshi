import type { WorldCommand } from '@worldkit/three';
import {humanoid} from '@worldkit/three';
import { objectSchema } from './schema-helpers.js';
const string={type:'string',minLength:1}, boolean={type:'boolean'}, number={type:'number'};
const vec3={type:'array',items:number,minItems:3,maxItems:3};
const duration={type:'number',minimum:0};
const scalar={anyOf:[{type:'number'},{type:'boolean'},{type:'string'}]};
const axis={type:'number',minimum:-1,maximum:1};
const humanoidInputShape=objectSchema({forward:axis,steer:axis,roll:axis,lift:axis,pitch:axis,strafe:axis,boost:boolean,brake:boolean,slow:boolean,jump:boolean,
 actions:objectSchema(Object.fromEntries(humanoid.HUMANOID_ACTION_INPUT_FIELDS.map(key=>[key,boolean])),[])},['forward','steer','roll','lift','pitch','strafe','boost','brake','slow','jump']);
const humanoidInput={...humanoidInputShape,description:'Use emptyHumanoidInput(), change channels described by world.describe().humanoid.inputGuide for the active family, and release overrides after use. boost is not universally acceleration.'};
const humanoidProfile=objectSchema({character:objectSchema(humanoid.CONTROL_SCHEMA_PROPERTIES,[]),
 view:objectSchema(humanoid.HUMANOID_VIEW_SCHEMA_PROPERTIES,[]),
 cameraDistanceMeters:{anyOf:[humanoid.CAMERA_DISTANCE_METERS_SCHEMA,{type:'null'}]},
 camera:objectSchema(humanoid.CAMERA_SCHEMA_PROPERTIES,[]),
 vehicles:{type:'object',additionalProperties:objectSchema({...humanoid.CONTROL_SCHEMA_PROPERTIES,camera:humanoid.VEHICLE_CAMERA_DISTANCE_SCHEMA},[])}},[]);
const command=(type:WorldCommand['type'], fields:Record<string,unknown>, optional:string[]=[])=>objectSchema({type:{const:type},...fields},['type',...Object.keys(fields).filter(name=>!optional.includes(name))]);
/** Closed transport shape; current capability/range/ownership checks remain in World.execute. */
export const WORLD_COMMAND_SCHEMA={oneOf:[
 command('vehicle.prepare',{instanceId:string,spawn:objectSchema({id:string,name:string,position:vec3,yaw:number,vehicleId:string,regionId:string},['id','name','position','yaw','regionId'])}),
 {...command('vehicle.approach',{instanceId:string}),description:humanoid.VEHICLE_APPROACH_DESCRIPTION},command('vehicle.enter',{instanceId:string}),command('vehicle.exit',{}),command('vehicle.recover',{}),
 command('humanoid.set-camera-mode',{mode:{enum:[0,1,2]}}),command('humanoid.set-input',{actorId:string,input:{anyOf:[humanoidInput,{type:'null'}]}},['actorId']),
 command('humanoid.apply-profile',{profile:humanoidProfile}),
 command('humanoid.perform-action',{actorId:string,request:objectSchema({requestId:string,action:{enum:humanoid.SKILL_DEFINITIONS.map(skill=>skill.id)},targetId:string},['requestId','action'])},['actorId']),
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
