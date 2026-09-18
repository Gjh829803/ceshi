import * as THREE from 'three';
import {expect,it} from 'vitest';
import {inspectSurfaceOverlaps} from '../../src/browser/surface-overlap-geometry.js';

function triangle(points=[0,0,0, 2,0,0, 0,2,0],material=new THREE.MeshBasicMaterial()){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
 return new THREE.Mesh(geometry,material);
}
function sceneOf(...objects:THREE.Object3D[]){const scene=new THREE.Scene();scene.add(...objects);return scene;}

it('reports the pool stair top at water y=-0.25 and clears after a 0.05 metre repair',()=>{
 const stair=new THREE.Mesh(new THREE.BoxGeometry(3,.5,2),new THREE.MeshBasicMaterial());stair.position.y=-.5;stair.name='pool-step';
 const water=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshBasicMaterial({transparent:true,opacity:.45,depthWrite:false}));water.rotation.x=-Math.PI/2;water.position.y=-.25;water.name='water';
 const scene=sceneOf(stair,water),result=inspectSurfaceOverlaps(scene);
 expect(result.status).toBe('complete');expect(result.findings.length).toBeGreaterThan(0);
 expect(result.findings.every(f=>f.objects.some(o=>o.name==='water')&&f.objects.some(o=>o.name==='pool-step'))).toBe(true);
 expect(result.findings.reduce((sum,f)=>sum+f.overlapAreaSquareMeters,0)).toBeCloseTo(6);
 expect(result.findings[0]!.boundsWorldMeters.min[1]).toBeCloseTo(-.25);
 water.position.y=-.3;expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
});

it('finds the overlapping front faces of an arch pillar and rotated arch blocks',()=>{
 const material=new THREE.MeshBasicMaterial(),pillar=new THREE.Mesh(new THREE.BoxGeometry(3,8,4),material);pillar.position.set(10.4,4,0);pillar.name='pillar';
 const blocks=Array.from({length:5},(_,i)=>{const a=(i+1)*Math.PI/36;const block=new THREE.Mesh(new THREE.BoxGeometry(3,3,4),material);block.position.set(Math.cos(a)*8.9,8+Math.sin(a)*8.9,0);block.rotation.z=a;block.name=`arch-${i}`;return block;});
 const result=inspectSurfaceOverlaps(sceneOf(pillar,...blocks),{maxFindings:50});
 expect(result.findings.some(f=>f.objects.some(o=>o.name==='pillar')&&f.objects.some(o=>o.name==='arch-0'))).toBe(true);
 expect(result.findings.some(f=>Math.abs(f.boundsWorldMeters.min[2])===2&&f.boundsWorldMeters.min[2]===f.boundsWorldMeters.max[2])).toBe(true);
 // Production authors also bake these same pieces into one position buffer.
 const mergedPositions=[pillar,blocks[0]!].flatMap(piece=>{
  const matrix=new THREE.Matrix4().compose(piece.position,piece.quaternion,piece.scale);
  return Array.from(piece.geometry.toNonIndexed().applyMatrix4(matrix).getAttribute('position').array);
 });
 const merged=triangle(mergedPositions),mergedResult=inspectSurfaceOverlaps(sceneOf(merged));
 expect(mergedResult.findings.some(f=>f.objects[0].triangleIndex<12&&f.objects[1].triangleIndex>=12
  ||f.objects[1].triangleIndex<12&&f.objects[0].triangleIndex>=12)).toBe(true);
 expect(mergedResult.findings.every(f=>f.objects.every(object=>object.uuid===merged.uuid))).toBe(true);
});

it('detects internal merged geometry overlap without inventing original component identities',()=>{
 const mesh=triangle([0,0,0,2,0,0,0,2,0, .5,.5,0,1.5,.5,0,.5,1.5,0]);mesh.name='merged';
 const result=inspectSurfaceOverlaps(sceneOf(mesh));
 expect(result.findings).toHaveLength(1);
 expect(result.findings[0]!.objects.map(o=>[o.uuid,o.triangleIndex,o.entityId])).toEqual([[mesh.uuid,0,null],[mesh.uuid,1,null]]);
 expect(result.findings[0]!.overlapAreaSquareMeters).toBeCloseTo(.5);
});

it('does not warn for shared edges, separated surfaces or angled crossings',()=>{
 const first=triangle(),adjacent=triangle([2,0,0,2,2,0,0,2,0]),separated=triangle();separated.position.z=.05;
 const crossing=triangle([0,0,-1,2,0,1,0,2,1]);
 expect(inspectSurfaceOverlaps(sceneOf(first,adjacent,separated,crossing)).findings).toEqual([]);
});

it('classifies near parallel separation with a configurable bounded tolerance',()=>{
 const first=triangle(),second=triangle();second.position.z=.0003;const scene=sceneOf(first,second);
 expect(inspectSurfaceOverlaps(scene).findings[0]).toMatchObject({code:'NEAR_COPLANAR_SURFACE_OVERLAP',separationMeters:.0003});
 expect(inspectSurfaceOverlaps(scene).findings[0]!.objects.map(object=>object.overlapBoundsLocalMeters)).toEqual([
  {min:[0,0,0],max:[2,2,0]}, {min:[0,0,0],max:[2,2,0]},
 ]);
 expect(inspectSurfaceOverlaps(scene,{toleranceMeters:.0001}).findings).toEqual([]);
 second.position.z=.02;expect(inspectSurfaceOverlaps(scene,{toleranceMeters:100}).findings).toEqual([]);
});

it('derives parent transforms and nonuniform scale without updating source matrices',()=>{
 const first=triangle(),second=triangle(),group=new THREE.Group();group.add(first,second);group.position.set(5,7,9);group.rotation.y=.6;group.scale.set(3,2,4);
 const scene=sceneOf(group),before=[scene,group,first,second].map(o=>({matrix:o.matrix.toArray(),world:o.matrixWorld.toArray(),dirty:o.matrixWorldNeedsUpdate}));
 const result=inspectSurfaceOverlaps(scene,{ownerIds:new Map<THREE.Object3D,string>([[group,'parent'],[second,'child']])});
 expect(result.findings).toHaveLength(1);expect(result.findings[0]!.overlapAreaSquareMeters).toBeCloseTo(12);
 expect(result.findings[0]!.objects.map(o=>o.entityId)).toEqual(['parent','child']);
 expect(result.findings[0]!.boundsWorldMeters.min).toEqual([5,7,expect.closeTo(9-6*Math.sin(.6))]);
 expect([scene,group,first,second].map(o=>({matrix:o.matrix.toArray(),world:o.matrixWorld.toArray(),dirty:o.matrixWorldNeedsUpdate}))).toEqual(before);
 expect(first.geometry.boundingBox).toBeNull();expect(first.geometry.boundingSphere).toBeNull();
});

it('honors authored manual local matrices and inherited visibility',()=>{
 const first=triangle(),second=triangle();second.matrixAutoUpdate=false;second.matrix.makeTranslation(0,0,.1);
 const parent=new THREE.Group();parent.add(second);const scene=sceneOf(first,parent);
 expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
 second.matrix.identity();expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
 parent.visible=false;expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
});

it('respects selection, exclusion, and an explicitly empty selection',()=>{
 const first=triangle(),second=triangle(),other=triangle();const group=new THREE.Group();group.add(first,second);const scene=sceneOf(group,other);
 expect(inspectSurfaceOverlaps(scene,{roots:[]}).findings).toEqual([]);
 expect(inspectSurfaceOverlaps(scene,{roots:[group]}).findings).toHaveLength(1);
 expect(inspectSurfaceOverlaps(scene,{roots:[group],excludeRoots:[second]}).findings).toEqual([]);
});

it('suppresses differing effective polygon offsets but still detects equal offsets',()=>{
 const first=triangle(),second=triangle();const scene=sceneOf(first,second);
 second.material.polygonOffset=true;second.material.polygonOffsetFactor=-1;second.material.polygonOffsetUnits=-1;
 expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
 first.material.polygonOffset=true;first.material.polygonOffsetFactor=-1;first.material.polygonOffsetUnits=-1;
 expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
 first.material.depthTest=false;expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
});

it('uses rendered groups, material visibility and draw range',()=>{
 const original=triangle([0,0,0,2,0,0,0,2,0, 0,0,0,2,0,0,0,2,0]);
 const materials=[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial({visible:false})];
 const mesh=new THREE.Mesh(original.geometry,materials);mesh.geometry.addGroup(0,3,0);mesh.geometry.addGroup(3,3,1);const scene=sceneOf(mesh);
 expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
 materials[1]!.visible=true;expect(inspectSurfaceOverlaps(scene).findings[0]!.objects.map(o=>o.materialIndex)).toEqual([0,1]);
 mesh.geometry.setDrawRange(0,3);expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
});

it('reports unsupported deformed or shader surfaces as partial coverage',()=>{
 const geometry=triangle().geometry,material=new THREE.MeshBasicMaterial();
 const skinned=new THREE.SkinnedMesh(geometry,material),instanced=new THREE.InstancedMesh(geometry,material,3),morphed=triangle();
 morphed.geometry.morphAttributes.position=[morphed.geometry.attributes.position!.clone()];
 const shader=new THREE.Mesh(geometry,new THREE.ShaderMaterial()),clipped=triangle();clipped.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0)];
 const result=inspectSurfaceOverlaps(sceneOf(skinned,instanced,morphed,shader,clipped));
 expect(result.status).toBe('partial');expect(result.findings).toEqual([]);
 expect(result.coverage.skipped).toMatchObject({skinnedMeshes:1,instancedMeshes:1,morphedMeshes:1,unsupportedMaterials:2});
});

it('bounds coincident pair work, returns deterministic partial findings and clamps external budgets',()=>{
 const scene=sceneOf(...Array.from({length:30},()=>triangle()));
 const options={maxPairTests:9,maxFindings:50};const result=inspectSurfaceOverlaps(scene,options);
 expect(result.status).toBe('partial');expect(result.coverage.pairTests).toBe(9);expect(result.coverage.truncated).toContain('maxPairTests');
 expect(inspectSurfaceOverlaps(scene,options)).toEqual(result);
 expect(inspectSurfaceOverlaps(scene,{maxFindings:2}).findings).toHaveLength(2);
 expect(inspectSurfaceOverlaps(scene,{maxTriangles:4}).coverage).toMatchObject({trianglesCollected:4,truncated:expect.arrayContaining(['maxTriangles'])});
 const limits=inspectSurfaceOverlaps(scene,{maxTriangles:Infinity,maxObjects:Infinity,maxPairTests:Infinity,maxFindings:Infinity}).coverage.limits;
 expect(limits.maxTriangles).toBeLessThanOrEqual(30000);expect(limits.maxObjects).toBeLessThanOrEqual(30000);expect(limits.maxPairTests).toBeLessThanOrEqual(300000);expect(limits.maxFindings).toBeLessThanOrEqual(50);
});

it('bounds degenerate collection and huge object traversal without counting only valid triangles',()=>{
 const mesh=triangle(new Array(9000).fill(0));const degenerate=inspectSurfaceOverlaps(sceneOf(mesh),{maxTriangles:7});
 expect(degenerate.status).toBe('partial');expect(degenerate.coverage.trianglesVisited).toBe(7);
 const scene=sceneOf(...Array.from({length:100},()=>new THREE.Group()));
 const result=inspectSurfaceOverlaps(scene,{maxObjects:8});expect(result.status).toBe('partial');expect(result.coverage.objectsVisited).toBe(8);
});

it('bounds empty material groups and rejected broadphase candidates',()=>{
 const source=triangle(),mesh=new THREE.Mesh(source.geometry,[source.material]);
 for(let i=0;i<1000;i++)mesh.geometry.addGroup(0,0,0);
 const grouped=inspectSurfaceOverlaps(sceneOf(mesh),{maxTriangles:2,maxObjects:2});
 expect(grouped.status).toBe('partial');expect(grouped.coverage.collectionSteps).toBe(grouped.coverage.limits.maxCollectionSteps);
 expect(grouped.coverage.truncated).toContain('maxCollectionSteps');
 const meshes=Array.from({length:30},(_,i)=>{const object=triangle();object.position.y=i*3;return object;});
 const separated=inspectSurfaceOverlaps(sceneOf(...meshes),{maxPairTests:9});
 expect(separated.findings).toEqual([]);expect(separated.coverage).toMatchObject({pairTests:9,narrowPhaseTests:0,truncated:['maxPairTests']});
});

it('does not claim coverage for render-time deformation callbacks or execute them',()=>{
 const first=triangle(),second=triangle();let calls=0;
 second.onBeforeRender=()=>{calls++;};
 const result=inspectSurfaceOverlaps(sceneOf(first,second));
 expect(calls).toBe(0);expect(result.status).toBe('partial');expect(result.findings).toEqual([]);
 expect(result.coverage.skipped).toMatchObject({renderCallbackMeshes:1});
});

it('honors frozen matrixWorld and retains indexed triangle identities through draw ranges',()=>{
 const first=triangle(),second=triangle();second.matrixWorldAutoUpdate=false;second.matrixWorld.makeTranslation(0,0,1);
 const scene=sceneOf(first,second);expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
 second.matrixWorld.identity();second.geometry.setIndex([0,1,2,0,1,2]);second.geometry.setDrawRange(3,3);
 const result=inspectSurfaceOverlaps(scene);expect(result.findings).toHaveLength(1);
 expect(result.findings[0]!.objects[1].triangleIndex).toBe(1);
});

it('does not label a shallow angled crossing as a near parallel overlap',()=>{
 const first=triangle(),second=triangle();second.rotation.x=.0000005;
 expect(inspectSurfaceOverlaps(sceneOf(first,second)).findings).toEqual([]);
});

it('returns the most substantial collected overlap first for diagnostic highlighting',()=>{
 const small=triangle([0,0,0,1,0,0,0,1,0]),smallCopy=triangle([0,0,0,1,0,0,0,1,0]);
 const large=triangle([3,0,0,7,0,0,3,4,0]),largeCopy=triangle([3,0,0,7,0,0,3,4,0]);
 const result=inspectSurfaceOverlaps(sceneOf(small,smallCopy,large,largeCopy));
 expect(result.findings.map(f=>f.overlapAreaSquareMeters)).toEqual([8,.5]);
 expect(result.findings.map(f=>f.id)).toEqual(['surface-overlap-1','surface-overlap-2']);
});

it('keeps clean merged triangulation quiet at city coordinates while retaining millimetre overlaps',()=>{
 const geometry=new THREE.PlaneGeometry(3000,3000,5,5).toNonIndexed();
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.position.set(1200000,3400000,-5700000);mesh.rotation.set(.63,.28,.91);mesh.scale.set(1.3,.7,2);
 const result=inspectSurfaceOverlaps(sceneOf(mesh),{maxPairTests:10000});
 expect(result.status).toBe('complete');expect(result.findings).toEqual([]);
 const first=triangle(),second=triangle();first.position.set(1200000,3400000,-5700000);second.position.copy(first.position);second.position.x+=1.999;
 const overlap=inspectSurfaceOverlaps(sceneOf(first,second));expect(overlap.findings).toHaveLength(1);
 expect(overlap.findings[0]!.overlapAreaSquareMeters).toBeCloseTo(.0000005,9);
});

it('omits touching internal FrontSide faces of adjacent and stacked boxes',()=>{
 const material=new THREE.MeshBasicMaterial();
 const first=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),material),stacked=first.clone(),adjacent=first.clone();
 stacked.position.y=2;adjacent.position.x=2;
 const result=inspectSurfaceOverlaps(sceneOf(first,stacked,adjacent));
 expect(result.status).toBe('complete');expect(result.findings).toEqual([]);
});

it('compares effective FrontSide and BackSide facing while preserving DoubleSide risk',()=>{
 const first=triangle(),opposite=triangle([0,0,0,0,2,0,2,0,0]),scene=sceneOf(first,opposite);
 expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
 opposite.material.side=THREE.BackSide;expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
 first.material.side=THREE.BackSide;expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
 opposite.material.side=THREE.DoubleSide;expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
 first.material.side=THREE.DoubleSide;expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
 opposite.material.side=THREE.FrontSide;expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
});

it('accounts for renderer front-face winding reversal under reflected transforms',()=>{
 const first=triangle(),reflected=triangle(),scene=sceneOf(first,reflected);
 // X reflection reverses geometric winding, but frontFaceCW reverses it again.
 reflected.scale.x=-1;reflected.position.x=2;
 expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
 // Z reflection leaves these plane vertices unchanged but reverses its facing.
 reflected.scale.set(1,1,-1);reflected.position.x=0;
 expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
 reflected.material.side=THREE.BackSide;expect(inspectSurfaceOverlaps(scene).findings).toHaveLength(1);
});

it('finds water near the far end of a long staircase within the default comparison budget',()=>{
 const steps=Array.from({length:64},(_,i)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,1,1),new THREE.MeshBasicMaterial());mesh.position.z=i;return mesh;
 });
 const water=new THREE.Mesh(new THREE.PlaneGeometry(4,1),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));
 water.rotation.x=-Math.PI/2;water.position.set(0,.5,63);water.name='water';
 const scene=sceneOf(...steps,water),result=inspectSurfaceOverlaps(scene);
 expect(result.status).toBe('complete');expect(result.coverage.pairTests).toBeLessThan(100000);
 expect(result.findings.length).toBeGreaterThan(0);expect(result.findings.every(f=>f.objects.some(o=>o.name==='water'))).toBe(true);
 water.position.y+=.05;expect(inspectSurfaceOverlaps(scene).findings).toEqual([]);
});

it('returns overlap bounds in each translated and rotated mesh local coordinate system',()=>{
 const first=triangle(),second=triangle([0,0,0,1,0,0,0,1,0]);second.position.set(.5,.5,0);
 const group=new THREE.Group();group.add(first,second);group.position.set(3,4,5);group.rotation.set(.4,.7,.2);group.scale.set(2,3,1);
 const scene=sceneOf(group),firstMatrix=first.matrix.toArray(),secondMatrix=second.matrix.toArray();
 const result=inspectSurfaceOverlaps(scene);expect(result.findings).toHaveLength(1);
 const objects=result.findings[0]!.objects;
 expect(objects.find(object=>object.uuid===first.uuid)!.overlapBoundsLocalMeters).toEqual({
  min:[expect.closeTo(.5),expect.closeTo(.5),expect.closeTo(0)],max:[expect.closeTo(1.5),expect.closeTo(1.5),expect.closeTo(0)],
 });
 expect(objects.find(object=>object.uuid===second.uuid)!.overlapBoundsLocalMeters).toEqual({
  min:[expect.closeTo(0),expect.closeTo(0),expect.closeTo(0)],max:[expect.closeTo(1),expect.closeTo(1),expect.closeTo(0)],
 });
 expect(first.matrix.toArray()).toEqual(firstMatrix);expect(second.matrix.toArray()).toEqual(secondMatrix);
});

it('returns null local overlap bounds for singular transforms with valid world triangles',()=>{
 const first=triangle(),flattened=triangle();flattened.scale.z=0;
 const result=inspectSurfaceOverlaps(sceneOf(first,flattened));expect(result.findings).toHaveLength(1);
 const finding=result.findings[0]!;
 expect(finding.boundsWorldMeters).toEqual({min:[0,0,0],max:[2,2,0]});
 expect(finding.objects.find(object=>object.uuid===flattened.uuid)!.overlapBoundsLocalMeters).toBeNull();
 expect(finding.objects.find(object=>object.uuid===first.uuid)!.overlapBoundsLocalMeters).toEqual({min:[0,0,0],max:[2,2,0]});
});
