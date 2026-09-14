import { captureCameraComposition, composeCameraAtPosition } from "./composition";
import { relocateCameraProposal } from "./lifecycle";
import { orbitQuaternion } from "./strategies/evaluation";
import { prepareCameraIntent } from "./strategies/evaluation";
import { expect, it } from "vitest";
import { Box3, Ray, Vector3, Quaternion } from "three";
import { CameraConstraints } from "./constraints";
import {
  resolveCameraConfiguration,
  parseCameraDocument,
} from "../config/camera/index";
import { evaluateThirdPerson } from "./strategies/third-person";
import type { CameraSubjectFacts } from "./subject";
const subject: CameraSubjectFacts = {
  id: "actor",
  generation: 1,
  kind: "actor",
  positionWorldMetersXYZ: [0, 0, 0],
  geometryQuaternionWorldXYZW: [0, 0, 0, 1],
  geometryScaleXYZ: [1, 1, 1],
  speedMetersPerSecond: 0,
};
const configuration = resolveCameraConfiguration(
  parseCameraDocument({
    kind: "world-camera",
    schemaVersion: 1,
    defaultViewId: "orbit",
    binding: { targetEntityId: "actor" },
    activation: "immediate",
    views: {
      orbit: {
        kind: "third-person",
        overrides: {
          position: { anchor: { kind: "origin" }, distanceMeters: 8 },
          orientation: { initialPitchRadians: 0 },
          constraints: {
            visibility: "require-line-of-sight",
            recovery: {
              clearHoldSeconds: 0,
              halfLifeSeconds: 1,
              speedLimit: { kind: "unlimited" },
            },
          },
        },
      },
    },
  }),
  {
    subjectId: "actor",
    subjectGeneration: 1,
    subjectKind: "actor",
    availableAnchors: [],
    headingAvailable: false,
  },
);
const proposal = evaluateThirdPerson({
  subject,
  configuration: configuration as any,
  deltaSeconds: 0,
  intent: prepareCameraIntent({ subject, configuration, deltaSeconds: 0 }),
}).proposal;
it("uses real box intersection for retraction and stateless projection", () => {
  let wall = true;
  const constraints = new CameraConstraints(() => ({
    probe: (a, b, r) => {
      const start = new Vector3(...a),
        end = new Vector3(...b);
      const box = new Box3(
        new Vector3(-2, -2, 3),
        new Vector3(2, 2, 4),
      ).expandByScalar(r);
      if (!wall) return { distanceMeters: start.distanceTo(end) };
      if (box.containsPoint(start))
        return { distanceMeters: 0, startedOverlapping: true };
      const hit = new Ray(
        start,
        end.clone().sub(start).normalize(),
      ).intersectBox(box, new Vector3());
      return hit && start.distanceTo(hit) < start.distanceTo(end)
        ? { distanceMeters: start.distanceTo(hit), colliderEntityId: "wall" }
        : { distanceMeters: start.distanceTo(end) };
    },
  }));
  const first = constraints.solve(proposal, configuration, subject, {
    simulationTick: 0,
    aspect: 1.5,
    deltaSeconds: 0,
    cut: true,
  });
  expect(first.proposal.positionWorldMetersXYZ[2]).toBeLessThan(3);
  wall = false;
  const before = constraints.capture();
  constraints.project(proposal, configuration, subject, 1.5, first.proposal);
  expect(constraints.capture()).toEqual(before);
  const next = constraints.solve(proposal, configuration, subject, {
    simulationTick: 1,
    aspect: 1.5,
    deltaSeconds: 1,
    cut: false,
    previous: first.proposal,
  });
  expect(next.proposal.positionWorldMetersXYZ[2]).toBeCloseTo(
    (8 + first.proposal.positionWorldMetersXYZ[2]) / 2,
  );
});
it("marks disabled collision unmeasured and never invokes geometry", () => {
  const constraints = new CameraConstraints(() => {
    throw new Error("must not query");
  });
  const disabled = {
    ...configuration,
    values: {
      ...configuration.values,
      constraints: {
        ...configuration.values.constraints,
        collision: {
          ...configuration.values.constraints.collision,
          enabled: false,
        },
      },
    },
  } as typeof configuration;
  expect(
    constraints.solve(proposal, disabled, subject, {
      simulationTick: 0,
      aspect: 1,
      deltaSeconds: 0,
      cut: true,
    }).diagnostics.status,
  ).toBe("disabled");
});
it("clears cut sweeps while continuous movement intersects a real wall between legal endpoints", () => {
  const starts: readonly number[][] = [];
  const constraints = new CameraConstraints(() => ({
    probe: (a, b) => {
      const origin = new Vector3(...a),
        destination = new Vector3(...b);
      const box = new Box3(new Vector3(-0.2, -1, 3), new Vector3(0.2, 1, 5));
      if (box.containsPoint(origin))
        return { distanceMeters: 0, startedOverlapping: true };
      const hit = new Ray(
        origin,
        destination.clone().sub(origin).normalize(),
      ).intersectBox(box, new Vector3());
      return hit && origin.distanceTo(hit) < origin.distanceTo(destination)
        ? {
            distanceMeters: origin.distanceTo(hit),
            colliderEntityId: "middle-wall",
          }
        : { distanceMeters: origin.distanceTo(destination) };
    },
  }));
  const a = { ...proposal, positionWorldMetersXYZ: [-2, 0, 4] as const };
  const b = { ...proposal, positionWorldMetersXYZ: [2, 0, 4] as const };
  const continuous = constraints.solve(b, configuration, {...subject,kind:"humanoid"}, {
    simulationTick: 1,
    deltaSeconds: 0,
    aspect: 1,
    cut: false,
    previous: a,
  });
  expect(continuous.proposal.positionWorldMetersXYZ[0]).toBeLessThan(0);
  const cut = constraints.solve(b, configuration, {...subject,kind:"humanoid"}, {
    simulationTick: 1,
    deltaSeconds: 0,
    aspect: 1,
    cut: true,
    previous: a,
  });
  expect(cut.proposal.positionWorldMetersXYZ).toEqual(b.positionWorldMetersXYZ);
});
it("rejects genuinely unsolvable occupied space and rolls back solver state", () => {
  let occupied = false;
  const constraints = new CameraConstraints(() => ({
    probe: (a, b) =>
      occupied
        ? {
            distanceMeters: 0,
            startedOverlapping: true,
            colliderEntityId: "solid",
          }
        : { distanceMeters: new Vector3(...a).distanceTo(new Vector3(...b)) },
  }));
  constraints.solve(proposal, configuration, subject, {
    simulationTick: 0,
    aspect: 1,
    deltaSeconds: 0,
    cut: true,
  });
  const before = constraints.capture();
  occupied = true;
  expect(() =>
    constraints.solve(proposal, configuration, subject, {
      simulationTick: 1,
      aspect: 1,
      deltaSeconds: 1,
      cut: true,
    }),
  ).toThrow();
  expect(constraints.capture()).toEqual(before);
});


it('reports actual-subject occlusion independently of a clear lagged pivot and samples it without committing',()=>{
 let wall=true;
 const constraints=new CameraConstraints(()=>({probe:(a,b,r)=>{
  const start=new Vector3(...a),end=new Vector3(...b),length=start.distanceTo(end);
  const box=new Box3(new Vector3(1.8,.2,2),new Vector3(2.2,2.2,6)).expandByScalar(r);
  if(!wall)return {distanceMeters:length};
  if(box.containsPoint(start))return {distanceMeters:0,startedOverlapping:true,colliderEntityId:'side-wall'};
  const hit=new Ray(start,end.clone().sub(start).normalize()).intersectBox(box,new Vector3());
  return hit&&start.distanceTo(hit)<length?{distanceMeters:start.distanceTo(hit),colliderEntityId:'side-wall'}:{distanceMeters:length};
 }}));
 const config={...configuration,values:{...configuration.values,position:{...configuration.values.position,subjectTranslationHalfLifeSeconds:1,anchorOffset:{space:'world' as const,offsetMetersXYZ:[0,1,0] as const}}}} as Extract<typeof configuration,{kind:'third-person'}>;
 const intent=prepareCameraIntent({subject,configuration:config,deltaSeconds:0});
 const initial=evaluateThirdPerson({subject,configuration:config,intent,deltaSeconds:0});
 const moved={...subject,positionWorldMetersXYZ:[4,0,0] as const};
 const desired=evaluateThirdPerson({subject:moved,configuration:config,intent,deltaSeconds:1/60,history:initial.history}).proposal;
 expect(desired.pivotWorldMetersXYZ[0]).toBeCloseTo(.045943918588415456);
 expect(desired.visibilityTargetWorldMetersXYZ).toEqual([4,1,0]);
 const fixed=constraints.solve(desired,config,moved,{simulationTick:1,deltaSeconds:1/60,aspect:1,cut:true});
 expect(fixed.proposal.positionWorldMetersXYZ).toEqual(desired.positionWorldMetersXYZ);
 expect(fixed.diagnostics).toMatchObject({status:'measured',phase:'constrained',limited:true,visibility:{status:'occluded',colliderEntityId:'side-wall',targetWorldMetersXYZ:[4,1,0]}});
 const before=constraints.capture();
 for(let i=0;i<3;i++)expect(constraints.project(desired,config,moved,1,fixed.proposal).constraintDiagnostics).toMatchObject({status:'measured',limited:true,visibility:{status:'occluded',colliderEntityId:'side-wall'}});
 expect(constraints.capture()).toEqual(before);
 wall=false;
 expect(constraints.project(desired,config,moved,1,fixed.proposal).constraintDiagnostics).toMatchObject({status:'measured',phase:'clear',limited:false,visibility:{status:'clear'}});
 expect(constraints.capture()).toEqual(before);
 wall=true;
 const preserve=constraints.solve({...desired,visibility:'preserve-framing'},config,moved,{simulationTick:2,deltaSeconds:1/60,aspect:1,cut:true});
 expect(preserve.diagnostics).toMatchObject({status:'measured',phase:'clear',limited:false});expect(preserve.diagnostics).not.toHaveProperty('visibility');
});

// A safe eye can be stopped on the previous side of a wall while orbit input
// continues. Its pivot bearing must remain the one requested by the strategy.
it.each([false, true])("keeps pivot composition after a wall stops an orbit sweep (opening=%s)", (preserving) => {
  const config = preserving ? {...configuration, values: {...configuration.values, framing: {kind: 'preserve-opening'}}} : configuration;
  const opening = {viewId: 'orbit', distanceMeters: Math.sqrt(20), yawRadians: 0, pitchRadians: 0,
    framingQuaternionXYZW: new Quaternion().setFromAxisAngle(new Vector3(1,0,0), .2).toArray()};
  const make = (x: number) => evaluateThirdPerson({subject, configuration: config as any, deltaSeconds: 0,
    opening, intent: {yawRadians: Math.atan2(x,4), pitchRadians: 0, distanceMeters: Math.sqrt(20), secondsSinceOrbit: 0}}).proposal;
  const previous = make(-2), desired = make(2);
  const constraints = new CameraConstraints(() => ({probe: (a,b) => {
    const origin = new Vector3(...a), end = new Vector3(...b), length = origin.distanceTo(end);
    const box = new Box3(new Vector3(-.2,-2,3),new Vector3(.2,2,5));
    const hit = new Ray(origin,end.clone().sub(origin).normalize()).intersectBox(box,new Vector3());
    return hit && origin.distanceTo(hit)<length ? {distanceMeters:origin.distanceTo(hit),colliderEntityId:'wall'} : {distanceMeters:length};
  }}));
  const corrected = constraints.solve(desired, config as any, {...subject,kind:"humanoid"}, {simulationTick:1,deltaSeconds:1/60,aspect:1,cut:false,previous}).proposal;
  if(preserving)expect(corrected.positionWorldMetersXYZ).toEqual(desired.positionWorldMetersXYZ);
  else expect(corrected.positionWorldMetersXYZ[0]).toBeLessThan(0);
  const bearing = (pose: typeof desired) => new Vector3(...pose.pivotWorldMetersXYZ).sub(new Vector3(...pose.positionWorldMetersXYZ)).normalize().applyQuaternion(new Quaternion(...pose.quaternionWorldXYZW).invert());
  if(preserving)expect(new Quaternion(...corrected.quaternionWorldXYZW).angleTo(new Quaternion(...desired.quaternionWorldXYZW))).toBeLessThan(1e-7);
  else expect(bearing(corrected).distanceTo(bearing(desired))).toBeLessThan(1e-8);
  const before = constraints.capture();
  const projected = constraints.project(corrected, config as any, {...subject,kind:"humanoid"}, 1, corrected);
  if(preserving)expect(new Quaternion(...projected.quaternionWorldXYZW).angleTo(new Quaternion(...desired.quaternionWorldXYZW))).toBeLessThan(1e-7);
  else expect(bearing(projected).distanceTo(bearing(desired))).toBeLessThan(1e-8);
  expect(constraints.capture()).toEqual(before);
});

it.each([0.4, 1.5707963267948966, 2.2])("preserves opening roll and the orbit pole branch at pitch %s", (pitch) => {
  const reference = new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.35);
  const aim = reference.clone().multiply(orbitQuaternion(.6,pitch));
  const relative = new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.2);
  const eye = new Vector3(0,0,8).applyQuaternion(aim);
  const pose = {...proposal,positionWorldMetersXYZ:eye.toArray(),quaternionWorldXYZW:aim.clone().multiply(relative).toArray(),
    composition:{nominalAimQuaternionWorldXYZW:aim.toArray(),relativeAimQuaternionXYZW:relative.toArray(),referenceQuaternionWorldXYZW:reference.toArray()}};
  const same = composeCameraAtPosition(pose,eye.clone().multiplyScalar(.3).toArray());
  expect(new Quaternion(...same.quaternionWorldXYZW).angleTo(new Quaternion(...pose.quaternionWorldXYZW))).toBeLessThan(1e-7);
  const corrected = composeCameraAtPosition(pose,eye.clone().add(new Vector3(.3,.2,.1)).toArray());
  const local = new Vector3(...corrected.pivotWorldMetersXYZ).sub(new Vector3(...corrected.positionWorldMetersXYZ)).normalize().applyQuaternion(new Quaternion(...corrected.quaternionWorldXYZW).invert());
  expect(local.distanceTo(new Vector3(0,0,-1).applyQuaternion(relative.clone().invert()))).toBeLessThan(1e-8);
  const translated = relocateCameraProposal(pose,subject,{...subject,semanticQuaternionWorldXYZW:reference.toArray()},'subject-up');
  const relocated = composeCameraAtPosition(translated,new Vector3(...translated.positionWorldMetersXYZ).multiplyScalar(.5).toArray());
  expect(new Quaternion(...relocated.quaternionWorldXYZW).angleTo(new Quaternion(...translated.quaternionWorldXYZW))).toBeLessThan(1e-7);
});
it("does not introduce horizon roll when collision moves an upright eye sideways", () => {
  const aim = orbitQuaternion(0,Math.atan2(3,8));
  const pose = {...proposal, positionWorldMetersXYZ:[0,3,8] as const, quaternionWorldXYZW:aim.toArray(),
    composition:{nominalAimQuaternionWorldXYZW:aim.toArray(),relativeAimQuaternionXYZW:[0,0,0,1] as const,referenceQuaternionWorldXYZW:[0,0,0,1] as const}};
  const corrected = composeCameraAtPosition(pose,[3,3,8]);
  expect(Math.abs(new Vector3(1,0,0).applyQuaternion(new Quaternion(...corrected.quaternionWorldXYZW)).y)).toBeLessThan(1e-8);
});
it("translates first-person sight without re-aiming, and keeps a zero-arm pose finite", () => {
  const {composition: _composition,...sight} = proposal;
  const corrected = composeCameraAtPosition(sight,[3,2,1]);
  expect(corrected.quaternionWorldXYZW).toEqual(sight.quaternionWorldXYZW);
  expect(new Vector3(...corrected.lookAtWorldMetersXYZ).sub(new Vector3(...corrected.positionWorldMetersXYZ)).toArray()).toEqual(new Vector3(...sight.lookAtWorldMetersXYZ).sub(new Vector3(...sight.positionWorldMetersXYZ)).toArray());
  const zero = {...sight,positionWorldMetersXYZ:sight.pivotWorldMetersXYZ};
  expect(captureCameraComposition(zero,[0,0,0,1])).not.toHaveProperty('composition');
  expect(composeCameraAtPosition(zero,[1,1,1]).quaternionWorldXYZW).toEqual(zero.quaternionWorldXYZW);
});

it("keeps pole correction continuous across numerical contact separations", () => {
  const pose = {...proposal,positionWorldMetersXYZ:[0,8,0] as const,quaternionWorldXYZW:orbitQuaternion(0,Math.PI/2).toArray(),
    composition:{nominalAimQuaternionWorldXYZW:orbitQuaternion(0,Math.PI/2).toArray(),relativeAimQuaternionXYZW:[0,0,0,1] as const,referenceQuaternionWorldXYZW:[0,0,0,1] as const}};
  const a=composeCameraAtPosition(pose,[.0000079,8,0]), b=composeCameraAtPosition(pose,[.0000081,8,0]);
  expect(new Quaternion(...a.quaternionWorldXYZW).angleTo(new Quaternion(...b.quaternionWorldXYZW))).toBeLessThan(1e-4);
});

it("projects without advancing recovery and rolls back failed fixed queries", () => {
  let fail = false;
  const constraints = new CameraConstraints(()=>({probe:(a,b)=>{
    if(fail) return {distanceMeters:0,startedOverlapping:true,colliderEntityId:'solid'};
    return {distanceMeters:new Vector3(...a).distanceTo(new Vector3(...b))};
  }}));
  const fixed=constraints.solve(proposal,configuration,subject,{simulationTick:1,deltaSeconds:1/60,aspect:1,cut:true}).proposal;
  const before=constraints.capture();
  const step={simulationTick:2,deltaSeconds:1/60,aspect:1,cut:false,previous:fixed};
  for(let i=0;i<3;i++) {
    expect(constraints.project(proposal,configuration,subject,1,fixed,2).positionWorldMetersXYZ).toEqual(proposal.positionWorldMetersXYZ);
    expect(constraints.capture()).toEqual(before);
  }
  fail=true;
  expect(()=>constraints.project(proposal,configuration,subject,1,fixed,2)).toThrow();
  expect(constraints.capture()).toEqual(before);
  expect(()=>constraints.solve(proposal,configuration,subject,step)).toThrow();
  expect(constraints.capture()).toEqual(before);
});

it("is idempotent at a pole and continuous across opposite horizon directions", () => {
  const pose = {...proposal,positionWorldMetersXYZ:[0,8,0] as const,quaternionWorldXYZW:orbitQuaternion(0,Math.PI/2).toArray(),
    composition:{nominalAimQuaternionWorldXYZW:orbitQuaternion(0,Math.PI/2).toArray(),relativeAimQuaternionXYZW:[0,0,0,1] as const,referenceQuaternionWorldXYZW:[0,0,0,1] as const}};
  const first=composeCameraAtPosition(pose,[.004,8,0]);
  const repeat=composeCameraAtPosition(first,first.positionWorldMetersXYZ);
  expect(new Quaternion(...first.quaternionWorldXYZW).angleTo(new Quaternion(...repeat.quaternionWorldXYZW))).toBeLessThan(1e-7);
  const a=composeCameraAtPosition(pose,[-1e-9,8,-.004]), b=composeCameraAtPosition(pose,[1e-9,8,-.004]);
  expect(new Quaternion(...a.quaternionWorldXYZW).angleTo(new Quaternion(...b.quaternionWorldXYZW))).toBeLessThan(1e-6);
  const opposite=composeCameraAtPosition(pose,[0,-8,0]);
  expect(opposite.quaternionWorldXYZW.every(Number.isFinite)).toBe(true);
  expect(new Quaternion(...opposite.quaternionWorldXYZW).length()).toBeCloseTo(1,12);
});

it('keeps a preserve-framing eye on the visible side of a solid wall even when the desired eye is empty',()=>{
 const constraints=new CameraConstraints(()=>({probe:(a,b,r)=>{
  const start=new Vector3(...a),end=new Vector3(...b),length=start.distanceTo(end);
  const box=new Box3(new Vector3(-10,-10,2),new Vector3(10,10,3)).expandByScalar(r);
  const hit=new Ray(start,end.clone().sub(start).normalize()).intersectBox(box,new Vector3());
  return hit&&start.distanceTo(hit)<length?{distanceMeters:start.distanceTo(hit),colliderEntityId:'wall'}:{distanceMeters:length};
 }}));
 const desired={...proposal,visibility:'preserve-framing' as const};
 const result=constraints.solve(desired,configuration,subject,{simulationTick:1,deltaSeconds:0,aspect:1,cut:true}).proposal;
 expect(result.positionWorldMetersXYZ[2]).toBeLessThan(2);
 expect(constraints.project(desired,configuration,subject,1,result).positionWorldMetersXYZ[2]).toBeLessThan(2);
});

it('records bounded existing queries with separate fixed and presentation identities',()=>{
  const calls:{from:readonly [number,number,number];to:readonly [number,number,number];radius:number;hit:{distanceMeters:number}}[]=[];
  const constraints=new CameraConstraints(()=>({probe:(from,to,radius)=>{const hit={distanceMeters:new Vector3(...from).distanceTo(new Vector3(...to))};calls.push(structuredClone({from,to,radius,hit}));return hit;}}));
  const step={simulationTick:7,aspect:1,deltaSeconds:1/60,cut:true};
  constraints.solve(proposal,configuration,subject,step);const baseline=structuredClone(calls);calls.length=0;
  expect(constraints.inspectQueries()).toBeUndefined();constraints.setDiagnosticsEnabled(true);
  constraints.solve(proposal,configuration,subject,step);expect(calls).toEqual(baseline);
  const fixed=constraints.inspectQueries()!.fixed!;expect(fixed).toMatchObject({source:'fixed',simulationTick:7,droppedProbes:0});expect(fixed.probes).toEqual(calls);
  const state=constraints.capture();
  constraints.project(proposal,configuration,subject,1,proposal,7);expect(constraints.capture()).toEqual(state);
  expect(constraints.inspectQueries()!.presentation).toMatchObject({source:'presentation',simulationTick:7});expect(constraints.inspectQueries()!.fixed).toEqual(fixed);
  const count=calls.length,inspection=constraints.inspectQueries()!;
  (inspection.fixed!.probes as unknown[]).length=0;
  expect(constraints.inspectQueries()!.fixed!.probes.length).toBeGreaterThan(0);expect(calls.length).toBe(count);
  constraints.solve(proposal,configuration,subject,{...step,simulationTick:8});expect(constraints.inspectQueries()!.presentation).toBeUndefined();
  constraints.setDiagnosticsEnabled(false);expect(constraints.inspectQueries()).toBeUndefined();
});

it('retains only the latest bounded sample when obstructed searches fail',()=>{
  let count=0;
  const constraints=new CameraConstraints(()=>({probe:()=>{count++;return {distanceMeters:0,startedOverlapping:true,normalWorldXYZ:[0,1,0],penetrationDepthMeters:1};}}));
  constraints.setDiagnosticsEnabled(true);
  expect(()=>constraints.solve(proposal,configuration,subject,{simulationTick:9,aspect:1,deltaSeconds:1/60,cut:true})).toThrow();
  const sample=constraints.inspectQueries()!.fixed!;
  expect(count).toBeGreaterThan(0);
  expect(sample.probes.length).toBeLessThanOrEqual(256);
  expect(sample.probes.length+sample.droppedProbes).toBe(count);
  for(let tick=10;tick<110;tick++)expect(()=>constraints.solve(proposal,configuration,subject,{simulationTick:tick,aspect:1,deltaSeconds:1/60,cut:true})).toThrow();
  expect(Object.keys(constraints.inspectQueries()!)).toEqual(['fixed']);
  expect(constraints.inspectQueries()!.fixed!.simulationTick).toBe(109);
  expect(sample.simulationTick).toBe(9);
});
