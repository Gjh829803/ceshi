import { expect, it, vi } from "vitest";
import { Box3, Euler, Ray, Quaternion, Vector3 } from "three";
import {
  parseCameraDocument,
  serializeCameraDocument,
} from "../config/camera/index";
import { CameraController } from "./controller";
import type { CameraSubjectFacts } from "./subject";
import { cameraControlForward } from "./control-basis";

const initial: CameraSubjectFacts = {
  id: "actor",
  generation: 1,
  kind: "actor",
  positionWorldMetersXYZ: [0, 0, 0],
  geometryQuaternionWorldXYZW: [0, 0, 0, 1],
  geometryScaleXYZ: [1, 1, 1],
  semanticQuaternionWorldXYZW: [0, 0, 0, 1],
  speedMetersPerSecond: 0,
  eyeWorldMetersXYZ: [0, 1.6, 0],
  body: { minimumHeightMeters: 0, maximumHeightMeters: 1.8 },
};
const document = (extra: Record<string, unknown> = {}) =>
  parseCameraDocument({
    kind: "world-camera",
    schemaVersion: 1,
    defaultViewId: "orbit",
    binding: { targetEntityId: "actor" },
    views: {
      orbit: {
        kind: "third-person",
        overrides: {
          position: {
            distanceMeters: 4,
            anchor: { kind: "origin" },
            armHalfLifeSeconds: 0,
          },
          orientation: { initialPitchRadians: 0, recenter: { enabled: false } },
        },
      },
      other: {
        kind: "third-person",
        overrides: {
          position: {
            distanceMeters: 6,
            anchor: { kind: "origin" },
            armHalfLifeSeconds: 0,
          },
          orientation: {
            initialPitchRadians: 0.4,
            recenter: { enabled: false },
          },
        },
      },
      eye: { kind: "first-person" },
    },
    ...extra,
  });
function fixture() {
  let subject = structuredClone(initial);
  let fail = false;
  const controller = new CameraController({
    sampleSubject: () => subject,
    geometry: () => ({
      probe: (a, b) => {
        if (fail) throw new Error("query failed");
        return {
          distanceMeters: new Vector3(...a).distanceTo(new Vector3(...b)),
        };
      },
    }),
  });
  return {
    controller,
    setSubject: (value: CameraSubjectFacts) => {
      subject = value;
    },
    fail: () => {
      fail = true;
    },
  };
}
const frame = (simulationTick = 0, lifecycleGeneration = 1) => ({
  simulationTick,
  lifecycleGeneration,
  aspect: 1.5,
});
const step = (c: CameraController, tick: number, input = {}) => {
  c.prepareInput(input, 1 / 60, frame(tick));
  return c.evaluateAndCommit(frame(tick));
};

it('bounds pitch ratio input without snapping or limiting explicit pointer look',()=>{
  const {controller:c}=fixture();c.install(document({activation:'immediate'}),frame());
  const limit=10*Math.PI/180;let tick=0;
  for(let n=0;n<180;n++)step(c,++tick,{orbitRatioXY:[0,-.2],orbitPitchMaxOffsetRadians:limit});
  expect(c.inspect().intent!.pitchRadians).toBeCloseTo(-limit);
  for(let n=0;n<360;n++)step(c,++tick,{orbitRatioXY:[0,.2],orbitPitchMaxOffsetRadians:limit});
  expect(c.inspect().intent!.pitchRadians).toBeCloseTo(limit);
  step(c,++tick,{orbitDeltaRadiansXY:[0,.3],orbitPitchMaxOffsetRadians:limit});
  expect(c.inspect().intent!.pitchRadians).toBeCloseTo(limit+.3);
  step(c,++tick,{orbitRatioXY:[0,.2],orbitPitchMaxOffsetRadians:limit});
  expect(c.inspect().intent!.pitchRadians).toBeCloseTo(limit+.3);
  step(c,++tick,{orbitRatioXY:[0,-.2],orbitPitchMaxOffsetRadians:limit});
  expect(c.inspect().intent!.pitchRadians).toBeLessThan(limit+.3);
  expect(c.inspect().intent!.pitchRadians).toBeGreaterThan(limit+.28);
});

function anchoredOpening(anchor: 'origin' | 'body' = 'origin', activation = 'immediate', worldOffset = [0, 0, 0]) {
  return document({ activation, views: { orbit: { kind: 'third-person', opening: {
    positionWorldMetersXYZ: [2, 3, 8], lookAtWorldMetersXYZ: [0, 1, 0], fovDegrees: 50,
  }, overrides: { framing: { kind: 'preserve-opening' }, position: {
    anchor: anchor === 'body' ? { kind: 'body', heightRatio: .75 } : { kind: 'origin' },
    anchorOffset: { space: 'world', offsetMetersXYZ: worldOffset },
    subjectTranslationHalfLifeSeconds: 0, anchorHalfLifeSeconds: 0, armHalfLifeSeconds: 0,
  }, orientation: { recenter: { enabled: false } }, zoom: { range: { kind: 'unbounded' }, halfLifeSeconds: 0 },
  constraints: { collision: { enabled: false } } } } } });
}
it.each(['immediate','on-input'])('rebases %s hot opening anchor edits and undo around the unconstrained current pose', activation => {
  const {controller:c} = fixture();
  c.install(anchoredOpening('origin',activation), frame());
  step(c, 1, activation === 'immediate' ? {orbitDeltaRadiansXY:[.4,.1]} : {});
  const before = c.inspect().desired!;
  c.install(anchoredOpening('body',activation), frame(1));
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(new Vector3(...before.positionWorldMetersXYZ))).toBeLessThan(1e-9);
  expect(new Quaternion(...c.inspect().desired!.quaternionWorldXYZW).angleTo(new Quaternion(...before.quaternionWorldXYZW))).toBeLessThan(1e-7);
  step(c, 2, {orbitDeltaRadiansXY:[.2,-.05],zoomDeltaMeters:.3});
  const later = c.inspect().desired!;
  c.restoreConfiguration(anchoredOpening('origin',activation), frame(2));
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(new Vector3(...later.positionWorldMetersXYZ))).toBeLessThan(1e-9);
  expect(new Quaternion(...c.inspect().desired!.quaternionWorldXYZW).angleTo(new Quaternion(...later.quaternionWorldXYZW))).toBeLessThan(1e-7);
});
it('keeps the runtime opening reference on a same-document reinstall while mounted to another anchor preset', () => {
  const {controller:c,setSubject} = fixture();
  const doc=anchoredOpening('origin','on-input');
  const withMount=parseCameraDocument({...doc,binding:{...doc.binding,subjectOverrides:{mount:{views:{orbit:{overrides:{position:{anchor:{kind:'body',heightRatio:.75}}}}}}}}});
  c.install(withMount,frame());
  const mount:CameraSubjectFacts={...initial,id:'mount',generation:2,positionWorldMetersXYZ:[3,0,0],body:{minimumHeightMeters:0,maximumHeightMeters:3}};
  setSubject(mount);c.applyLifecycle({kind:'retarget',operationId:'mount',previousSubject:initial,subject:mount},frame(1));
  step(c,2,{orbitDeltaRadiansXY:[.4,0]});
  const before=c.inspect().desired!;
  c.install(withMount,frame(2));
  expect(c.inspect().desired).toEqual(before);
});
it('relocates a pending opening about resolved anchors without rotating its world offset', () => {
  const {controller:c,setSubject} = fixture();
  c.install(anchoredOpening('body','on-input',[2,0,0]),frame());
  const before=c.inspect().desired!,rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2);
  const next:CameraSubjectFacts={...initial,positionWorldMetersXYZ:[5,0,0],semanticQuaternionWorldXYZW:rotation.toArray()};
  setSubject(next);c.applyLifecycle({kind:'relocate',operationId:'turn',previousSubject:initial,subject:next},frame());
  const expected=new Vector3(...before.positionWorldMetersXYZ).sub(new Vector3(2,1.35,0)).applyQuaternion(rotation).add(new Vector3(7,1.35,0));
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(expected)).toBeLessThan(1e-9);
  step(c,1,{movement:true});
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(expected)).toBeLessThan(1e-9);
});
it('invalidates a dormant opening cache when its mounted subject anchor override changes', () => {
  const {controller:c,setSubject}=fixture();
  const base=anchoredOpening();
  const config=(heightRatio:number)=>parseCameraDocument({...base,views:{...base.views,eye:{kind:'first-person'}},binding:{...base.binding,
    subjectOverrides:{mount:{views:{orbit:{overrides:{position:{anchor:{kind:'body',heightRatio}}}}}}}}});
  c.install(config(.25),frame());
  const mount:CameraSubjectFacts={...initial,id:'mount',generation:2,body:{minimumHeightMeters:0,maximumHeightMeters:3}};
  setSubject(mount);c.applyLifecycle({kind:'retarget',operationId:'mount',previousSubject:initial,subject:mount},frame());
  step(c,1,{orbitDeltaRadiansXY:[.5,0]});const previousYaw=c.inspect().intent!.yawRadians;
  c.setView('eye',frame(1));c.install(config(.75),frame(1));c.setView('orbit',frame(1));
  expect(c.inspect().intent!.yawRadians).not.toBeCloseTo(previousYaw);
  expect(c.inspect().intent!.yawRadians).toBeCloseTo(Math.atan2(2,8));
});
it('keeps edited opening JSON canonical for reset while anchor-only edits keep the live pose', () => {
  const {controller:c}=fixture();c.install(anchoredOpening(),frame());
  step(c,1,{orbitDeltaRadiansXY:[.4,0]});c.install(anchoredOpening('body'),frame(1));
  const baseline=c.commitBaseline();c.reset(frame(0,2),baseline);
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(new Vector3(2,3,8))).toBeLessThan(1e-9);
  const doc=anchoredOpening('body');const orbit=doc.views.orbit;
  if(orbit?.kind!=='third-person')throw new Error('Expected opening');
  c.install({...doc,views:{orbit:{...orbit,opening:{positionWorldMetersXYZ:[3,4,9],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:55}}}},frame(0,2));
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(new Vector3(3,4,9))).toBeLessThan(1e-9);
  expect(c.inspect().desired!.lens.verticalFovDegrees).toBe(55);
});
it.each(['immediate','on-input'])('reanchors %s nominal eye without adopting collision shortening or adding speed distance twice', activation => {
  const subject={...initial,speedMetersPerSecond:5};
  const c=new CameraController({sampleSubject:()=>subject,geometry:()=>({probe:(a,b)=>{
    const distance=new Vector3(...a).distanceTo(new Vector3(...b));
    return distance>2?{distanceMeters:2,colliderEntityId:'wall'}:{distanceMeters:distance};
  }})});
  const config=(anchor:'origin'|'body')=>{
    const d=anchoredOpening(anchor,activation),view=d.views.orbit;
    if(view?.kind!=='third-person')throw new Error('Expected opening');
    return {...d,views:{orbit:{...view,overrides:{...view.overrides,
      constraints:{visibility:'require-line-of-sight' as const,collision:{enabled:true}},
      effects:{speedDistance:{enabled:true,fullEffectSpeedMetersPerSecond:5,maximumOffsetMeters:1}},
    }}}};
  };
  c.install(config('origin'),frame());step(c,1,activation==='immediate'?{orbitDeltaRadiansXY:[.3,0]}:{});
  const before=c.inspect().desired!;
  expect(new Vector3(...before.positionWorldMetersXYZ).distanceTo(new Vector3(...c.inspect().current!.positionWorldMetersXYZ))).toBeGreaterThan(2);
  c.install(config('body'),frame(1));
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(new Vector3(...before.positionWorldMetersXYZ))).toBeLessThan(1e-9);
  step(c,2,{movement:true});
  expect(new Vector3(...c.inspect().desired!.positionWorldMetersXYZ).distanceTo(new Vector3(...before.positionWorldMetersXYZ))).toBeLessThan(1e-9);
});

it("activates pending only on meaningful input and keeps candidates out of inspection", () => {
  const { controller: c } = fixture();
  c.install(document(), frame());
  const before = c.inspect();
  expect(before.mode).toBe("follow-pending");
  c.prepareInput({ orbitDeltaRadiansXY: [0.3, 0] }, 1 / 60, frame(1));
  expect(c.inspect()).toEqual(before);
  c.evaluateAndCommit(frame(1));
  expect(c.inspect().mode).toBe("follow");
  expect(c.inspect().intent?.yawRadians).toBeCloseTo(0.3);
});
it("keeps equivalent configuration revision stable while runtime commits advance", () => {
  const { controller: c } = fixture();
  c.install(document(), frame());
  const before = c.inspect();
  c.install(document(), frame());
  expect(c.inspect().configurationRevision).toBe(before.configurationRevision);
  expect(c.inspect().cameraCommitRevision).toBe(
    before.cameraCommitRevision + 1,
  );
});
it("preserves input on unrelated hot update and rejects deletion or excluded distance atomically", () => {
  const { controller: c } = fixture();
  c.install(document({ activation: "immediate" }), frame());
  step(c, 1, { orbitDeltaRadiansXY: [0.7, 0], zoomDeltaMeters: 1 });
  c.install(document({ input: { cycleViewIds: ["eye"] } }), frame(1));
  expect(c.inspect().intent?.yawRadians).toBeCloseTo(0.7);
  expect(c.inspect().intent?.distanceMeters).toBe(5);
  const before = c.inspect();
  const bad = structuredClone(document()) as any;
  bad.views.orbit.overrides.zoom = {
    range: {
      kind: "bounded",
      minimumDistanceMeters: 0,
      maximumDistanceMeters: 4,
    },
  };
  expect(() => c.install(bad, frame(1))).toThrow();
  expect(c.inspect()).toEqual(before);
  delete bad.views.orbit;
  expect(() => c.install(bad, frame(1))).toThrow();
  expect(c.inspect()).toEqual(before);
});
it("rolls back failed candidate including input and collision state, then requires reset", () => {
  const f = fixture();
  f.controller.install(document({ activation: "immediate" }), frame());
  const before = f.controller.captureCheckpoint();
  f.controller.prepareInput({ orbitDeltaRadiansXY: [1, 0] }, 0.1, frame(1));
  f.fail();
  expect(() => f.controller.evaluateAndCommit(frame(1))).toThrow();
  expect(f.controller.inspect().intent).toEqual(before.inspection.intent);
  expect(f.controller.inspect().cameraCommitRevision).toBe(
    before.inspection.cameraCommitRevision,
  );
  expect(f.controller.inspect().failure?.controlBasis).toBeDefined();
  expect(() => f.controller.prepareInput({}, 0.1, frame(2))).toThrow();
});
it("interrupts blend from latest fixed result; first-person cuts and same-view does not restart", () => {
  const { controller: c } = fixture();
  c.install(
    document({ activation: "immediate", transition: { durationSeconds: 1 } }),
    frame(),
  );
  c.setView("other", frame());
  expect(c.inspect().transition.kind).toBe("blend");
  c.prepareInput({}, 0.5, frame(1));
  c.evaluateAndCommit(frame(1));
  const pose = c.inspect().current!;
  c.setView("orbit", frame(1));
  expect(c.inspect().current?.positionWorldMetersXYZ).toEqual(
    pose.positionWorldMetersXYZ,
  );
  const transition = c.inspect().transition;
  c.setView("orbit", frame(1));
  expect(c.inspect().transition).toEqual(transition);
  c.setView("eye", frame(1));
  expect(c.inspect().transition.kind).toBe("none");
  expect(c.inspect().transition).toMatchObject({ reason: "first-person-cut" });
  expect(c.inspect().current?.positionWorldMetersXYZ).toEqual([0, 1.6, 0]);
});
it("initializes dormant preserve-opening at install and restores its calibrated opening", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.saved = {
    kind: "third-person",
    opening: {
      positionWorldMetersXYZ: [0, 2, 8],
      lookAtWorldMetersXYZ: [0, 0, 0],
      fovDegrees: 50,
    },
    overrides: { framing: { kind: "preserve-opening" } },
  };
  f.controller.install(d, frame());
  f.setSubject({ ...initial, positionWorldMetersXYZ: [10, 0, 0] });
  step(f.controller, 1);
  f.controller.setView("saved", frame(1), { cut: true });
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[0]).toBeCloseTo(
    10,
  );
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[1]).toBeCloseTo(
    2,
  );
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[2]).toBeCloseTo(
    8,
  );
  step(f.controller, 2, { orbitDeltaRadiansXY: [0.5, 0] });
  const intent = f.controller.inspect().intent;
  f.controller.setView("eye", frame(2));
  f.controller.setView("saved", frame(2), { cut: true });
  expect(f.controller.inspect().intent).toMatchObject({...intent,yawRadians:0,secondsSinceOrbit:0});
});
it("treats target generations explicitly and removal releases follow", () => {
  const f = fixture();
  f.controller.install(document(), frame());
  f.setSubject({ ...initial, generation: 2 });
  expect(() => step(f.controller, 1)).toThrow();
  f.controller.targetRemoved({ id: "actor", generation: 1 }, frame());
  expect(f.controller.inspect().mode).toBe("authored");
  expect(f.controller.inspect().resolved).toBeUndefined();
});
it("recenter advances once before physics and committed intent matches control basis", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.orbit.overrides.orientation.recenter = {
    enabled: true,
    delaySeconds: 0,
    minimumSpeedMetersPerSecond: 0,
    yawHalfLifeSeconds: 1,
  };
  f.controller.install(d, frame());
  const input = f.controller.prepareInput(
    { orbitDeltaRadiansXY: [1, 0] },
    1,
    frame(1),
  );
  f.controller.evaluateAndCommit(frame(1));
  expect(f.controller.inspect().intent?.yawRadians).toBeCloseTo(0.5);
  const direction = new Vector3(0, 0, -1).applyQuaternion(
    new Quaternion(...input.quaternionWorldXYZW),
  );
  expect(direction.x).toBeCloseTo(-Math.sin(0.5));
});
it("projects display without committing state or revisions", () => {
  const { controller: c } = fixture();
  c.install(document({ activation: "immediate" }), frame());
  step(c, 1, { orbitDeltaRadiansXY: [0.2, 0] });
  const checkpoint = c.captureCheckpoint();
  for (let i = 0; i < 4; i++)
    c.sampleProjection(
      { epoch: 1, previousTick: 0, currentTick: 1, alpha: 0.5, cut: false },
      1.5,
    );
  expect(c.captureCheckpoint()).toEqual(checkpoint);
});

it("same view selection activates pending immediately", () => {
  const { controller: c } = fixture();
  c.install(document(), frame());
  c.setView("orbit", frame());
  expect(c.inspect().mode).toBe("follow");
});
it("relocation rotates active and dormant views exactly once and reset uses sealed references", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.saved = {
    kind: "third-person",
    opening: {
      positionWorldMetersXYZ: [0, 0, 8],
      lookAtWorldMetersXYZ: [0, 0, 0],
      fovDegrees: 50,
    },
    overrides: { framing: { kind: "preserve-opening" } },
  };
  f.controller.install(d, frame());
  const baseline = f.controller.commitBaseline();
  const rotated = {
    ...initial,
    positionWorldMetersXYZ: [10, 0, 0] as const,
    semanticQuaternionWorldXYZW: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
      .toArray(),
  };
  f.setSubject(rotated);
  const event = {
    operationId: "spawn",
    kind: "relocate" as const,
    previousSubject: initial,
    subject: rotated,
  };
  f.controller.applyLifecycle(event, frame(1));
  expect(f.controller.inspect().intent?.yawRadians).toBeCloseTo(Math.PI / 2);
  const revision = f.controller.inspect().cameraCommitRevision;
  f.controller.applyLifecycle(event, frame(1));
  expect(f.controller.inspect().cameraCommitRevision).toBe(revision);
  f.controller.setView("saved", frame(1), { cut: true });
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[0]).toBeCloseTo(
    18,
  );
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[2]).toBeCloseTo(
    0,
  );
  f.setSubject({ ...initial, generation: 2 });
  f.controller.reset(frame(0, 2), baseline);
  f.controller.setView("saved", frame(0, 2), { cut: true });
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[0]).toBeCloseTo(
    0,
  );
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[2]).toBeCloseTo(
    8,
  );
});
it("changed inactive opening rebuilds only that view and does not replace baseline", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.saved = {
    kind: "third-person",
    opening: {
      positionWorldMetersXYZ: [0, 0, 8],
      lookAtWorldMetersXYZ: [0, 0, 0],
      fovDegrees: 50,
    },
    overrides: { framing: { kind: "preserve-opening" } },
  };
  f.controller.install(d, frame());
  f.controller.commitBaseline();
  step(f.controller, 1, { orbitDeltaRadiansXY: [0.7, 0] });
  const before = f.controller.inspect().current;
  d.views.saved.opening.positionWorldMetersXYZ = [0, 0, 10];
  f.controller.install(d, frame(1));
  expect(f.controller.inspect().intent?.yawRadians).toBeCloseTo(0.7);
  expect(f.controller.inspect().current?.positionWorldMetersXYZ).toEqual(
    before?.positionWorldMetersXYZ,
  );
  f.controller.setView("saved", frame(1), { cut: true });
  expect(f.controller.inspect().intent?.distanceMeters).toBe(10);
  f.controller.reset(frame(0, 2));
  f.controller.setView("saved", frame(0, 2), { cut: true });
  expect(f.controller.inspect().intent?.distanceMeters).toBe(8);
});
it("explicit distance update and removal synchronize intent while smoothing coefficient retains history", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.orbit.overrides.position.armHalfLifeSeconds = 1;
  f.controller.install(d, frame());
  step(f.controller, 1, { orbitDeltaRadiansXY: [1, 0] });
  const before = f.controller.inspect().current;
  d.views.orbit.overrides.position.armHalfLifeSeconds = 2;
  f.controller.install(d, frame(1));
  expect(f.controller.inspect().current?.positionWorldMetersXYZ).toEqual(
    before?.positionWorldMetersXYZ,
  );
  d.views.orbit.overrides.position.distanceMeters = 5;
  f.controller.install(d, frame(1));
  expect(f.controller.inspect().intent?.distanceMeters).toBe(5);
  delete d.views.orbit.overrides.position.distanceMeters;
  f.controller.install(d, frame(1));
  expect(f.controller.inspect().intent?.distanceMeters).toBe(8.8);
});
it("ordinary heading changes do not add a special first-activation yaw to dormant world-up openings", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.saved = {
    kind: "third-person",
    opening: {
      positionWorldMetersXYZ: [0, 0, 8],
      lookAtWorldMetersXYZ: [0, 0, 0],
      fovDegrees: 50,
    },
    overrides: { framing: { kind: "preserve-opening" } },
  };
  f.controller.install(d, frame());
  f.setSubject({
    ...initial,
    semanticQuaternionWorldXYZW: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
      .toArray(),
  });
  step(f.controller, 1);
  f.controller.setView("saved", frame(1), { cut: true });
  expect(f.controller.inspect().intent?.yawRadians).toBeCloseTo(0);
  expect(f.controller.inspect().current?.positionWorldMetersXYZ[2]).toBeCloseTo(
    8,
  );
});
it("never installs a candidate recursively while geometry is evaluating", () => {
  let c: CameraController;
  let reenter = false;
  c = new CameraController({
    sampleSubject: () => initial,
    geometry: () => ({
      probe: (a, b) => {
        if (reenter) c.install(document(), frame());
        return {
          distanceMeters: new Vector3(...a).distanceTo(new Vector3(...b)),
        };
      },
    }),
  });
  c.install(document(), frame());
  const before = c.inspect();
  reenter = true;
  expect(() =>
    c.install(document({ activation: "immediate" }), frame()),
  ).toThrow();
  expect(c.inspect()).toEqual(before);
});
it("restores owned checkpoints exactly and invalidates them after reset", () => {
  const { controller: c } = fixture();
  c.install(document({ activation: "immediate" }), frame());
  c.commitBaseline();
  const checkpoint = c.captureCheckpoint();
  step(c, 1, { orbitDeltaRadiansXY: [0.5, 0] });
  c.restoreCheckpoint(checkpoint, c.inspect().cameraCommitRevision);
  expect(c.inspect().intent).toEqual(checkpoint.inspection.intent);
  expect(c.inspect().current?.positionWorldMetersXYZ).toEqual(
    checkpoint.inspection.current?.positionWorldMetersXYZ,
  );
  expect(c.inspect().cameraCommitRevision).toBe(3);
  expect(() => c.restoreCheckpoint(checkpoint, 2)).toThrow();
  c.reset(frame(0, 2));
  expect(() =>
    c.restoreCheckpoint(checkpoint, c.inspect().cameraCommitRevision),
  ).toThrow();
});
it("a dormant first-person view without a new eye does not block handoff, but activation rejects", () => {
  const f = fixture();
  f.controller.install(document({ activation: "immediate" }), frame());
  f.controller.setView("eye", frame());
  f.controller.setView("orbit", frame());
  const { eyeWorldMetersXYZ: eye, ...withoutEye } = initial;
  const next = { ...withoutEye, id: "vehicle", generation: 2, kind: "vehicle" };
  f.setSubject(next);
  f.controller.applyLifecycle(
    {
      kind: "retarget",
      operationId: "mount",
      previousSubject: initial,
      subject: next,
    },
    frame(1),
  );
  expect(f.controller.inspect().resolved?.subjectId).toBe("vehicle");
  const before = f.controller.inspect();
  expect(() => f.controller.setView("eye", frame(1))).toThrow();
  expect(f.controller.inspect()).toEqual(before);
});
it("adopts an explicit initial author pose once and rejects later adoption", () => {
  const f = fixture();
  f.controller.install(document({ activation: "immediate" }), frame());
  const authored = f.controller.inspect().current!;
  const { controller: c } = fixture();
  c.install(document(), frame(), {
    authoredPose: { ...authored, positionWorldMetersXYZ: [2, 3, 9] },
  });
  expect(c.inspect().current?.positionWorldMetersXYZ).toEqual([2, 3, 9]);
  expect(() =>
    c.install(document(), frame(), { authoredPose: authored }),
  ).toThrow();
});
it("pending relocation rebases desired opening rather than the previously retracted eye", () => {
  let subject = initial,
    wall = true;
  const c = new CameraController({
    sampleSubject: () => subject,
    geometry: () => ({
      probe: (a, b) =>
        wall && new Vector3(...a).distanceTo(new Vector3(...b)) > 2
          ? { distanceMeters: 2, colliderEntityId: "wall" }
          : { distanceMeters: new Vector3(...a).distanceTo(new Vector3(...b)) },
    }),
  });
  const d = structuredClone(document()) as any;
  d.views.orbit.overrides.constraints = { visibility: "require-line-of-sight" };
  c.install(d, frame());
  expect(c.inspect().current?.positionWorldMetersXYZ[2]).toBeLessThan(2);
  wall = false;
  subject = {
    ...initial,
    positionWorldMetersXYZ: [10, 0, 0],
    semanticQuaternionWorldXYZW: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
      .toArray(),
  };
  c.applyLifecycle(
    {
      kind: "relocate",
      operationId: "move",
      previousSubject: initial,
      subject,
    },
    frame(1),
  );
  expect(c.inspect().current?.positionWorldMetersXYZ[0]).toBeCloseTo(14);
});
it("confirmed target removal after physics discards pending input and retains the last valid pose", () => {
  const f = fixture();
  f.controller.install(document({ activation: "immediate" }), frame());
  const before = f.controller.inspect().current;
  f.controller.prepareInput({ orbitDeltaRadiansXY: [1, 0] }, 0.1, frame(1));
  f.controller.targetRemoved({ id: "actor", generation: 1 }, frame(1));
  expect(f.controller.inspect().mode).toBe("authored");
  expect(f.controller.inspect().current?.positionWorldMetersXYZ).toEqual(
    before?.positionWorldMetersXYZ,
  );
  expect(f.controller.inspect().current?.simulationTick).toBe(1);
});
it("reordered equivalent document content preserves active opening intent and revision", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.orbit = {
    kind: "third-person",
    opening: {
      positionWorldMetersXYZ: [0, 0, 8],
      lookAtWorldMetersXYZ: [0, 0, 0],
      fovDegrees: 50,
    },
    overrides: { framing: { kind: "preserve-opening" } },
  };
  f.controller.install(d, frame());
  step(f.controller, 1, { orbitDeltaRadiansXY: [0.6, 0] });
  const before = f.controller.inspect();
  d.views.orbit.opening = {
    fovDegrees: 50,
    lookAtWorldMetersXYZ: [0, 0, 0],
    positionWorldMetersXYZ: [0, 0, 8],
  };
  f.controller.install(d, frame(1));
  expect(f.controller.inspect().intent).toEqual(before.intent);
  expect(f.controller.inspect().configurationRevision).toBe(
    before.configurationRevision,
  );
});
it("seals and repeatedly resets authored pose and lens without any follow document", () => {
  const f = fixture();
  f.controller.install(document({ activation: "immediate" }), frame());
  const pose = f.controller.inspect().current!;
  const c = new CameraController({
    sampleSubject: () => {
      throw new Error("authored does not sample subject");
    },
    geometry: () => {
      throw new Error("authored does not query");
    },
  });
  const baseline = c.commitBaseline({
    authoredPose: {
      ...pose,
      positionWorldMetersXYZ: [7, 3, 9],
      lens: { verticalFovDegrees: 42, nearMeters: 0.1, farMeters: 500 },
    },
    frame: frame(),
  });
  expect(baseline.mode).toBe("authored");
  c.reset(frame(0, 2));
  c.reset(frame(0, 3));
  expect(c.inspect().mode).toBe("authored");
  expect(c.inspect().current?.positionWorldMetersXYZ).toEqual([7, 3, 9]);
  expect(c.inspect().current?.lens.verticalFovDegrees).toBe(42);
  expect(c.inspect().resolved).toBeUndefined();
});
it("checkpoint document restoration increments both identities and stamps both frames", () => {
  const { controller: c } = fixture();
  c.install(document({ activation: "immediate" }), frame());
  const checkpoint = c.captureCheckpoint();
  c.install(
    document({ activation: "immediate", input: { cycleViewIds: ["eye"] } }),
    frame(),
  );
  c.restoreCheckpoint(checkpoint, 2);
  expect(c.inspect().configurationRevision).toBe(3);
  expect(c.inspect().cameraCommitRevision).toBe(3);
  expect(c.inspect().previous?.configurationRevision).toBe(3);
  expect(c.inspect().current?.cameraCommitRevision).toBe(3);
  expect(() => c.restoreCheckpoint(checkpoint, 2)).toThrow();
});
it("subject-up relocation applies the same full rotation to active and dormant opening views", () => {
  const f = fixture();
  const d = structuredClone(document({ activation: "immediate" })) as any;
  d.views.orbit.overrides.orientation.referenceFrame = "subject-up";
  d.views.saved = {
    kind: "third-person",
    opening: {
      positionWorldMetersXYZ: [0, 0, 8],
      lookAtWorldMetersXYZ: [0, 0, 0],
      fovDegrees: 50,
    },
    overrides: {
      framing: { kind: "preserve-opening" },
      orientation: { referenceFrame: "subject-up" },
    },
  };
  f.controller.install(d, frame());
  const rotation = new Quaternion().setFromAxisAngle(
    new Vector3(1, 1, 0).normalize(),
    1,
  );
  const next = { ...initial, semanticQuaternionWorldXYZW: rotation.toArray() };
  f.setSubject(next);
  f.controller.applyLifecycle(
    {
      kind: "relocate",
      operationId: "tilt",
      previousSubject: initial,
      subject: next,
    },
    frame(1),
  );
  expect(
    new Vector3(
      ...f.controller.inspect().current!.positionWorldMetersXYZ,
    ).distanceTo(new Vector3(0, 0, 4).applyQuaternion(rotation)),
  ).toBeLessThan(1e-9);
  f.controller.setView("saved", frame(1), { cut: true });
  expect(
    new Vector3(
      ...f.controller.inspect().current!.positionWorldMetersXYZ,
    ).distanceTo(new Vector3(0, 0, 8).applyQuaternion(rotation)),
  ).toBeLessThan(1e-9);
});

it("seeds a missing preserve-opening from explicit authored pose before admission and survives activation/reset/roundtrip", () => {
  const f = fixture();
  f.controller.install(document({ activation: "immediate" }), frame());
  const source = f.controller.inspect().current!;
  const rotation = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), 0.3)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.2));
  const position = new Vector3(2, 3, 9);
  const authoredPose = {
    ...source,
    positionWorldMetersXYZ: position.toArray(),
    quaternionWorldXYZW: rotation.toArray(),
    lookAtWorldMetersXYZ: position
      .clone()
      .add(new Vector3(0, 0, -1).applyQuaternion(rotation))
      .toArray(),
    upWorldXYZ: new Vector3(0, 1, 0).applyQuaternion(rotation).toArray(),
    lens: { ...source.lens, verticalFovDegrees: 47 },
  };
  const d = structuredClone(document()) as any;
  d.views.orbit.overrides = {
    framing: { kind: "preserve-opening" },
    orientation: { recenter: { enabled: false } },
    zoom: {
      range: {
        kind: "bounded",
        minimumDistanceMeters: 0,
        maximumDistanceMeters: 10,
      },
    },
  };
  const { controller: c } = fixture();
  c.install(d, frame(), { authoredPose });
  expect(d.views.orbit.opening).toBeUndefined();
  const adopted = c.inspect().document!;
  expect(adopted.views.orbit).toMatchObject({
    opening: { fovDegrees: 47, positionWorldMetersXYZ: [2, 3, 9] },
  });
  c.commitBaseline();
  step(c, 1, { movement: true });
  const check = (controller: CameraController) => {
    expect(
      new Vector3(
        ...controller.inspect().current!.positionWorldMetersXYZ,
      ).distanceTo(position),
    ).toBeLessThan(1e-9);
    expect(
      new Quaternion(
        ...controller.inspect().current!.quaternionWorldXYZW,
      ).angleTo(rotation),
    ).toBeLessThan(1e-7);
    expect(controller.inspect().current!.lens.verticalFovDegrees).toBe(47);
  };
  check(c);
  c.reset(frame(0, 2));
  check(c);
  const { controller: rebuilt } = fixture();
  rebuilt.install(JSON.parse(serializeCameraDocument(adopted)), frame());
  check(rebuilt);
  expect(rebuilt.inspect().documentHash).toBe(c.inspect().documentHash);
  const invalid = structuredClone(d);
  invalid.views.orbit.overrides.zoom = {
    range: {
      kind: "bounded",
      minimumDistanceMeters: 0,
      maximumDistanceMeters: 2,
    },
  };
  const { controller: rejected } = fixture();
  const before = rejected.inspect();
  expect(() => rejected.install(invalid, frame(), { authoredPose })).toThrow();
  expect(rejected.inspect()).toEqual(before);
});

it.each([false, true])(
  "relocates dormant world-up views using only the event delta (previously active=%s)",
  (previouslyActive) => {
    const f = fixture();
    const d = structuredClone(document({ activation: "immediate" })) as any;
    d.views.saved = {
      kind: "third-person",
      opening: {
        positionWorldMetersXYZ: [0, 0, 8],
        lookAtWorldMetersXYZ: [0, 0, 0],
        fovDegrees: 50,
      },
      overrides: {
        framing: { kind: "preserve-opening" },
        orientation: { recenter: { enabled: false } },
      },
    };
    f.controller.install(d, frame());
    if (previouslyActive) {
      f.controller.setView("saved", frame(), { cut: true });
      f.controller.setView("orbit", frame(), { cut: true });
    }
    const turned = {
      ...initial,
      semanticQuaternionWorldXYZW: new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
        .toArray(),
    };
    f.setSubject(turned);
    step(f.controller, 1);
    const moved = {
      ...initial,
      positionWorldMetersXYZ: [10, 0, 0] as const,
      semanticQuaternionWorldXYZW: new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)
        .toArray(),
    };
    f.setSubject(moved);
    f.controller.applyLifecycle(
      {
        kind: "relocate",
        operationId: "turn-and-move",
        previousSubject: turned,
        subject: moved,
      },
      frame(2),
    );
    f.controller.setView("saved", frame(2), { cut: true });
    expect(f.controller.inspect().intent?.yawRadians).toBeCloseTo(Math.PI / 2);
    expect(
      f.controller.inspect().current?.positionWorldMetersXYZ[0],
    ).toBeCloseTo(18);
    expect(
      f.controller.inspect().current?.positionWorldMetersXYZ[2],
    ).toBeCloseTo(0);
  },
);

it.each(["relocate", "retarget"] as const)(
  "deduplicates %s then postphysics relocate without resetting collision recovery",
  (kind) => {
    let subject = initial,
      wall = true;
    const c = new CameraController({
      sampleSubject: () => subject,
      geometry: () => ({
        probe: (a, b) =>
          wall && new Vector3(...a).distanceTo(new Vector3(...b)) > 2
            ? { distanceMeters: 2, colliderEntityId: "wall" }
            : {
                distanceMeters: new Vector3(...a).distanceTo(new Vector3(...b)),
              },
      }),
    });
    const d = structuredClone(document({ activation: "immediate" })) as any;
    d.views.orbit.overrides.position.distanceMeters = 8;
    d.views.orbit.overrides.constraints = {
      visibility: "require-line-of-sight",
      recovery: {
        clearHoldSeconds: 0,
        halfLifeSeconds: 1,
        speedLimit: { kind: "unlimited" },
      },
    };
    c.install(d, frame());
    subject =
      kind === "retarget"
        ? { ...initial, id: "vehicle", generation: 2 }
        : initial;
    const event = {
      kind,
      operationId: "single-operation",
      previousSubject: initial,
      subject,
    };
    c.applyLifecycle(event, frame());
    const retracted = c.inspect().current!.positionWorldMetersXYZ[2];
    expect(retracted).toBeLessThan(2);
    wall = false;
    c.prepareInput({}, 1, frame(1));
    c.evaluateAndCommit(frame(1), { ...event, kind: "relocate" });
    expect(c.inspect().current!.positionWorldMetersXYZ[2]).toBeCloseTo(
      (retracted + 8) / 2,
    );
    expect(c.inspect().previous!.simulationTick).toBe(0);
  },
);

it('keeps immediate look-at and first-person author-pose admission restricted',()=>{
 const seed=fixture();seed.controller.install(document({activation:'immediate'}),frame());const pose=seed.controller.inspect().current!;
 for(const configuration of [document({activation:'immediate'}),document({defaultViewId:'eye'})]){
  const {controller}=fixture();const before=controller.inspect();expect(()=>controller.install(configuration,frame(),{authoredPose:pose})).toThrow();expect(controller.inspect()).toEqual(before);
 }
});

it('captures subject-up author framing with separate canonical and current references atomically',()=>{
 const f=fixture();const configuration=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',activation:'immediate',binding:{targetEntityId:'actor'},views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,3,8],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:50},overrides:{framing:{kind:'preserve-opening'},orientation:{referenceFrame:'subject-up'},zoom:{range:{kind:'unbounded'}}}}}});
 f.controller.install(configuration,frame());f.controller.commitBaseline();const baseline=f.controller.inspect();
 const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.4);const moved={...initial,positionWorldMetersXYZ:[3,2,1] as const,geometryQuaternionWorldXYZW:rotation.toArray(),semanticQuaternionWorldXYZW:rotation.toArray()};f.setSubject(moved);step(f.controller,1);f.controller.useAuthored();
 const pose={...f.controller.inspect().current!,positionWorldMetersXYZ:[10,9,15] as const};f.controller.captureAuthoredPose(configuration,pose,frame(1));expect(new Vector3(...f.controller.inspect().current!.positionWorldMetersXYZ).distanceTo(new Vector3(...pose.positionWorldMetersXYZ))).toBeLessThan(1e-6);
 const captured=f.controller.inspect();f.controller.useAuthored();const rejected=f.controller.inspect();f.fail();expect(()=>f.controller.captureAuthoredPose(configuration,pose,frame(1))).toThrow();expect(f.controller.inspect()).toEqual(rejected);
 const other=fixture();other.controller.install(captured.document!,frame());expect(other.controller.inspect().documentHash).toBe(captured.documentHash);
 expect(baseline.documentHash).not.toBe(captured.documentHash);
});

it('activates a preserved opening without accumulating idle subject settling into the first input',()=>{
 const f=fixture(),c=f.controller;
 const configuration=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'actor'},activation:'on-input',views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[14,18,22],lookAtWorldMetersXYZ:[0,0,0],fovDegrees:43},overrides:{framing:{kind:'preserve-opening'},position:{subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},orientation:{recenter:{enabled:false}}}}}});
 c.install(configuration,frame());c.commitBaseline();const baseline=c.inspect();
 f.setSubject({...initial,positionWorldMetersXYZ:[0,-.01,0]});step(c,1);const waiting=c.inspect();
 step(c,2,{movement:true});const active=c.inspect();
 expect(new Vector3(...active.current!.positionWorldMetersXYZ).distanceTo(new Vector3(...waiting.current!.positionWorldMetersXYZ))).toBeLessThan(1e-9);
 expect(new Quaternion(...active.current!.quaternionWorldXYZW).angleTo(new Quaternion(...waiting.current!.quaternionWorldXYZW))).toBeLessThan(1e-7);
 expect(active.documentHash).toBe(baseline.documentHash);expect(active.configurationRevision).toBe(baseline.configurationRevision);
 f.setSubject({...initial,positionWorldMetersXYZ:[1,-.01,0]});step(c,3,{movement:true});
 expect(c.inspect().current!.positionWorldMetersXYZ[0]-active.current!.positionWorldMetersXYZ[0]).toBeCloseTo(1,10);
});
it('rejects pending opening activation atomically when settled subject changes violate explicit bounds',()=>{
 const f=fixture(),c=f.controller;
 c.install(parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'actor'},activation:'on-input',views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,0,4],lookAtWorldMetersXYZ:[0,0,0],fovDegrees:43},overrides:{framing:{kind:'preserve-opening'},zoom:{range:{kind:'bounded',minimumDistanceMeters:0,maximumDistanceMeters:4}}}}}}),frame());
 f.setSubject({...initial,positionWorldMetersXYZ:[0,0,-1]});step(c,1);const before=c.inspect();
 expect(()=>c.prepareInput({movement:true},1/60,frame(2))).toThrow();expect(c.inspect()).toEqual(before);
});
it('rebases pending activation from the desired opening rather than a collision-shortened eye',()=>{
 let subject=structuredClone(initial);
 const c=new CameraController({sampleSubject:()=>subject,geometry:()=>({probe:(from,to)=>({distanceMeters:Math.min(2,new Vector3(...from).distanceTo(new Vector3(...to))),colliderEntityId:'wall'})})});
 c.install(parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'actor'},activation:'on-input',views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,1,8],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:43},overrides:{framing:{kind:'preserve-opening'},position:{subjectTranslationHalfLifeSeconds:0,armHalfLifeSeconds:0,anchorHalfLifeSeconds:0},orientation:{recenter:{enabled:false}},constraints:{visibility:'require-line-of-sight'}}}}}),frame());
 subject={...initial,positionWorldMetersXYZ:[0,-.01,0]};step(c,1);expect(c.inspect().diagnostics?.status).toBe('measured');
 step(c,2,{movement:true});expect(c.inspect().intent!.distanceMeters).toBeCloseTo(Math.hypot(1.01,8),10);expect(c.inspect().current!.positionWorldMetersXYZ[2]).toBeLessThan(3);
});

it("uses the predicted safe composition for movement after orbit stops at a wall", () => {
  const {body: _body, ...ordinary} = initial;
  const subject = {...ordinary,semanticQuaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.atan2(2,4)).toArray()};
  const c = new CameraController({sampleSubject:()=>subject,geometry:()=>({probe:(a,b)=>{
    const start = new Vector3(...a), end = new Vector3(...b), length = start.distanceTo(end);
    const box = new Box3(new Vector3(-.2,-2,3),new Vector3(.2,2,5));
    const hit = new Ray(start,end.clone().sub(start).normalize()).intersectBox(box,new Vector3());
    return hit && start.distanceTo(hit)<length ? {distanceMeters:start.distanceTo(hit),colliderEntityId:'wall'} : {distanceMeters:length};
  }})});
  const config = document({activation:'immediate',views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'},distanceMeters:Math.sqrt(20),armHalfLifeSeconds:0},orientation:{initialPitchRadians:0,recenter:{enabled:false}},constraints:{visibility:'preserve-framing'}}}}});
  c.install(config,frame());
  for (const [tick,input] of [[1,{orbitDeltaRadiansXY:[2*Math.atan2(2,4),0]}],[2,{movement:true}]] as const) {
    const before = c.inspect();
    const basis = c.prepareInput(input,1/60,frame(tick));
    expect(c.inspect()).toEqual(before);
    const committed = c.evaluateAndCommit(frame(tick));
    expect(new Quaternion(...basis.quaternionWorldXYZW).angleTo(new Quaternion(...committed.quaternionWorldXYZW))).toBeLessThan(1e-7);
  }
});

it.each([0,.3])('activates the selected pending view without replaying idle settling (transition=%s)',durationSeconds=>{
 const f=fixture(), c=f.controller;
 const configuration=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'actor'},activation:'on-input',transition:{durationSeconds},views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,2,8],lookAtWorldMetersXYZ:[0,1,0],fovDegrees:43},overrides:{framing:{kind:'preserve-opening'},position:{subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},orientation:{recenter:{enabled:false}},zoom:{range:{kind:'unbounded'}},constraints:{collision:{enabled:false}}}},eye:{kind:'first-person'}}});
 c.install(configuration,frame());c.commitBaseline();f.setSubject({...initial,positionWorldMetersXYZ:[0,-1,0]});step(c,1);
 const before=c.inspect().current!;c.setView('orbit',frame(1));
 for(let i=2;i<32;i++)step(c,i);
 const after=c.inspect().current!;
 expect(new Vector3(...after.positionWorldMetersXYZ).distanceTo(new Vector3(...before.positionWorldMetersXYZ))).toBeLessThan(1e-7);
 expect(new Quaternion(...after.quaternionWorldXYZW).angleTo(new Quaternion(...before.quaternionWorldXYZW))).toBeLessThan(1e-7);
 c.setView('eye',frame(31));c.setView('orbit',frame(31));for(let i=32;i<62;i++)step(c,i);
 expect(new Vector3(...c.inspect().current!.positionWorldMetersXYZ).distanceTo(new Vector3(...before.positionWorldMetersXYZ))).toBeLessThan(1e-7);
 f.setSubject(initial);c.reset(frame(0,2));
 expect(new Vector3(...c.inspect().current!.positionWorldMetersXYZ).distanceTo(new Vector3(0,2,8))).toBeLessThan(1e-7);
});

it('does not validate an unselected pending opening when switching to first-person',()=>{
 const f=fixture(),c=f.controller;
 const configuration=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'actor'},activation:'on-input',views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,0,4],lookAtWorldMetersXYZ:[0,0,0],fovDegrees:43},overrides:{framing:{kind:'preserve-opening'},zoom:{range:{kind:'bounded',minimumDistanceMeters:0,maximumDistanceMeters:4}}}},eye:{kind:'first-person'}}});
 c.install(configuration,frame());f.setSubject({...initial,positionWorldMetersXYZ:[0,-1,0]});step(c,1);
 expect(()=>c.setView('eye',frame(1))).not.toThrow();expect(c.inspect().resolved?.kind).toBe('first-person');
});

it('keeps aircraft heading through pitch poles, speculative input and checkpoint restore', () => {
  const f=fixture(), c=f.controller;
  const aircraft={...initial,continuousHeadingSeedRadians:0};
  f.setSubject(aircraft);
  c.install(document({activation:'immediate',views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'},armHalfLifeSeconds:0},orientation:{recenter:{enabled:true,minimumSpeedMetersPerSecond:0,delaySeconds:0,yawHalfLifeSeconds:0}}}},eye:{kind:'first-person',overrides:{orientation:{referenceFrame:'subject-up'}}}}}),{lifecycleGeneration:0,simulationTick:0,aspect:1});
  for(let tick=1;tick<=120;tick++){
    const rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),tick*Math.PI/120);
    const subject={...aircraft,semanticQuaternionWorldXYZW:rotation.toArray()};
    f.setSubject(subject);
    const frame={lifecycleGeneration:0,simulationTick:tick,aspect:1};
    // Two speculative evaluations must have the same result and leave the committed heading untouched.
    const first=c.prepareInput({},1/60,frame);c.abortPreparedInput();
    expect(c.prepareInput({},1/60,frame)).toEqual(first);c.evaluateAndCommit(frame);
    expect(c.inspect().intent!.yawRadians).toBeCloseTo(0,9);
    if(tick===60){const checkpoint=c.captureCheckpoint();c.restoreCheckpoint(checkpoint,c.inspect().cameraCommitRevision);}
    const before=c.inspect();
    c.sampleProjection({epoch:0,previousTick:before.previous!.simulationTick,currentTick:tick,alpha:.5,cut:false},1,subject);
    c.sampleProjection({epoch:0,previousTick:before.previous!.simulationTick,currentTick:tick,alpha:.5,cut:false},1,subject);
    expect(c.inspect()).toEqual(before);
  }
  // A real world-up turn after inversion changes heading once, without an Euler half-turn.
  const rotated=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.2).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI));
  f.setSubject({...aircraft,semanticQuaternionWorldXYZW:rotated.toArray()});
  const frame={lifecycleGeneration:0,simulationTick:121,aspect:1};c.prepareInput({},1/60,frame);c.evaluateAndCommit(frame);
  expect(c.inspect().intent!.yawRadians).toBeCloseTo(.2,9);
  c.setView('eye',frame);c.setView('orbit',frame);
  expect(c.inspect().current!.upWorldXYZ[1]).toBeGreaterThan(.9);
  c.prepareInput({},1/60,{...frame,simulationTick:122});c.evaluateAndCommit({...frame,simulationTick:122});
  expect(c.inspect().intent!.yawRadians).toBeCloseTo(.2,9);
});

it('uses the displayed aircraft heading for heading-space anchors at both endpoints and between them',()=>{
  const f=fixture(),c=f.controller;
  const previous:CameraSubjectFacts={...initial,continuousHeadingSeedRadians:0};
  f.setSubject(previous);
  c.install(document({activation:'immediate',views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'},anchorOffset:{space:'heading',offsetMetersXYZ:[2,0,0]},distanceMeters:4,subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},orientation:{initialPitchRadians:0,recenter:{enabled:false}}}}}}),{lifecycleGeneration:0,simulationTick:0,aspect:1});
  const currentRotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.2);
  const current:CameraSubjectFacts={...previous,continuousHeadingSeedRadians:.2,semanticQuaternionWorldXYZW:currentRotation.toArray()};
  f.setSubject(current);
  const frame={lifecycleGeneration:0,simulationTick:1,aspect:1};c.prepareInput({},1/60,frame);c.evaluateAndCommit(frame);
  const before=c.inspect();
  for(const alpha of [0,.25,.5,.75,1,.5,0]){
    const rotation=new Quaternion().slerp(currentRotation,alpha);
    const display={...previous,semanticQuaternionWorldXYZW:rotation.toArray()};
    const projected=c.sampleProjection({epoch:0,previousTick:0,currentTick:1,alpha,cut:false},1,display)!;
    const expected=new Vector3(2,0,0).applyQuaternion(rotation).add(new Vector3(0,0,4));
    expect(new Vector3(...projected.positionWorldMetersXYZ).distanceTo(expected)).toBeLessThan(1e-9);
    if(alpha===0)expect(projected.positionWorldMetersXYZ).toEqual(before.previous!.positionWorldMetersXYZ);
    if(alpha===1)expect(projected.positionWorldMetersXYZ).toEqual(before.current!.positionWorldMetersXYZ);
    expect(c.inspect()).toEqual(before);
  }
});


function inspectionCloneMetadata(value:unknown) {
  const data=value as {kind?:string;document?:{kind?:string};values?:unknown;subjectId?:string;resolved?:{values?:unknown}}|null|undefined;
  return {
    document:data?.kind==='world-camera'||data?.document?.kind==='world-camera',
    configuration:Boolean((data?.values&&data.subjectId)||data?.resolved?.values),
  };
}

it('copies detached inspection metadata once across commits without trusting caller shallow freezes',()=>{
  const {controller:c}=fixture();
  const source=Object.freeze(document({activation:'immediate'}));
  c.install(source,frame());
  const cloned=vi.spyOn(globalThis,'structuredClone');
  try{
    const first=c.inspect();
    expect(first.document).not.toBe(source);
    expect(Reflect.set(source.views.orbit!.overrides!.position!,'distanceMeters',9)).toBe(true);
    expect(first.document!.views.orbit!.overrides!.position).toMatchObject({distanceMeters:4});
    for(let tick=1;tick<=20;tick++){
      step(c,tick,{orbitDeltaRadiansXY:[.01,0]});const value=c.inspect();
      expect(value.document).toEqual(first.document);expect(value.resolved).toEqual(first.resolved);
      expect(value.current!.simulationTick).toBe(tick);
      expect(Object.isFrozen(value.document!.views.orbit!.overrides!.position)).toBe(true);
      expect(Reflect.set(value.document!.views.orbit!.overrides!.position!,'distanceMeters',99)).toBe(false);
      expect(Reflect.set(value.resolved!.values.position,'distanceMeters',99)).toBe(false);
      expect(Reflect.set(value.current!.positionWorldMetersXYZ,'0',99)).toBe(false);
    }
    const documents=cloned.mock.calls.filter(([value])=>inspectionCloneMetadata(value).document);
    const configurations=cloned.mock.calls.filter(([value])=>inspectionCloneMetadata(value).configuration);
    expect(documents).toHaveLength(1);expect(configurations).toHaveLength(1);
    expect(first.current!.simulationTick).toBe(0);expect(c.inspect().resolved!.values.position).toMatchObject({distanceMeters:4});
  }finally{cloned.mockRestore();c.dispose();}
});

it('refreshes cached inspection metadata for edits, view changes, checkpoints, reset and retarget',()=>{
  const f=fixture(),c=f.controller;
  c.install(document({activation:'immediate'}),frame());
  const initialInspection=c.inspect(),checkpoint=c.captureCheckpoint();c.commitBaseline();
  c.setView('other',frame());
  expect(c.inspect().configurationRevision).toBe(initialInspection.configurationRevision);
  expect(c.inspect().resolved).toMatchObject({viewId:'other',values:{position:{distanceMeters:6}}});
  c.setView('orbit',frame());
  c.install(document({activation:'immediate',views:{orbit:{kind:'third-person',overrides:{position:{distanceMeters:7}}}}}),frame());
  expect(c.inspect().resolved!.values.position).toMatchObject({distanceMeters:7});
  expect(initialInspection.resolved!.values.position).toMatchObject({distanceMeters:4});
  c.restoreConfiguration(initialInspection.document!,frame());
  expect(c.inspect().document).toEqual(initialInspection.document);
  expect(c.inspect().resolved!.values.position).toMatchObject({distanceMeters:4});
  c.restoreCheckpoint(checkpoint,c.inspect().cameraCommitRevision);
  expect(c.inspect().document).toEqual(initialInspection.document);
  expect(c.inspect().resolved).toEqual(initialInspection.resolved);
  c.reset(frame(0,2));
  expect(c.inspect().resolved).toEqual(initialInspection.resolved);
  const mounted={...initial,id:'mounted-subject',generation:2};f.setSubject(mounted);
  c.applyLifecycle({kind:'retarget',operationId:'mount-for-inspection',previousSubject:initial,subject:mounted},frame(0,2));
  expect(c.inspect().resolved).toMatchObject({subjectId:'mounted-subject',subjectGeneration:2});
  expect(initialInspection.resolved).toMatchObject({subjectId:'actor',subjectGeneration:1});c.dispose();
});

it('refreshes diagnostic-only inspection samples without recopying static metadata',()=>{
  const {controller:c}=fixture();c.install(document({activation:'immediate'}),frame());c.setCollisionDiagnosticsEnabled(true);
  const before=c.inspect(),cloned=vi.spyOn(globalThis,'structuredClone');
  try{
    c.sampleProjection({epoch:0,previousTick:0,currentTick:0,alpha:1,cut:false},1.5);
    const after=c.inspect();expect(after.cameraCommitRevision).toBe(before.cameraCommitRevision);
    expect(after.collisionQueries!.presentation!.probes.length).toBeGreaterThan(0);
    expect(before.collisionQueries!.presentation).toBeUndefined();
    expect(Reflect.set(after.collisionQueries!.presentation!,'simulationTick',99)).toBe(false);
    expect(cloned.mock.calls.filter(([value])=>{const metadata=inspectionCloneMetadata(value);return metadata.document||metadata.configuration;})).toHaveLength(0);
    c.setCollisionDiagnosticsEnabled(false);expect(c.inspect().collisionQueries).toBeUndefined();
  }finally{cloned.mockRestore();c.dispose();}
});

it('restores default view switching to a fresh orbit instead of dormant input',()=>{
 const {controller}=fixture();controller.install(document({activation:'immediate'}),frame());
 step(controller,1,{orbitDeltaRadiansXY:[.7,.2]});
 controller.setView('other',frame(1));controller.setView('orbit',frame(1));
 expect(controller.inspect().intent?.yawRadians).toBeCloseTo(0,10);
 expect(controller.inspect().intent?.pitchRadians).toBeCloseTo(0,10);
 expect(controller.inspect().transition.kind).toBe('none');
});

it('derives movement from orbit intent without a second pre-physics collision solve',()=>{
 const geometry=vi.fn(()=>({probe:(a:readonly [number,number,number],b:readonly [number,number,number])=>({distanceMeters:new Vector3(...a).distanceTo(new Vector3(...b))})}));
 const controller=new CameraController({sampleSubject:()=>initial,geometry});
 controller.install(document({activation:'immediate'}),frame());geometry.mockClear();
 const basis=controller.prepareInput({orbitDeltaRadiansXY:[.4,0]},1/60,frame(1));
 expect(geometry).not.toHaveBeenCalled();
 expect(new Vector3(0,0,-1).applyQuaternion(new Quaternion(...basis.quaternionWorldXYZW)).x).toBeCloseTo(-Math.sin(.4),10);
 controller.evaluateAndCommit(frame(1));expect(geometry).toHaveBeenCalledTimes(1);
});

it.each((['world-up','subject-heading','subject-up'] as const).flatMap(referenceFrame=>[true,false].map(inheritSubjectYaw=>({referenceFrame,inheritSubjectYaw}))))('keeps off-axis opening input aligned with $referenceFrame / inherit=$inheritSubjectYaw without collision queries',({referenceFrame,inheritSubjectYaw})=>{
 let subject=structuredClone(initial);
 const geometry=vi.fn(()=>({probe:(a:readonly [number,number,number],b:readonly [number,number,number])=>({distanceMeters:new Vector3(...a).distanceTo(new Vector3(...b))})}));
 const controller=new CameraController({sampleSubject:()=>subject,geometry});
 try{
  controller.install(document({activation:'immediate',views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,2,8],lookAtWorldMetersXYZ:[4,2,0],upWorldXYZ:[.2,1,.1],fovDegrees:50},overrides:{framing:{kind:'preserve-opening'},position:{anchor:{kind:'origin'},subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},orientation:{referenceFrame,inheritSubjectYaw,recenter:{enabled:false}},constraints:{collision:{enabled:false}}}}}}),frame());
  for(const [index,rotation] of [[0,0,0],[.7,.3,-.4]].entries()){
   subject={...subject,semanticQuaternionWorldXYZW:new Quaternion().setFromEuler(new Euler(rotation[1],rotation[0],rotation[2],'YXZ')).toArray()};
   geometry.mockClear();
   const basis=controller.prepareInput({movement:true},1/60,frame(index+1));
   expect(geometry).not.toHaveBeenCalled();
   controller.evaluateAndCommit(frame(index+1));
   expect(new Vector3(...cameraControlForward(basis.quaternionWorldXYZW)).distanceTo(new Vector3(...cameraControlForward(controller.inspect().desired!.quaternionWorldXYZW)))).toBeLessThan(1e-9);
  }
 }finally{controller.dispose();}
});

it('uses the opening camera right axis for vertical input and retains orbit through pitch poles',()=>{
 const {controller}=fixture();
 try{
  controller.install(document({activation:'immediate',views:{orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,3,8],lookAtWorldMetersXYZ:[0,-2,8],upWorldXYZ:[1,0,0],fovDegrees:50},overrides:{framing:{kind:'preserve-opening'},position:{anchor:{kind:'origin'},armHalfLifeSeconds:0},orientation:{recenter:{enabled:false}},constraints:{collision:{enabled:false}}}}}}),frame());
  for(const [index,pitch] of [0,.8,1,-2].entries()){
   const basis=controller.prepareInput({movement:true,orbitDeltaRadiansXY:[0,pitch]},1/60,frame(index+1));
   controller.evaluateAndCommit(frame(index+1));
   expect(new Vector3(...cameraControlForward(basis.quaternionWorldXYZW)).distanceTo(new Vector3(...cameraControlForward(controller.inspect().desired!.quaternionWorldXYZW)))).toBeLessThan(1e-9);
  }
 }finally{controller.dispose();}
});

it.each((['look-at','preserve-opening'] as const).flatMap(framing=>(['world-up','subject-heading','subject-up'] as const).map(referenceFrame=>({framing,referenceFrame}))))('preserves horizontal movement when automatic selection changes an opening to $framing / $referenceFrame and back',({framing,referenceFrame})=>{
 const {controller,setSubject}=fixture();
 try{
  const subject={...initial,semanticQuaternionWorldXYZW:new Quaternion().setFromEuler(new Euler(.2,.4,.1,'YXZ')).toArray()};
  setSubject(subject);
  const opening=anchoredOpening();
  controller.install(parseCameraDocument({...opening,
   views:{...opening.views,orbit:{...opening.views.orbit,opening:{positionWorldMetersXYZ:[2,3,8],lookAtWorldMetersXYZ:[4,1,0],upWorldXYZ:[.1,1,.1],fovDegrees:50}},water:{kind:'third-person',...(framing==='preserve-opening'?{opening:{positionWorldMetersXYZ:[-3,4,6],lookAtWorldMetersXYZ:[4,1,-2],upWorldXYZ:[.3,1,.1],fovDegrees:55}}:{}),overrides:{framing:{kind:framing},position:{anchor:{kind:'origin'},armHalfLifeSeconds:0},orientation:{referenceFrame,recenter:{enabled:false}},constraints:{collision:{enabled:false}}}}},
   viewSelection:{rules:[{id:'swim',viewId:'water',when:{state:'swimming'}}]},
  }),frame());
  step(controller,1,{orbitDeltaRadiansXY:[.4,.2]});
  const expected=new Vector3(...cameraControlForward(controller.inspect().desired!.quaternionWorldXYZW));
  for(const [index,swimming] of [true,false].entries()){
   setSubject({...subject,states:{swimming}});
   const basis=controller.prepareInput({movement:true},1/60,frame(index+2));
   expect(new Vector3(...cameraControlForward(basis.quaternionWorldXYZW)).distanceTo(expected)).toBeLessThan(1e-9);
   controller.evaluateAndCommit(frame(index+2));
   expect(controller.inspect().resolved!.viewId).toBe(swimming?'water':'orbit');
  }
 }finally{controller.dispose();}
});

it.each(['world-up','subject-up'] as const)('preserves the vertical opening right-axis input through an automatic %s view change',referenceFrame=>{
 const {controller,setSubject}=fixture();
 try{
  const opening=anchoredOpening();
  controller.install(parseCameraDocument({...opening,views:{...opening.views,water:{kind:'third-person',opening:{positionWorldMetersXYZ:[0,3,8],lookAtWorldMetersXYZ:[0,-2,8],upWorldXYZ:[1,0,0],fovDegrees:50},overrides:{framing:{kind:'preserve-opening'},position:{anchor:{kind:'origin'},armHalfLifeSeconds:0},orientation:{referenceFrame,recenter:{enabled:false}},constraints:{collision:{enabled:false}}}}},viewSelection:{rules:[{id:'swim',viewId:'water',when:{state:'swimming'}}]}}),frame());
  const expected=new Vector3(...cameraControlForward(controller.inspect().desired!.quaternionWorldXYZW));
  setSubject({...initial,states:{swimming:true}});
  const basis=controller.prepareInput({movement:true},1/60,frame(1));
  controller.evaluateAndCommit(frame(1));
  expect(new Vector3(...cameraControlForward(basis.quaternionWorldXYZW)).distanceTo(expected)).toBeLessThan(1e-9);
 }finally{controller.dispose();}
});

it.each(['third-person','first-person','shoulder'] as const)('uses the legal yaw branch when an automatic opening switches to bounded %s',kind=>{
 const {controller,setSubject}=fixture();
 try{
  const position=new Vector3(Math.sin(2.6)*8,2,Math.cos(2.6)*8);
  const direction=new Vector3(-Math.sin(-2.6),0,-Math.cos(-2.6));
  controller.install(document({activation:'immediate',views:{
   orbit:{kind:'third-person',opening:{positionWorldMetersXYZ:position.toArray(),lookAtWorldMetersXYZ:position.clone().add(direction).toArray(),fovDegrees:50},overrides:{framing:{kind:'preserve-opening'},position:{anchor:{kind:'origin'},armHalfLifeSeconds:0},orientation:{recenter:{enabled:false}},constraints:{collision:{enabled:false}}}},
   bounded:{kind,overrides:{orientation:{initialPitchRadians:0,yawLimitsRadians:{kind:'bounded',minimumRadians:-2.7,maximumRadians:2.7},recenter:{enabled:false}},constraints:{collision:{enabled:false}}}},
  },viewSelection:{rules:[{id:'swim',viewId:'bounded',when:{state:'swimming'}}]}}),frame());
  expect(controller.inspect().intent!.yawRadians).toBeCloseTo(2.6);
  setSubject({...initial,states:{swimming:true}});
  const basis=controller.prepareInput({movement:true},1/60,frame(1));
  controller.evaluateAndCommit(frame(1));
  expect(controller.inspect().intent!.yawRadians).toBeCloseTo(-2.6);
  expect(new Vector3(...cameraControlForward(basis.quaternionWorldXYZW)).distanceTo(direction)).toBeLessThan(1e-9);
 }finally{controller.dispose();}
});

it.each([
 {referenceFrame:'subject-heading',inheritSubjectYaw:true,framing:'preserve-opening'},
 {referenceFrame:'subject-up',inheritSubjectYaw:false,framing:'preserve-opening'},
 {referenceFrame:'subject-heading',inheritSubjectYaw:true,framing:'look-at'},
] as const)('retains heading history for vertical semantic subjects in $referenceFrame / $framing',({referenceFrame,inheritSubjectYaw,framing})=>{
 const {controller,setSubject}=fixture();
 try{
  const subject={...initial,semanticQuaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray()};
  setSubject(subject);
  controller.install(document({activation:'immediate',views:{orbit:{kind:'third-person',...(framing==='preserve-opening'?{opening:{positionWorldMetersXYZ:[3,4,8],lookAtWorldMetersXYZ:[-4,1,0],fovDegrees:50}}:{}),overrides:{framing:{kind:framing},position:{anchor:{kind:'origin'},subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},orientation:{referenceFrame,inheritSubjectYaw,recenter:{enabled:false}},constraints:{collision:{enabled:false}}}}}}),frame());
  step(controller,1);
  setSubject({...subject,semanticQuaternionWorldXYZW:new Quaternion().setFromEuler(new Euler(Math.PI/2,Math.PI/2,0,'YXZ')).toArray()});
  const basis=controller.prepareInput({movement:true},1/60,frame(2));
  controller.evaluateAndCommit(frame(2));
  expect(new Vector3(...cameraControlForward(basis.quaternionWorldXYZW)).distanceTo(new Vector3(...cameraControlForward(controller.inspect().desired!.quaternionWorldXYZW)))).toBeLessThan(1e-9);
 }finally{controller.dispose();}
});
