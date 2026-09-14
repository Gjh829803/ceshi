import {Box3,BufferGeometry,InstancedMesh,Matrix4,Mesh,Vector3,type InstancedBufferAttribute} from 'three';

/** Copy only collision inputs, once per source revision; never retain mutable author buffers. */
export function cameraGeometrySource(geometry:BufferGeometry):BufferGeometry {
 const source=new BufferGeometry(),position=geometry.getAttribute('position'),index=geometry.getIndex();
 if(position)source.setAttribute('position',position.clone());
 if(index)source.setIndex(index.clone());
 source.setDrawRange(geometry.drawRange.start,geometry.drawRange.count);
 return source;
}

/** Per-mesh inputs may differ even when position/index buffers are shared. */
export function cameraMeshSource(mesh:Mesh,geometrySource:BufferGeometry):Mesh {
 const geometry=new BufferGeometry(),position=geometrySource.getAttribute('position'),index=geometrySource.getIndex();
 if(position)geometry.setAttribute('position',position);if(index)geometry.setIndex(index);
 geometry.setDrawRange(geometrySource.drawRange.start,geometrySource.drawRange.count);
 geometry.groups=Array.isArray(mesh.material)?mesh.geometry.groups.map(group=>({...group})):[];
 const material=Array.isArray(mesh.material)?mesh.material.slice():mesh.material;
 let source:Mesh;
 if((mesh as InstancedMesh).isInstancedMesh){
  const instances=new InstancedMesh(geometry,material,0),original=mesh as InstancedMesh;
  instances.count=original.count;instances.instanceMatrix=original.instanceMatrix.clone() as InstancedBufferAttribute;source=instances;
 }else source=new Mesh(geometry,material);
 source.morphTargetInfluences=mesh.morphTargetInfluences?.slice();
 return source;
}

/** Called after eager extraction has validated the current triangle source. */
export function cameraMeshLocalBounds(mesh:Mesh):Box3 {
 const geometry=mesh.geometry,position=geometry.getAttribute('position'),index=geometry.getIndex();
 const end=Math.min(index?.count??position.count,geometry.drawRange.start+geometry.drawRange.count);
 const bounds=new Box3(),point=new Vector3();
 for(let n=geometry.drawRange.start;n<end;n++)bounds.expandByPoint(point.fromBufferAttribute(position,index?index.getX(n):n));
 if(!(mesh as InstancedMesh).isInstancedMesh)return bounds;
 const instances=mesh as InstancedMesh,combined=new Box3(),matrix=new Matrix4(),part=new Box3();
 for(let n=0;n<instances.count;n++){instances.getMatrixAt(n,matrix);combined.union(part.copy(bounds).applyMatrix4(matrix));}
 return combined;
}

/** Detached extraction shell: querying a published pose must not rewrite live descendants. */
export function cameraMeshAtMatrix(mesh:Mesh,matrix:Matrix4):Mesh {
 let sampled:Mesh;
 if((mesh as InstancedMesh).isInstancedMesh){
  const source=mesh as InstancedMesh,instances=new InstancedMesh(mesh.geometry,mesh.material,0);
  instances.count=source.count;instances.instanceMatrix=source.instanceMatrix;sampled=instances;
 }else sampled=new Mesh(mesh.geometry,mesh.material);
 sampled.morphTargetInfluences=mesh.morphTargetInfluences;
 sampled.matrixAutoUpdate=false;sampled.matrixWorldAutoUpdate=false;sampled.matrixWorld.copy(matrix);
 return sampled;
}

/** Broad-phase bounds include baking roundoff and retained-shape quantization. */
export function cameraMeshWorldBounds(local:Box3,matrix:Matrix4,target:Box3):boolean {
 target.copy(local).applyMatrix4(matrix);
 if(local.isEmpty())return true;
 const e=matrix.elements;
 if(!e.every(Number.isFinite)||Math.abs(matrix.determinant())<1e-12)return false;
 const magnitude=Math.max(Math.abs(local.min.x),Math.abs(local.min.y),Math.abs(local.min.z),Math.abs(local.max.x),Math.abs(local.max.y),Math.abs(local.max.z));
 const scale=Math.max(Math.abs(e[0]!)+Math.abs(e[4]!)+Math.abs(e[8]!),Math.abs(e[1]!)+Math.abs(e[5]!)+Math.abs(e[9]!),Math.abs(e[2]!)+Math.abs(e[6]!)+Math.abs(e[10]!));
 // Equal 1e-8-quantized shape matrices can differ by <1e-8 per element.
 // Three coordinates and an orthogonal rigid-frame rotation bound that error
 // by sqrt(3)*3e-8*magnitude; 8e-8 also leaves room for rounding at ties.
 target.expandByScalar(1e-6+8e-8*magnitude+8*2**-23*magnitude*scale);
 return [...target.min.toArray(),...target.max.toArray()].every(Number.isFinite);
}
