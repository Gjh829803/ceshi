import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {ThreeCreatorTools} from './tools.js';
import {toolContent,executeThreeCreatorTool} from './mcp.js';
import {boundedPreviewFile,boundedPreviewPng,PREVIEW_RESPONSE_MAXIMUM_BYTES} from './preview-images.js';
import {sha256} from './contracts.js';
const roots:string[]=[];
async function service(){const root=await mkdtemp(path.join(os.tmpdir(),'selected-creator-'));roots.push(root);return new ThreeCreatorTools(root,'three-sdk');}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});

it('finds reusable human motion in a descriptive query without negative limitation matches',async()=>{
 const tools=await service();try{
  expect((await tools.assets('hiker human backpack mountain rock')).assets.map(x=>x.id)).toContain('humanoid.g-bot');
  expect((await tools.assets('G Bot')).assets[0]?.id).toBe('humanoid.g-bot');
  expect((await tools.assets('fox')).assets).toEqual([]);
  expect((await tools.assets('', 'humanoid.g-bot')).assets.map(x=>x.id)).toEqual(['humanoid.g-bot']);
 }finally{await tools.close();}
});
it('returns one actual bounded image while preserving the original noisy capture bytes and identity',async()=>{
 const tools=await service();try{
  const pixels=Buffer.alloc(1280*720*3);let seed=123456;
  for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>24;}
  const original=await sharp(pixels,{raw:{width:1280,height:720,channels:3}}).png().toBuffer();
  expect(original.length).toBeGreaterThan(2*1024*1024);
  await mkdir(tools.evidenceRoot,{recursive:true});const file=path.join(tools.evidenceRoot,'capture.png');await writeFile(file,original);
  const sourceImage={path:file,sha256:sha256(original),byteLength:original.length};
  const image=await boundedPreviewFile(sourceImage);
  const content=await toolContent(tools,{status:'succeeded',result:{view:'opening',image}});
  expect(Buffer.byteLength(JSON.stringify({content}))).toBeLessThan(PREVIEW_RESPONSE_MAXIMUM_BYTES);
  const blocks=content.filter(x=>x.type==='image');expect(blocks).toHaveLength(1);
  const bytes=Buffer.from(blocks[0].data,'base64');expect(bytes.length).toBeLessThanOrEqual(128*1024);
  expect(sha256(bytes)).toBe(image.sha256);expect(await readFile(file)).toEqual(original);
  const metadata=await sharp(bytes).metadata();expect(metadata.width!/metadata.height!).toBeCloseTo(1280/720,1);
  expect(JSON.parse(content[0].text).result.image.sourceImage).toEqual(sourceImage);
  await writeFile(image.path,'changed');await expect(toolContent(tools,{image})).rejects.toThrow('THREE_IMAGE_CHANGED');
 }finally{await tools.close();}
},30000);
it('does not encode an already-small PNG or allow an oversized text response to silently hide an image',async()=>{
 const tools=await service();try{
  const png=await sharp({create:{width:2,height:2,channels:3,background:'#112233'}}).png().toBuffer();
  expect(await boundedPreviewPng(png)).toBe(png);
  await expect(toolContent(tools,{text:'x'.repeat(PREVIEW_RESPONSE_MAXIMUM_BYTES)})).rejects.toThrow('THREE_PREVIEW_RESPONSE_TOO_LARGE');
 }finally{await tools.close();}
});
it('keeps default five capture selection and explicit extra captures as distinct tool requests',async()=>{
 const calls:boolean[]=[];const fake={start:(_type:string,run:()=>unknown)=>run(),triviews:(all:boolean)=>calls.push(all)} as unknown as ThreeCreatorTools;
 await executeThreeCreatorTool(fake,'world_capture_triviews',{});
 await executeThreeCreatorTool(fake,'world_capture_triviews',{includeAdditionalTargets:true});
 expect(calls).toEqual([false,true]);
});
it('rejects a group of targets for a single-object sheet before opening a browser',async()=>{
 let started=false;const fake={start:()=>{started=true;}} as unknown as ThreeCreatorTools;
 await expect(executeThreeCreatorTool(fake,'world_preview',{view:'entity-triview',entityIds:['hero','tower']})).rejects.toThrow('THREE_TOOL_INPUT_INVALID');
 expect(started).toBe(false);
 await executeThreeCreatorTool(fake,'world_preview',{view:'top-down',entityIds:['hero','tower']});expect(started).toBe(true);
});
