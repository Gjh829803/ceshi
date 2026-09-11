import {Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** 几何回归保留真实蒙皮、材质和动作，只替代 Node 环境缺少的图片解码；贴图另由浏览器验收。 */
export function fixtureTextureLoader(loader:GLTFLoader):GLTFLoader {
  return loader.register(()=>({name:'fixture-texture-decoding',loadTexture:async()=>new Texture()}));
}
export function parseFixtureGlb(bytes:Uint8Array){
  return fixtureTextureLoader(new GLTFLoader()).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'');
}
