/** 将用户 UEFN 蒙皮离线变换到现有 Source101 绑定姿态，保留运行时骨架和动作契约。 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Matrix3,Matrix4,Quaternion,Vector3} from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/assets/bind-uefn-mannequin.mjs converted.glb');
const source='assets/three-creator/presets/humanoid/source/gasp-research/climb-2m5.experimental.glb';
const output='assets/three-creator/presets/humanoid/source/uefn-mannequin-lod1.glb';
const hash=b=>createHash('sha256').update(b).digest('hex');
function glb(file){const bytes=fs.readFileSync(file),n=bytes.readUInt32LE(12);return {bytes,json:JSON.parse(bytes.subarray(20,20+n)),bin:bytes.subarray(28+n)};}
globalThis.ProgressEvent=class{};
async function parse({json,bin}){const j=structuredClone(json);delete j.images;delete j.textures;for(const m of j.materials??[])for(const k of Object.keys(m))if(k!=='name')delete m[k];j.buffers=[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}];return new GLTFLoader().parseAsync(JSON.stringify(j),'');}
const old=glb(path.join(root,source)),incoming=glb(input),target=await parse(old),model=await parse(incoming);
let targetMesh,newMesh;target.scene.traverse(o=>{if(o.isSkinnedMesh)targetMesh??=o});model.scene.traverse(o=>{if(o.isSkinnedMesh){if(newMesh)throw new Error('Expected one incoming skinned mesh');newMesh=o}});
targetMesh.skeleton.pose();target.scene.getObjectByName('GASP_DirectFK_Research').position.set(0,0,0);target.scene.updateMatrixWorld(true);
newMesh.skeleton.pose();model.scene.updateMatrixWorld(true);
// 导出 FBX 含双层厘米缩放，按相同骨盆高度恢复米制；只允许接近 1/100/0.01 的单位换算。
const unit=target.scene.getObjectByName('pelvis').getWorldPosition(new Vector3()).y/model.scene.getObjectByName('pelvis').getWorldPosition(new Vector3()).y;
const unitScale=[.01,1,100].find(v=>Math.abs(unit/v-1)<.001);if(!unitScale)throw new Error('Unexpected skeleton scale '+unit);
model.scene.scale.multiplyScalar(unitScale);model.scene.updateMatrixWorld(true);
const bones=targetMesh.skeleton.bones,names=new Map(bones.map((b,i)=>[b.name,i]));
// FBX/Blender 的骨骼局部轴与原始 GASP 不同，不能把局部基底差误当成肢体旋转。
// 以解剖关节方向对齐 A-pose，蒙皮随后使用未修改的目标逆绑定矩阵。
const preferred={pelvis:'spine_01',spine_05:'neck_01',upperarm_l:'lowerarm_l',upperarm_r:'lowerarm_r',lowerarm_l:'hand_l',lowerarm_r:'hand_r',hand_l:'middle_01_l',hand_r:'middle_01_r',thigh_l:'calf_l',thigh_r:'calf_r',calf_l:'foot_l',calf_r:'foot_r',foot_l:'ball_l',foot_r:'ball_r'};
const rotations=new Map();
function alignment(b){if(rotations.has(b.name))return rotations.get(b.name);const dest=target.scene.getObjectByName(b.name);if(!dest)throw new Error('Unmapped weighted bone '+b.name);const child=preferred[b.name]?model.scene.getObjectByName(preferred[b.name]):b.children.find(c=>c.isBone&&names.has(c.name)&&c.position.length()>.0001);let q=new Quaternion();if(child){const a=child.getWorldPosition(new Vector3()).sub(b.getWorldPosition(new Vector3())),d=target.scene.getObjectByName(child.name).getWorldPosition(new Vector3()).sub(dest.getWorldPosition(new Vector3()));if(a.length()>.0001&&d.length()>.0001)q.setFromUnitVectors(a.normalize(),d.normalize());}else if(b.parent?.isBone)q=alignment(b.parent).clone();rotations.set(b.name,q);return q;}
const transforms=newMesh.skeleton.bones.map(b=>{const i=names.get(b.name);if(i===undefined)throw new Error('Unmapped weighted bone '+b.name);const q=alignment(b),translation=bones[i].getWorldPosition(new Vector3()).sub(b.getWorldPosition(new Vector3()).applyQuaternion(q));return new Matrix4().compose(translation,q,new Vector3(1,1,1)).multiply(newMesh.matrixWorld)});
const normalTransforms=transforms.map(m=>new Matrix3().getNormalMatrix(m));
const p=newMesh.geometry.getAttribute('position'),n=newMesh.geometry.getAttribute('normal'),joints=newMesh.geometry.getAttribute('skinIndex'),weights=newMesh.geometry.getAttribute('skinWeight');
const positions=[],normals=[],indices=[],skinWeights=[];
for(let i=0;i<p.count;i++){
 const point=new Vector3(),normal=new Vector3();let sum=0;
 for(let k=0;k<4;k++){
  const j=joints.getComponent(i,k),w=weights.getComponent(i,k);sum+=w;
  point.addScaledVector(new Vector3().fromBufferAttribute(p,i).applyMatrix4(transforms[j]),w);
  normal.addScaledVector(new Vector3().fromBufferAttribute(n,i).applyMatrix3(normalTransforms[j]),w);
  indices.push(names.get(newMesh.skeleton.bones[j].name));skinWeights.push(w);
 }
 if(Math.abs(sum-1)>.001)throw new Error('Invalid weights');positions.push(...point.toArray());normals.push(...normal.normalize().toArray());
}
const document=structuredClone(incoming.json);delete document.animations;
// FBX 将实体外壳材质导出成 BLEND，Three 随之关闭深度写入，关节被后方外壳覆盖。
// 此人物的颜色贴图和顶点 alpha 均为 1，材质契约为不透明实体。
for(const material of document.materials??[]){material.alphaMode='OPAQUE';delete material.alphaCutoff;}
document.nodes=structuredClone(old.json.nodes);document.scenes=structuredClone(old.json.scenes);document.scene=old.json.scene??0;document.skins=structuredClone(old.json.skins);
const binary=[incoming.bin];let length=incoming.bin.length;
function append(array,Type,type){const typed=new Type(array),bytes=Buffer.from(typed.buffer),padding=(4-length%4)%4;if(padding){binary.push(Buffer.alloc(padding));length+=padding}const view=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});binary.push(bytes);length+=bytes.length;const index=document.accessors.length,width={VEC3:3,VEC4:4,MAT4:16}[type];const a={bufferView:view,componentType:Type===Float32Array?5126:5123,count:array.length/width,type};if(type==='VEC3'){a.min=[0,1,2].map(k=>Math.min(...array.filter((_,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...array.filter((_,i)=>i%3===k)))}document.accessors.push(a);return index;}
const primitive=document.meshes[0].primitives[0];primitive.attributes.POSITION=append(positions,Float32Array,'VEC3');primitive.attributes.NORMAL=append(normals,Float32Array,'VEC3');delete primitive.attributes.TANGENT;
primitive.attributes.JOINTS_0=append(indices,Uint16Array,'VEC4');primitive.attributes.WEIGHTS_0=append(skinWeights,Float32Array,'VEC4');
document.meshes=[document.meshes[0]];document.meshes[0].name='UEFN_Mannequin_BlackJoints_LOD1_Medium';
let meshAssigned=false;
for(const node of document.nodes){
 if(node.mesh!==undefined){if(meshAssigned){delete node.mesh;delete node.skin;continue}meshAssigned=true;node.mesh=0;node.skin=0;node.name='UEFN_Mannequin_BlackJoints_LOD1_Medium';node.translation=[0,0,0];node.rotation=[0,0,0,1];node.scale=[1,1,1];delete node.matrix;}
 else {const actual=target.scene.getObjectByName(node.name);if(actual){node.translation=actual.position.toArray();node.rotation=actual.quaternion.toArray();node.scale=actual.scale.toArray();delete node.matrix;}}
}
for(const skin of document.skins){skin.inverseBindMatrices=append(skin.joints.flatMap(index=>target.scene.getObjectByName(document.nodes[index].name).matrixWorld.clone().invert().toArray()),Float32Array,'MAT4');}
document.buffers=[{byteLength:length}];document.asset.generator='WorldKit UEFN LOD1 skin binding v1';
const encoded=Buffer.from(JSON.stringify(document)),jsonPadding=Buffer.alloc((4-encoded.length%4)%4,32),bin=Buffer.concat(binary),binPadding=Buffer.alloc((4-bin.length%4)%4);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+encoded.length+jsonPadding.length+bin.length+binPadding.length,8);header.writeUInt32LE(encoded.length+jsonPadding.length,12);header.writeUInt32LE(0x4e4f534a,16);const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length+binPadding.length);binHeader.writeUInt32LE(0x004e4942,4);
const result=Buffer.concat([header,encoded,jsonPadding,binHeader,bin,binPadding]);fs.writeFileSync(path.join(root,output),result);
console.log(JSON.stringify({output,sha256:hash(result),sourceRigSha256:hash(old.bytes),convertedInputSha256:hash(incoming.bytes),unitScale,vertices:p.count,triangles:newMesh.geometry.index.count/3,bones:bones.length}));
