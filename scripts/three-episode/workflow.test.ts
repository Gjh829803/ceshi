import {describe,expect,it} from 'vitest';
import {RouteController} from './route-controller.js';
import {isRepairableRouteFailure} from './workflow.js';
import type {WorldSnapshot} from '@worldkit/three';

describe('Episode capture failure handoff',()=>{
 it('returns actual blocked controller failures to the route planner, instead of declaring an SDK repair',()=>{
  const controller=new RouteController({id:'segment-00',start:{positionWorldMetersXYZ:[0,0,0],facingYawRadians:0},waypoints:[{positionWorldMetersXYZ:[0,0,-20],gait:'walk'}],endBehavior:'stop',purpose:'real controller failure handoff'},
   {kind:'ground',walkSpeedMetersPerSecond:2,runSpeedMetersPerSecond:4,heightMeters:1.8,radiusMeters:.3});
  const snapshot={controlledEntityId:'actor',entities:[{id:'actor',positionWorldMetersXYZ:[0,0,0],motion:{isGrounded:true,collisionEntityIds:['wall']}}]} as unknown as WorldSnapshot;
  controller.step(snapshot,[0,0,-1],0);const result=controller.step(snapshot,[0,0,-1],3);
  expect(result.mode).toBe('failed');expect(isRepairableRouteFailure(result.diagnostic!.code)).toBe(true);
 });
 it('keeps runtime, browser, encoding and service failures out of route content repairs',()=>{
  for(const code of ['EPISODE_RUNTIME_ERROR','EPISODE_BROWSER_ERROR','EPISODE_VIDEO_CONTRACT_FAILED','EPISODE_CAPTURE_JOB_FAILED','EPISODE_RELEASE_FAILED'])expect(isRepairableRouteFailure(code)).toBe(false);
  for(const code of ['EPISODE_START_INVALID','EPISODE_ROUTE_TOO_SHORT','ROUTE_VERTICAL_MISMATCH','ROUTE_BACKTRACK_BLOCKED'])expect(isRepairableRouteFailure(code)).toBe(true);
 });
});
