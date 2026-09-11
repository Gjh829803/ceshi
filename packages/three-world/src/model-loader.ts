import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ModelLoadOptions} from './contracts.js';
export type {ModelLoadOptions} from './contracts.js';

/** Whitebox loading retains material factors and vertex colors without decoding images. */
export function resolveLoadTextures(options:ModelLoadOptions={},defaultValue=false):boolean{
  if(options.loadTextures!==undefined&&typeof options.loadTextures!=='boolean')throw new Error('MODEL_LOAD_TEXTURES_INVALID');
  return options.loadTextures??defaultValue;
}

/** Browser windows and image-decoding workers can retain the supplied appearance. */
export function supportsModelTextureDecoding():boolean{
  return typeof self!=='undefined'&&(typeof document!=='undefined'||typeof createImageBitmap==='function');
}

/** Per-loader policy: no global Three patches, asset mutation or post-load texture removal. */
export function createModelLoader(options:ModelLoadOptions={}):GLTFLoader{
  const loadTextures=resolveLoadTextures(options);
  return new GLTFLoader().register(parser=>({
    name:'worldkit-model-textures',
    beforeRoot(){
      const assign=parser.assignTexture.bind(parser);
      parser.assignTexture=(...args)=>{
        if(!loadTextures)return Promise.resolve(null);
        if(!supportsModelTextureDecoding()){
          return Promise.reject(new Error('MODEL_TEXTURE_DECODER_UNAVAILABLE: Enable model textures in a host with browser image decoding APIs.'));
        }
        return assign(...args);
      };
      return null;
    },
  }));
}
