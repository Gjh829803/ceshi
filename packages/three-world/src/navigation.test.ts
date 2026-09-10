import { afterEach, describe, expect, it, vi } from 'vitest';
import { Crowd, NavMesh, NavMeshQuery, Raw } from '@recast-navigation/core';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { ThreeNavigation,type NavigationActor } from './navigation';
import type { Vec3 } from './contracts';
import { setEntityBoundary } from './geometry';

const instances: ThreeNavigation[] = [];
const create = async () => { const nav = await ThreeNavigation.create(); instances.push(nav); return nav; };
const box = (size: Vec3, position: Vec3) => {
  const mesh = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial());
  mesh.position.fromArray(position);
  return mesh;
};
const floor = (x = 0, z = 0, width = 16, depth = 16, y = 0) => box([width, 0.4, depth], [x, y - 0.2, z]);
afterEach(() => { for (const instance of instances.splice(0)) instance.dispose(); });

describe('ThreeNavigation with real Recast and native mesh geometry', () => {
  it('routes around an L-shaped obstacle with no segment cutting through its mesh', async () => {
    const nav = await create();
    const walls = [box([0.6, 3, 10], [0, 1.5, -1]), box([6, 3, 0.6], [3, 1.5, 4])];
    nav.rebuild([floor(), ...walls]);
    const result = nav.findPath([-4, 0, 0], [4, 0, 0]);
    expect(result.status).toBe('success');
    expect(result.points.length).toBeGreaterThan(2);
    expect(result.points.some((point) => Math.abs(point[2]) > 4.4)).toBe(true);
    for (let i = 1; i < result.points.length; i++) {
      const a = new Vector3(...result.points[i - 1]!).add(new Vector3(0, 1, 0));
      const b = new Vector3(...result.points[i]!).add(new Vector3(0, 1, 0));
      const distance = a.distanceTo(b);
      if (distance > 1e-6) expect(new Raycaster(a, b.sub(a).normalize(), 0, distance).intersectObjects(walls)).toHaveLength(0);
    }
  });

  it('rejects partial Detour routes between disconnected islands', async () => {
    const nav = await create();
    nav.rebuild([floor(-5, 0, 6, 6), floor(5, 0, 6, 6)]);
    expect(nav.findPath([-5, 0, 0], [5, 0, 0])).toEqual({
      status: 'unreachable', points: [], reason: 'NAVIGATION_DISCONNECTED_OR_LIMITED',
    });
  });

  it('rebuilds after a bridge is deleted and cannot reuse its former route', async () => {
    const nav = await create();
    const islands = [floor(-5, 0, 6, 6), floor(5, 0, 6, 6)];
    const bridge = floor(0, 0, 4, 2);
    nav.rebuild([...islands, bridge]);
    expect(nav.findPath([-5, 0, 0], [5, 0, 0]).status).toBe('success');
    nav.rebuild(islands);
    expect(nav.findPath([-5, 0, 0], [5, 0, 0]).status).toBe('unreachable');
    nav.rebuild([...islands, bridge]);
    expect(nav.findPath([-5, 0, 0], [5, 0, 0]).status).toBe('success');
  });

  it('reaches a raised platform through a real sloped triangle surface', async () => {
    const nav = await create();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-2, 0, -2, -2, 0, 2, 4, 2, -2, 4, 2, 2], 3));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    const ramp = new Mesh(geometry, new MeshBasicMaterial());
    nav.rebuild([floor(-5, 0, 6, 6), ramp, floor(7, 0, 6, 6, 2)]);
    const result = nav.findPath([-5, 0, 0], [8, 2, 0]);
    expect(result.status).toBe('success');
    expect(result.points.at(-1)![1]).toBeCloseTo(2, 0);
    expect(result.points.some((point) => point[1] > 0.25 && point[1] < 1.75)).toBe(true);
    nav.rebuild([floor(-5, 0, 6, 6), ramp, floor(7, 0, 6, 6, 2)], { maximumSlopeDegrees: 10 });
    expect(nav.findPath([-5, 0, 0], [8, 2, 0]).status).toBe('unreachable');
  });

  it('uses instanced geometry in world coordinates under transformed parents', async () => {
    const nav = await create();
    const group = new Group(); group.position.set(40, 0, -30);
    const tiles = new InstancedMesh(new BoxGeometry(4, 0.4, 4), new MeshBasicMaterial(), 2);
    tiles.setMatrixAt(0, new Matrix4().makeTranslation(0, -0.2, 0));
    tiles.setMatrixAt(1, new Matrix4().makeTranslation(4, -0.2, 0));
    group.add(tiles);
    nav.rebuild([group]);
    expect(nav.findPath([40, 0, -30], [44, 0, -30]).status).toBe('success');
    expect(nav.findPath([0, 0, 0], [4, 0, 0]).status).toBe('unreachable');
    group.visible = false;
    nav.rebuild([group]);
    expect(nav.findPath([40, 0, -30], [44, 0, -30]).status).toBe('success'); // v2 visibility is visual-only; collision/navigation remain.
  });

  it('never invents routes for empty geometry, off-mesh endpoints or a rejected rebuild', async () => {
    const nav = await create();
    expect(nav.findPath([0, 0, 0], [1, 0, 0]).status).toBe('unreachable');
    nav.rebuild([floor()]);
    expect(nav.findPath([0, 0, 0], [2, 0, 0]).status).toBe('success');
    expect(nav.findPath([0, 0, 0], [0, 5, 0]).status).toBe('unreachable');
    expect(nav.findPath([0, 0, 0], [20, 0, 0]).status).toBe('unreachable');
    expect(nav.findPath([NaN, 0, 0], [0, 0, 0]).status).toBe('unreachable');
    expect(() => nav.rebuild([floor()], { radiusMeters: -1 })).toThrow('NAVIGATION_OPTIONS_INVALID');
    expect(nav.findPath([0, 0, 0], [2, 0, 0]).status).toBe('unreachable');
    nav.rebuild([]);
    expect(nav.findPath([0, 0, 0], [2, 0, 0]).reason).toBe('NAVIGATION_EMPTY');
    nav.dispose(); nav.dispose();
    expect(nav.findPath([0, 0, 0], [1, 0, 0]).reason).toBe('NAVIGATION_DISPOSED');
  });

  it('still frees the mesh when a query disposal hook throws and never retries native frees', async () => {
    const nav = await create();
    nav.rebuild([floor()]);
    const originalDestroy = NavMeshQuery.prototype.destroy;
    const queryDestroy = vi.spyOn(NavMeshQuery.prototype, 'destroy').mockImplementation(function (this: NavMeshQuery) {
      originalDestroy.call(this);
      throw new Error('query disposal hook');
    });
    const meshDestroy = vi.spyOn(NavMesh.prototype, 'destroy');
    try {
      expect(() => nav.dispose()).toThrow('NAVIGATION_RESOURCE_CLEANUP_FAILED');
      expect(queryDestroy).toHaveBeenCalledTimes(1);
      expect(meshDestroy).toHaveBeenCalledTimes(1);
      expect(() => nav.dispose()).not.toThrow();
      expect(queryDestroy).toHaveBeenCalledTimes(1);
      expect(meshDestroy).toHaveBeenCalledTimes(1);
    } finally { vi.restoreAllMocks(); }
  });
  it('keeps independently registered nested terrain roots in the navigation source exactly once', async () => {
    const nav = await create(), parent = new Group(); parent.position.set(20, 0, -10);
    const ground = floor(); parent.add(ground); setEntityBoundary(parent, true); setEntityBoundary(ground, true);
    nav.rebuild([parent, ground, ground]);
    expect(nav.findPath([16, 0, -10], [24, 0, -10]).status).toBe('success');
    ground.visible = false; nav.rebuild([parent, ground]);
    expect(nav.findPath([16, 0, -10], [24, 0, -10]).status).toBe('success');
    nav.rebuild([]); // Removing physical sources, not hiding them, removes navigation.
    expect(nav.findPath([16, 0, -10], [24, 0, -10]).reason).toBe('NAVIGATION_EMPTY');
  });

});

describe('installed Detour crowd resource ownership',()=>{
  it('releases temporary native parameters on add, update and capacity rejection',async()=>{
    const nav=await create();nav.rebuild([floor()]);const crowd=new Crowd((nav as unknown as {navMesh:NavMesh}).navMesh,{maxAgents:1,maxAgentRadius:.3});
    const Constructor=Raw.Module.dtCrowdAgentParams,allocated:unknown[]=[],freed:unknown[]=[];const destroy=Raw.destroy;
    const constructor=vi.spyOn(Raw.Module,'dtCrowdAgentParams').mockImplementation(function(){const params=new Constructor();allocated.push(params);return params;});
    const release=vi.spyOn(Raw,'destroy').mockImplementation(value=>{freed.push(value);destroy(value);});
    try{
      const agent=crowd.addAgent({x:0,y:0,z:0},{radius:.3,height:1.8});
      for(let tick=0;tick<60;tick++)agent.updateParameters({maxSpeed:2+tick/60});
      expect(()=>crowd.addAgent({x:2,y:0,z:0},{radius:.3,height:1.8})).toThrow('RECAST_CROWD_AGENT_CAPACITY');
      expect(allocated.length).toBe(62);for(const value of allocated)expect(freed.filter(item=>item===value)).toHaveLength(1);
      expect(agent.maxSpeed).toBeCloseTo(2+59/60);expect(crowd.getActiveAgentCount()).toBe(1);
    }finally{constructor.mockRestore();release.mockRestore();crowd.destroy();}
  });
  it('releases its borrowed query wrapper and owned filter without freeing the borrowed query twice',async()=>{
    const nav=await create();nav.rebuild([floor()]);const crowd=new Crowd((nav as unknown as {navMesh:NavMesh}).navMesh,{maxAgents:2,maxAgentRadius:.3});
    const borrowed=crowd.navMeshQuery.raw,filter=crowd.navMeshQuery.defaultFilter.raw,destroy=vi.spyOn(Raw,'destroy'),queryDestroy=vi.spyOn(crowd.navMeshQuery,'destroy'),free=vi.spyOn(Raw.Detour,'freeCrowd');let disposed=false;
    try{crowd.destroy();disposed=true;expect(destroy.mock.calls.filter(([value])=>value===borrowed)).toHaveLength(1);expect(destroy.mock.calls.filter(([value])=>value===filter)).toHaveLength(1);expect(queryDestroy).not.toHaveBeenCalled();crowd.destroy();expect(free).toHaveBeenCalledOnce();expect(nav.findPath([-2,0,0],[2,0,0]).status).toBe('success');}
    finally{destroy.mockRestore();queryDestroy.mockRestore();free.mockRestore();if(!disposed)crowd.destroy();}
  });
});

it('isolates an off-mesh actor and leaves the supplied physical poses untouched',async()=>{
  const nav=await create();nav.rebuild([floor()]);
  const actors:NavigationActor[]=[{id:'off-mesh',positionWorldMetersXYZ:[20,3,0],velocityWorldMetersPerSecondXYZ:[0,0,0],radiusMeters:.3,heightMeters:1.8,desiredVelocityMetersPerSecondXZ:[1,0]},
    {id:'walking',positionWorldMetersXYZ:[0,0,0],velocityWorldMetersPerSecondXYZ:[0,0,0],radiusMeters:.3,heightMeters:1.8,desiredVelocityMetersPerSecondXZ:[0,1]}];
  const before=structuredClone(actors),result=nav.steer(actors,1/60);
  expect(result.get('off-mesh')).toEqual({velocityMetersPerSecondXZ:[0,0],error:'NAVIGATION_AVOIDANCE_OFF_MESH'});expect(result.get('walking')?.error).toBeUndefined();expect(actors).toEqual(before);
});
it('cleans up a Crowd whose native initialization fails',async()=>{
  const nav=await create();nav.rebuild([floor()]);const raw=Raw.Detour.allocCrowd(),init=vi.spyOn(raw,'init').mockReturnValue(false),allocate=vi.spyOn(Raw.Detour,'allocCrowd').mockReturnValue(raw),free=vi.spyOn(Raw.Detour,'freeCrowd');
  try{expect(()=>new Crowd((nav as unknown as {navMesh:NavMesh}).navMesh,{maxAgents:2,maxAgentRadius:.3})).toThrow('RECAST_CROWD_INIT_FAILED');expect(free).toHaveBeenCalledOnce();expect(nav.findPath([-2,0,0],[2,0,0]).status).toBe('success');}
  finally{init.mockRestore();allocate.mockRestore();free.mockRestore();}
});
