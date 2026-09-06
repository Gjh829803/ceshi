import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {sha256} from './contracts.js';

// Codex may flatten/truncate an oversized MCP response to text. Keep three
// simultaneous preview images plus diagnostics comfortably below one MiB.
export const PREVIEW_IMAGE_MAXIMUM_BYTES=128*1024;
export const PREVIEW_RESPONSE_MAXIMUM_BYTES=900*1024;
export async function boundedPreviewPng(bytes:Buffer):Promise<Buffer> {
  if(bytes.length<=PREVIEW_IMAGE_MAXIMUM_BYTES)return bytes;
  for(let size=960;size>=120;size=Math.floor(size*.75)) {
    const encoded=await sharp(bytes,{limitInputPixels:32*1024*1024})
      .resize({width:size,height:size,fit:'inside',withoutEnlargement:true})
      .png({palette:true,colours:256,compressionLevel:9,effort:7}).toBuffer();
    if(encoded.length<=PREVIEW_IMAGE_MAXIMUM_BYTES)return encoded;
  }
  throw new Error('THREE_PREVIEW_IMAGE_TOO_LARGE');
}
export async function boundedPreviewFile(image:{path:string;sha256:string;byteLength:number}) {
  const bytes=await readFile(image.path);
  if(sha256(bytes)!==image.sha256)throw new Error('THREE_IMAGE_CHANGED');
  const bounded=await boundedPreviewPng(bytes);
  if(bounded===bytes)return image;
  const file=image.path.replace(/\.png$/,'.transport.png');
  if(file===image.path)throw new Error('THREE_PREVIEW_IMAGE_FORMAT_INVALID');
  await writeFile(file,bounded);
  return {path:file,sha256:sha256(bounded),byteLength:bounded.length,sourceImage:image,
    encoding:'bounded-preview-png',note:'Preview-only scaling/color quantization; original capture and playable remain unchanged.'};
}
