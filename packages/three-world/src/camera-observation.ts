import {Matrix4,Quaternion,Vector3,type Camera,type Object3D} from 'three';

/** Read live transform channels without refreshing the camera/ancestor matrix caches. */
export function readCameraWorldPose(camera:Camera) {
 const chain:Object3D[]=[];
 for(let object:Object3D|null=camera;object;object=object.parent)chain.push(object);
 const matrix=new Matrix4(),local=new Matrix4();
 for(let i=chain.length-1;i>=0;i--){
  const object=chain[i]!;
  if(!object.matrixWorldAutoUpdate){matrix.copy(object.matrixWorld);continue;}
  matrix.multiply(object.matrixAutoUpdate?local.compose(object.position,object.quaternion,object.scale):object.matrix);
 }
 const position=new Vector3(),rotation=new Quaternion();matrix.decompose(position,rotation,new Vector3());
 return {position,rotation,direction:new Vector3().setFromMatrixColumn(matrix,2).normalize().negate()};
}
