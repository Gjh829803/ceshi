import RAPIER from "@dimforge/rapier3d-compat";
import { it, expect } from "vitest";
import { Quaternion, Vector3 } from "three";
import { createMountedFixture } from "../mounted-test-fixture";
import {EnvironmentQueries, initEnvironmentQueries} from './queries';
const observationMap={id:'ids',name:'IDs',description:'',bounds:{min:[-120,-10,-120],max:[120,30,120]},boxes:[{id:'ground',position:[0,-.5,0],size:[200,1,200]}],water:[],regions:[],spawns:[],playerSpawn:[0,.03,0]} as const;
it('identifies every tile of an authored slab without advancing the solver',async()=>{
  await initEnvironmentQueries();const q=new EnvironmentQueries(observationMap);
  try{const count=q.colliderCount;for(const x of [-80,0,80])for(const z of [-80,0,80]){
    const hit=q.raycast(new Vector3(x,5,z),new Vector3(0,-1,0),10);
    expect(hit?.id).toBe('ground');expect(hit?.distance).toBeCloseTo(5,5);
  }expect(q.colliderCount).toBe(count);}finally{q.dispose();}
});
it('maps rigid vehicle parts to the instance and retires IDs with the rig',async()=>{
  await initEnvironmentQueries();const q=new EnvironmentQueries(observationMap);
  try{const create=(id:string)=>q.vehicleRig(id,{},new Vector3(10,0,10),new Quaternion(),1000,.9,2,1.8,.6);
    const car=create('custom-car'),handles=car.colliders.map(c=>c.handle),count=q.colliderCount;
    for(const handle of handles)expect(q.colliderId(handle)).toBe('custom-car');
    expect(q.colliderCount).toBe(count);q.releaseVehicleRig('custom-car');
    for(const handle of handles)expect(q.colliderId(handle)).toBe(`collider-${handle}`);
    const next=create('replacement');for(const collider of next.colliders)expect(q.colliderId(collider.handle)).toBe('replacement');
  }finally{q.dispose();}
});
it('reports actor identity instead of the query-part key, preserving unknown colliders',async()=>{
  const world=await createMountedFixture();try{
    const q=world.humanoid!.simulation.environment,h=world.humanoid!.simulation.controlledActor.controller!;
    q.syncActorBodies([{id:'proxy-part',actorId:'custom-actor',position:new Vector3(15,1,15),rotation:new Quaternion(),body:{kind:'box',offset:[0,0,0],halfExtents:[1,1,1]}}]);
    let found=false;h.world.forEachCollider(c=>{if(c.translation().x===15){expect(q.colliderId(c.handle)).toBe('custom-actor');found=true;}});expect(found).toBe(true);
    const unknown=h.world.createCollider(RAPIER.ColliderDesc.ball(.1));expect(q.colliderId(unknown.handle)).toBe(`collider-${unknown.handle}`);
  }finally{world.dispose();}
});
it("detects a moved collider directly before the next broadphase update", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const collider = world.createCollider(RAPIER.ColliderDesc.ball(0.5)),
      rotation = { x: 0, y: 0, z: 0, w: 1 },
      shape = new RAPIER.Ball(0.5);
    world.step();
    collider.setTranslation({ x: 10, y: 0, z: 0 });
    world.propagateModifiedBodyPositionsToColliders();
    expect(
      world.intersectionWithShape({ x: 10, y: 0, z: 0 }, rotation, shape),
    ).toBeNull();
    expect(
      collider.intersectsShape(shape, { x: 10, y: 0, z: 0 }, rotation),
    ).toBe(true);
  } finally {
    world.free();
  }
});
it("checks live actor poses without creating colliders", async () => {
  const world = await createMountedFixture({
    secondHorsePosition: [10, 0.025, 0],
  });
  try {
    const sim = world.humanoid!.simulation,
      q = sim.environment!,
      h = sim.controlledActor.controller!,
      count = q.colliderCount;
    const horse = sim.vehicles[1]!;
    horse.position.set(5, 0.025, 0);
    q.syncActorBodies(
      sim.vehicles.map((v) => ({
        id: `${v.spec.id}:0`,
        position: v.position,
        rotation: v.rotation,
        body: v.spec.envelope!,
      })),
    );
    expect(
      q.bodyOverlap({
        position: new Vector3(5, 0.025, 0),
        rotation: new Quaternion(),
        body: h.standingQueryBody,
      }),
    ).toBe(true);
    expect(q.colliderCount).toBe(count);
  } finally {
    world.dispose();
  }
});
it("ignores enabled sensors, rejects initial penetration and blocked mid-path with clear endpoints", async () => {
  const world = await createMountedFixture();
  try {
    const h = world.humanoid!.simulation.controlledActor.controller!,
      q = world.humanoid!.simulation.environment!,
      filter = { excludedColliderHandles: new Set([h.capsule.handle]) },
      pose = (x: number, z = 8) => ({
        position: new Vector3(x, 0.025, z),
        rotation: new Quaternion(),
        body: h.standingQueryBody,
      });
    h.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.1, 1, 1)
        .setTranslation(0, 1, 8)
        .setSensor(true),
    );
    expect(q.bodyPathBlocked([pose(-2), pose(2)], filter)).toBe(false);
    h.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.1, 1, 1).setTranslation(0.5, 1, 8),
    );
    const count = q.colliderCount;
    expect(q.bodyOverlap(pose(-2), filter)).toBe(false);
    expect(q.bodyOverlap(pose(2), filter)).toBe(false);
    expect(q.bodyPathBlocked([pose(-2), pose(2)], filter)).toBe(true);
    expect(q.bodyPathBlocked([pose(0.5), pose(2)], filter)).toBe(true);
    expect(q.bodyOverlap(pose(0.79), filter, 0.015)).toBe(true);
    expect(q.colliderCount).toBe(count);
  } finally {
    world.dispose();
  }
});
it("rejects low ceilings and invalid inputs without entering WASM or changing collider count", async () => {
  const world = await createMountedFixture({
    boxes: [{ id: "roof", position: [5, 1.5, 5], size: [3, 0.2, 3] }],
  });
  try {
    const s = world.humanoid!.simulation,
      q = s.environment!,
      body = s.controlledActor.controller!.standingQueryBody,
      count = q.colliderCount;
    expect(
      q.bodyOverlap({
        position: new Vector3(5, 0.025, 5),
        rotation: new Quaternion(),
        body,
      }),
    ).toBe(true);
    expect(() =>
      q.bodyOverlap({
        position: new Vector3(NaN, 0, 0),
        rotation: new Quaternion(),
        body,
      }),
    ).toThrow("HUMANOID_QUERY_INVALID");
    expect(q.colliderCount).toBe(count);
  } finally {
    world.dispose();
  }
});
it("requires the rider slope instead of the generic environment slope", async () => {
  const world = await createMountedFixture({
    boxes: [
      {
        id: "slope",
        position: [8, 2, 8],
        size: [8, 0.5, 8],
        rotation: [0, 0, Math.PI / 3],
      },
    ],
  });
  try {
    const s = world.humanoid!.simulation,
      q = s.environment!;
    expect(
      q.standingSupport(
        new Vector3(8, 4, 8),
        3,
        s.controlledActor.controller!.controller.maxSlopeClimbAngle(),
      ),
    ).toBeNull();
    expect(
      q.standingSupport(new Vector3(8, 4, 8), 3, Math.PI / 2 - 0.01),
    ).not.toBeNull();
  } finally {
    world.dispose();
  }
});
