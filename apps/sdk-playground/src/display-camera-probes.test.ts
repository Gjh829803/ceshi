import {expect,it} from 'vitest';
import {Vector3} from 'three';
import {createCameraProbes,selectDisplayCameraProbeSample,type CameraProbeSample} from './display-camera-probes';

const sample=(source:CameraProbeSample['source'],sampleId:number,probes:CameraProbeSample['probes']=[]):CameraProbeSample=>({source,sampleId,simulationTick:12,probes,droppedProbes:0});

it('selects presentation then committed fixed queries without reviving empty probes',()=>{
  const fixed=sample('fixed',1),presentation=sample('presentation',3);
  expect(selectDisplayCameraProbeSample({fixed,presentation},'presentation')).toBe(presentation);
  expect(selectDisplayCameraProbeSample({fixed,presentation},'fixed')).toBe(fixed);
  expect(selectDisplayCameraProbeSample({fixed},'presentation')).toBe(fixed);
  expect(selectDisplayCameraProbeSample({},'fixed')).toBeUndefined();
  expect(selectDisplayCameraProbeSample(undefined,'fixed')).toBeUndefined();
});

it('draws detached query geometry and retires it for empty samples or disabled inspection',()=>{
  const display=createCameraProbes();
  const fixed=sample('fixed',3,[{from:[0,0,4],to:[0,0,0],radius:.25,hit:{distanceMeters:2,colliderEntityId:'wall',hitPositionWorldMetersXYZ:[0,0,2],normalWorldXYZ:[0,0,1]}}]);
  const before=structuredClone(fixed);
  try{
    display.update(fixed,new Vector3(0,0,4),true,.7);
    expect(display.mesh.visible).toBe(true);
    expect(display.mesh.geometry.drawRange.count).toBeGreaterThan(100);
    expect(display.mesh.userData).toMatchObject({sampleId:3,source:'fixed',simulationTick:12});
    expect(fixed).toEqual(before);
    display.update(sample('presentation',4),new Vector3(),true,.7);
    expect(display.mesh.visible).toBe(false);
    display.update(fixed,new Vector3(),false,.7);
    expect(display.mesh.visible).toBe(false);
  }finally{display.dispose();}
});
