import { composeCameraAtPosition } from "./composition";
import { CameraController } from "./controller";
import { orbitQuaternion } from "./strategies/evaluation";
import { expect, it, vi } from "vitest";
import { CameraConstraints } from './constraints';
import { Group, PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  applyCameraPresentation,
  blendCameraProposals,
  sampleCameraPresentation,
} from "./presentation";
import type { CameraFixedFrame } from "./state";
const frame: CameraFixedFrame = {
  lifecycleGeneration: 1,
  simulationTick: 1,
  configurationRevision: 1,
  logicalTargetId: "a",
  resolvedSubjectId: "a",
  subjectGeneration: 1,
  viewId: "main",
  cameraCommitRevision: 1,
  positionWorldMetersXYZ: [10, 2, 4],
  quaternionWorldXYZW: [0, 0, 0, 1],
  lookAtWorldMetersXYZ: [10, 2, 0],
  upWorldXYZ: [0, 1, 0],
  pivotWorldMetersXYZ: [10, 2, 0],
  lens: { verticalFovDegrees: 60, nearMeters: 0.2, farMeters: 1000 },
  visibility: "preserve-framing",
  nominalDistanceMeters: 4,
};
it("applies world pose under rotated translated parent and the complete lens", () => {
  const parent = new Group();
  parent.position.set(3, 4, 5);
  parent.rotation.set(0.2, 0.7, 0);
  const camera = new PerspectiveCamera();
  parent.add(camera);
  applyCameraPresentation(camera, frame, 2);
  expect(
    camera.getWorldPosition(new Vector3()).distanceTo(new Vector3(10, 2, 4)),
  ).toBeLessThan(1e-10);
  expect(
    camera.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion()),
  ).toBeLessThan(1e-7);
  expect([camera.fov, camera.near, camera.far, camera.aspect]).toEqual([
    60, 0.2, 1000, 2,
  ]);
  expect(camera.projectionMatrix.elements[0]).toBeCloseTo(
    1 / (2 * Math.tan(Math.PI / 6)),
  );
});
it.each(["scale", "reflection", "shear"] as const)(
  "rejects %s before touching the camera",
  (mode) => {
    const parent = new Group();
    const camera = new PerspectiveCamera();
    parent.add(camera);
    if (mode === "scale") parent.scale.set(1, 2, 1);
    if (mode === "reflection") parent.scale.set(-1, 1, 1);
    if (mode === "shear") {
      parent.matrixAutoUpdate = false;
      parent.matrix.elements[4] = 0.5;
    }
    const before = camera.position.clone();
    expect(() => applyCameraPresentation(camera, frame, 2)).toThrow(/RIGID/);
    expect(camera.position).toEqual(before);
  },
);
it("samples shared epochs without changing fixed frames and cuts incompatible identity", () => {
  const current = {
    ...frame,
    simulationTick: 2,
    positionWorldMetersXYZ: [20, 2, 4] as const,
  };
  const context = {
    epoch: 3,
    previousTick: 1,
    currentTick: 2,
    alpha: 0.25,
    cut: false,
  };
  const before = JSON.stringify([frame, current, context]);
  expect(
    sampleCameraPresentation(frame, current, context).positionWorldMetersXYZ[0],
  ).toBe(12.5);
  expect(
    sampleCameraPresentation(frame, current, { ...context, cut: true })
      .positionWorldMetersXYZ[0],
  ).toBe(20);
  expect(
    sampleCameraPresentation(
      frame,
      { ...current, subjectGeneration: 2 },
      context,
    ).positionWorldMetersXYZ[0],
  ).toBe(20);
  expect(JSON.stringify([frame, current, context])).toBe(before);
});
it("uses smoothstep for transition pose and all lens fields", () => {
  const target = {
    ...frame,
    positionWorldMetersXYZ: [20, 2, 4] as const,
    lens: { verticalFovDegrees: 80, nearMeters: 0.4, farMeters: 2000 },
  };
  const result = blendCameraProposals(frame, target, 0.25);
  expect(result.positionWorldMetersXYZ[0]).toBe(11.5625);
  expect(result.lens.verticalFovDegrees).toBe(63.125);
  expect(result.lens.nearMeters).toBeCloseTo(0.23125);
  expect(result.lens.farMeters).toBe(1156.25);
});
it("validates parents without writing any matrix cache and catches later changes", async () => {
  const { validateCameraParent } = await import("./presentation");
  const parent = new Group();
  const camera = new PerspectiveCamera();
  parent.add(camera);
  parent.position.set(1, 2, 3);
  const before = parent.matrixWorld.clone();
  expect(validateCameraParent(camera).elements[12]).toBe(1);
  expect(parent.matrixWorld).toEqual(before);
  parent.scale.y = 2;
  expect(() => validateCameraParent(camera)).toThrow(/RIGID/);
});
it("rejects a nonunit proposal quaternion before camera mutation", () => {
  const camera = new PerspectiveCamera();
  expect(() =>
    applyCameraPresentation(
      camera,
      { ...frame, quaternionWorldXYZW: [0, 0, 0, 0] },
      1,
    ),
  ).toThrow(/INVALID/);
  expect(camera.position.toArray()).toEqual([0, 0, 0]);
  expect(() => applyCameraPresentation(camera, {...frame,collisionComposition:{aimQuaternionWorldXYZW:[0,0,0,1],referenceQuaternionWorldXYZW:[0,0,0,1],horizonConfidence:NaN}},1)).toThrow(/INVALID/);
});
it("replaces inherited zoom and off-axis projection modifiers with the complete declared lens", () => {
  const camera = new PerspectiveCamera();
  camera.zoom = 2;
  camera.filmOffset = 7;
  camera.setViewOffset(200, 100, 20, 10, 100, 50);
  applyCameraPresentation(camera, frame, 2);
  expect(camera.getEffectiveFOV()).toBeCloseTo(frame.lens.verticalFovDegrees);
  expect(camera.zoom).toBe(1);
  expect(camera.filmOffset).toBe(0);
  expect(camera.view?.enabled ?? false).toBe(false);
  const expected = new PerspectiveCamera(
    frame.lens.verticalFovDegrees,
    2,
    frame.lens.nearMeters,
    frame.lens.farMeters,
  );
  expect(camera.projectionMatrix.elements).toEqual(
    expected.projectionMatrix.elements,
  );
});

it("interpolates source eye and orientation independently between fixed samples", () => {
  const composition = {nominalAimQuaternionWorldXYZW:[0,0,0,1] as const,relativeAimQuaternionXYZW: [0,0,0,1] as const, referenceQuaternionWorldXYZW: [0,0,0,1] as const};
  const previous = {...frame, positionWorldMetersXYZ:[0,0,8] as const, pivotWorldMetersXYZ:[0,0,0] as const, composition};
  const current = {...previous, simulationTick:2, positionWorldMetersXYZ:[2,0,0] as const,
    composition:{...composition,nominalAimQuaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray()},
    quaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray()};
  for (const alpha of [.1,.25,.5,.75,.9]) {
    const pose = sampleCameraPresentation(previous,current,{epoch:1,previousTick:1,currentTick:2,alpha,cut:false});
    expect(new Vector3(...pose.positionWorldMetersXYZ).distanceTo(new Vector3(2*alpha,0,8*(1-alpha)))).toBeLessThan(1e-8);
    expect(new Quaternion(...pose.quaternionWorldXYZW).angleTo(new Quaternion(...previous.quaternionWorldXYZW).slerp(new Quaternion(...current.quaternionWorldXYZW),alpha))).toBeLessThan(1e-7);
  }
});

it("preserves exact endpoints and does not inherit pivot composition through a first-person blend", () => {
  const orbit = {...frame,composition:{nominalAimQuaternionWorldXYZW:[0,0,0,1] as const,relativeAimQuaternionXYZW:[0,0,0,1] as const,referenceQuaternionWorldXYZW:[0,0,0,1] as const}};
  const sight = {...frame,positionWorldMetersXYZ:frame.pivotWorldMetersXYZ};
  expect(blendCameraProposals(orbit,sight,0)).toEqual(orbit);
  expect(blendCameraProposals(orbit,sight,1)).toEqual(sight);
  expect(blendCameraProposals(orbit,sight,.5)).not.toHaveProperty('composition');
  expect(blendCameraProposals(sight,orbit,.5)).not.toHaveProperty('composition');
  const current = {...orbit,simulationTick:2};
  expect(sampleCameraPresentation(frame,current,{epoch:1,previousTick:1,currentTick:2,alpha:0,cut:true})).toEqual(current);
});

it("approaches corrected fixed endpoints continuously near a pole", () => {
  const nominal = {...frame,positionWorldMetersXYZ:[0,8,0] as const,pivotWorldMetersXYZ:[0,0,0] as const,
    quaternionWorldXYZW:orbitQuaternion(0,Math.PI/2).toArray(),
    composition:{nominalAimQuaternionWorldXYZW:orbitQuaternion(0,Math.PI/2).toArray(),relativeAimQuaternionXYZW:[0,0,0,1] as const,referenceQuaternionWorldXYZW:[0,0,0,1] as const}};
  const previous = {...nominal,...composeCameraAtPosition(nominal,[.004,8,0])};
  const current = {...nominal,...composeCameraAtPosition(nominal,[0,8,.004]),simulationTick:2};
  for(const alpha of [0,1e-8,1-1e-8,1]) {
    const pose=sampleCameraPresentation(previous,current,{epoch:1,previousTick:1,currentTick:2,alpha,cut:false});
    const endpoint=alpha<.5?previous:current;
    expect(new Quaternion(...pose.quaternionWorldXYZW).angleTo(new Quaternion(...endpoint.quaternionWorldXYZW))).toBeLessThan(1e-6);
  }
});

it.each(['third-person','shoulder'] as const)('keeps %s display frames level during simultaneous yaw and pitch input', kind => {
  for(const collision of [true,false]) for(const roll of [0,.6]) {
    const reference=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),roll);
    const referenceUp=new Vector3(0,1,0).applyQuaternion(reference);
    const subject={id:'person',generation:1,kind:'humanoid' as const,
      positionWorldMetersXYZ:[0,0,0] as const,geometryQuaternionWorldXYZW:[0,0,0,1] as const,
      semanticQuaternionWorldXYZW:reference.toArray(),geometryScaleXYZ:[1,1,1] as const,
      speedMetersPerSecond:0,body:{minimumHeightMeters:0,maximumHeightMeters:1.68},
      eyeWorldMetersXYZ:[0,1.6,0] as const,shoulderEyeWorldMetersXYZ:[0,1.5,0] as const};
    const c=new CameraController({sampleSubject:()=>subject,geometry:()=>({probe:(a,b)=>({distanceMeters:new Vector3(...a).distanceTo(new Vector3(...b))})})});
    const boundary=(simulationTick:number)=>({simulationTick,lifecycleGeneration:1,aspect:1.5});
    c.install({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'person'},activation:'immediate',views:{orbit:{kind,overrides:{
      position:{anchor:{kind:kind==='third-person'?'origin':'eye'},distanceMeters:kind==='third-person'?8.8:2,armHalfLifeSeconds:0},
      orientation:{referenceFrame:roll===0?'world-up':'subject-up',upHalfLifeSeconds:0,initialPitchRadians:.35,recenter:{enabled:false}},
      constraints:{collision:{enabled:collision}},
    }}}},boundary(0));
    c.prepareInput({orbitDeltaRadiansXY:[1,.6]},1/60,boundary(1));c.evaluateAndCommit(boundary(1));
    const checkpoint=c.captureCheckpoint(),fixed=c.inspect();
    for(const alpha of [0,.25,.5,.75,1]) {
      const p=c.sampleProjection({epoch:1,previousTick:0,currentTick:1,alpha,cut:false},1.5)!;
      const q=new Quaternion(...p.quaternionWorldXYZW);
      expect(Math.abs(new Vector3(1,0,0).applyQuaternion(q).dot(referenceUp))).toBeLessThan(1e-8);
      expect(new Vector3(0,0,-1).applyQuaternion(q).distanceTo(new Vector3(...p.pivotWorldMetersXYZ).sub(new Vector3(...p.positionWorldMetersXYZ)).normalize())).toBeLessThan(1e-8);
      if(alpha===0||alpha===1)expect(q.angleTo(new Quaternion(...(alpha===0?fixed.previous:fixed.current)!.quaternionWorldXYZW))).toBeLessThan(1e-7);
    }
    expect(c.captureCheckpoint()).toEqual(checkpoint);
  }
});

it('keeps display continuous when the next fixed frame has recovered the horizon', () => {
  const aim=orbitQuaternion(0,.3);
  const nominal={...frame,pivotWorldMetersXYZ:[0,0,0] as const,lookAtWorldMetersXYZ:[0,0,0] as const,
    positionWorldMetersXYZ:new Vector3(0,0,8).applyQuaternion(aim).toArray(),quaternionWorldXYZW:aim.toArray(),
    composition:{nominalAimQuaternionWorldXYZW:aim.toArray(),relativeAimQuaternionXYZW:[0,0,0,1] as const,referenceQuaternionWorldXYZW:[0,0,0,1] as const}};
  const previous=composeCameraAtPosition(nominal,[.004,8,.004]);
  const current=composeCameraAtPosition(nominal,[.016,8,.004],previous.collisionComposition);
  expect(previous.collisionComposition!.horizonConfidence).toBeLessThan(1);
  expect(current.collisionComposition!.horizonConfidence).toBe(1);
  const subject={id:'a',generation:1,kind:'actor' as const,positionWorldMetersXYZ:[0,0,0] as const,
    geometryQuaternionWorldXYZW:[0,0,0,1] as const,geometryScaleXYZ:[1,1,1] as const,speedMetersPerSecond:0};
  const c=new CameraController({sampleSubject:()=>subject,geometry:()=>({probe:(a,b)=>({distanceMeters:new Vector3(...a).distanceTo(new Vector3(...b))})})});
  const solve=vi.spyOn(CameraConstraints.prototype,'solve')
    .mockReturnValueOnce({proposal:previous,diagnostics:{status:'disabled',simulationTick:0}})
    .mockReturnValueOnce({proposal:current,diagnostics:{status:'disabled',simulationTick:1}});
  try {
    const boundary=(simulationTick:number)=>({simulationTick,lifecycleGeneration:1,aspect:1.5});
    c.install({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'a'},activation:'immediate',views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},orientation:{recenter:{enabled:false}}}}}},boundary(0));
    c.prepareInput({},1/60,boundary(1));c.evaluateAndCommit(boundary(1));
  } finally {solve.mockRestore();}
  const checkpoint=c.captureCheckpoint();
  for(const alpha of [0,1e-8,1-1e-8,1]) {
    const sampled=c.sampleProjection({epoch:1,previousTick:0,currentTick:1,alpha,cut:false},1.5)!;
    const endpoint=alpha<.5?previous:current;
    expect(new Quaternion(...sampled.quaternionWorldXYZW).angleTo(new Quaternion(...endpoint.quaternionWorldXYZW))).toBeLessThan(1e-6);
  }
  expect(c.captureCheckpoint()).toEqual(checkpoint);
});
