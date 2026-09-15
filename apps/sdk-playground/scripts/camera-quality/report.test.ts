import {expect,it} from 'vitest';
import {compareCameraRoute,type CameraRouteFrame} from './report';
const frame:CameraRouteFrame={tick:6,position:[0,2,8],quaternion:[0,0,0,1],actor:[0,0,0],viewId:'third-person',verticalFovDegrees:58,controlForward:[0,0,-1]};
it('does not confuse quaternion sign with orientation drift and measures actor/input changes independently',()=>{
 const result=compareCameraRoute([{...frame,position:[.1,2,8],quaternion:[0,0,0,-1],actor:[0,0,1],controlForward:[1,0,0]}],[frame]);
 expect(result.maximumOrientationErrorRadians).toBe(0);expect(result.maximumPositionErrorMeters).toBeCloseTo(.1);
 expect(result.maximumActorErrorMeters).toBe(1);expect(result.maximumControlDirectionError).toBeCloseTo(Math.SQRT2);
});
it('rejects mismatched sample identities instead of presenting an unrelated comparison',()=>{
 expect(()=>compareCameraRoute([],[frame])).toThrow('CAMERA_ROUTE_SAMPLE_COUNT_MISMATCH');
 expect(()=>compareCameraRoute([{...frame,tick:7}],[frame])).toThrow('CAMERA_ROUTE_IDENTITY_MISMATCH');
 expect(()=>compareCameraRoute([{...frame,viewId:'shoulder'}],[frame])).toThrow('CAMERA_ROUTE_IDENTITY_MISMATCH');
});
