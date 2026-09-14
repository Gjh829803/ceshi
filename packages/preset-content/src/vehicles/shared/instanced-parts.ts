import {InstancedMesh,type BufferGeometry,type Material,type Matrix4} from 'three';

/** Fixed local parts; animate their parent instead of rewriting instance buffers. */
export function createInstancedParts(geometry:BufferGeometry,material:Material,transforms:readonly Matrix4[]):InstancedMesh {
 const mesh=new InstancedMesh(geometry,material,transforms.length);
 transforms.forEach((transform,index)=>mesh.setMatrixAt(index,transform));
 mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
 // Existing model owners release geometry. Release the instance GPU buffers too.
 const release=()=>mesh.dispose();
 geometry.addEventListener('dispose',release);
 mesh.addEventListener('dispose',()=>geometry.removeEventListener('dispose',release));
 return mesh;
}
