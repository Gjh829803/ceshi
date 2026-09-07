import type { WorldCommand } from '@worldkit/three';
import { objectSchema } from './schema-helpers.js';
const string={type:'string',minLength:1}, boolean={type:'boolean'}, number={type:'number'};
const vec3={type:'array',items:number,minItems:3,maxItems:3};
const duration={type:'number',minimum:0};
const scalar={anyOf:[{type:'number'},{type:'boolean'},{type:'string'}]};
const axis={type:'number',minimum:-1,maximum:1};
const trainingInput=objectSchema({forward:axis,steer:axis,roll:axis,lift:axis,pitch:axis,strafe:axis,boost:boolean,brake:boolean,slow:boolean,jump:boolean,
 humanoid:objectSchema(Object.fromEntries(['toggleCrouch','slide','roll','interact','putDown','prone','climb','toggleSwimStyle'].map(key=>[key,boolean])),[])},['forward','steer','roll','lift','pitch','strafe','boost','brake','slow','jump']);
const trainingProfile=objectSchema({character:objectSchema({speed:number,accel:number,grip:number,steer:number},[]),
 cameraDistanceMeters:{anyOf:[{type:'number',minimum:1,maximum:40},{type:'null'}]},
 camera:objectSchema({recenterDelaySeconds:number,recenterResponsePerSecond:number,followResponsePerSecond:number,baseFovDegrees:number,targetHeightOffset:number,horizontalOffset:number,collisionEnabled:boolean,collisionRadiusMeters:number},[]),
 vehicles:{type:'object',additionalProperties:objectSchema({speed:number,accel:number,grip:number,steer:number,camera:number},[])}},[]);
const command=(type:WorldCommand['type'], fields:Record<string,unknown>, optional:string[]=[])=>objectSchema({type:{const:type},...fields},['type',...Object.keys(fields).filter(name=>!optional.includes(name))]);
/** Closed transport shape; current capability/range/ownership checks remain in World.execute. */
export const WORLD_COMMAND_SCHEMA={oneOf:[
 command('training.prepare',{instanceId:string,spawn:objectSchema({id:string,name:string,position:vec3,yaw:number,vehicleId:string,regionId:string},['id','name','position','yaw','regionId'])}),
 command('training.approach',{instanceId:string}),command('training.enter',{instanceId:string}),command('training.exit',{}),
 command('training.camera',{mode:{enum:[0,1,2]}}),command('training.input',{input:{anyOf:[trainingInput,{type:'null'}]}}),
 command('training.profile',{profile:trainingProfile}),
 command('training.action',{request:objectSchema({requestId:string,action:{enum:['roll','slide','pickup','putDown','sit','standUp']},targetId:string},['requestId','action'])}),
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
