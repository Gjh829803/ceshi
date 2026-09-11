import {Color,Mesh,MeshStandardMaterial,type Material,type Object3D,type Texture} from 'three';

/** Instance-local whitebox color. No identity or gameplay meaning is assigned by the SDK. */
export interface ObjectColorBinding {
 readonly color:string;
 /** sRGB #RRGGBB, chosen by the author. */
 setColor(color:string):void;
 /** Restore original materials and release only the binding's materials. Idempotent. */
 dispose():void;
}

export function validateObjectColor(color:string):string {
 if(typeof color!=='string'||!/^#[\da-f]{6}$/i.test(color))throw new Error('OBJECT_COLOR_INVALID: Use an sRGB #RRGGBB color.');
 return color.toLowerCase();
}

const bindings=new WeakMap<Object3D,ObjectColorBinding>();
const meshOwners=new WeakMap<Mesh,Object3D>();
type ColorMaterial=Material&{color:Color;map?:Texture|null;alphaMap?:Texture|null;vertexColors?:boolean};

/** Color the current Mesh/SkinnedMesh descendants without changing geometry, textures or other instances.
 * Call after loading, before attaching independently colored objects. Later children are not recolored.
 * Repeated calls for the same root update its binding. Dispose it before disposing the source model.
 * Built-in color materials are supported; custom shader materials require author-owned shading. */
export function setObjectColor(root:Object3D,color:string):ObjectColorBinding {
 let value=validateObjectColor(color);
 const existing=bindings.get(root);if(existing){existing.setColor(value);return existing;}
 const meshes:Mesh[]=[];
 root.traverse(node=>{if(node instanceof Mesh)meshes.push(node);});
 if(!meshes.length)throw new Error('OBJECT_COLOR_EMPTY: Load the complete visual model first.');
 for(const mesh of meshes){
  if(meshOwners.has(mesh))throw new Error('OBJECT_COLOR_OVERLAP: Choose disjoint visual roots.');
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   const isShaderMaterial=(material as Material&{isShaderMaterial?:boolean}).isShaderMaterial;
   const hasColor=(material as ColorMaterial).color instanceof Color;
   if(isShaderMaterial||!hasColor)
    throw new Error('OBJECT_COLOR_MATERIAL_UNSUPPORTED: Custom shaders need author-owned coloring.');
  }
 }
 const materials=new Map<Material,MeshStandardMaterial>();
 const records:{mesh:Mesh;original:Material|Material[];installed:Material|Material[]}[]=[];
 try{
  const tint=(source:Material)=>{
   const previous=materials.get(source);if(previous)return previous;
   const original=source as ColorMaterial;
   const material=new MeshStandardMaterial({color:value,roughness:1,metalness:0,
    map:original.map??null,alphaMap:original.alphaMap??null,vertexColors:original.vertexColors??false,
    opacity:source.opacity,transparent:source.transparent,alphaTest:source.alphaTest,
    alphaHash:source.alphaHash,alphaToCoverage:source.alphaToCoverage,
    visible:source.visible,colorWrite:source.colorWrite,
    clippingPlanes:source.clippingPlanes,clipIntersection:source.clipIntersection,clipShadows:source.clipShadows,
    side:source.side,depthWrite:source.depthWrite,depthTest:source.depthTest,depthFunc:source.depthFunc});
   // Keep texture/vertex alpha for silhouettes, but never multiply their RGB into the chosen color.
   material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace(
    '#include <color_fragment>','#include <color_fragment>\n\tdiffuseColor.rgb = diffuse;');};
   material.customProgramCacheKey=()=> 'worldkit-object-color-v1';
   materials.set(source,material);return material;
  };
  for(const mesh of meshes){
   const original=mesh.material,installed=Array.isArray(original)?original.map(tint):tint(original);
   records.push({mesh,original,installed});
  }
 }catch(error){for(const material of materials.values())material.dispose();throw error;}
 for(const {mesh,installed} of records){mesh.material=installed;meshOwners.set(mesh,root);}
 let disposed=false;
 const binding:ObjectColorBinding={
  get color(){return value;},
  setColor(next:string){
   if(disposed)throw new Error('OBJECT_COLOR_DISPOSED');
   value=validateObjectColor(next);for(const material of materials.values())material.color.set(value);
  },
  dispose(){
   if(disposed)return;disposed=true;bindings.delete(root);
   for(const {mesh,original,installed} of records){if(mesh.material===installed)mesh.material=original;meshOwners.delete(mesh);}
   const failures:unknown[]=[];
   for(const material of materials.values())try{material.dispose();}catch(error){failures.push(error);}
   if(failures.length)throw new AggregateError(failures,'OBJECT_COLOR_CLEANUP_FAILED');
  },
 };
 bindings.set(root,binding);return binding;
}
