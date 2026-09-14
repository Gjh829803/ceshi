import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ThreeCompiler,hashTree} from '@worldkit/creator-host/compiler';
import {prepareEpisodeSource,loadEpisodeSource} from '../../src/source/source.js';
import {openEpisodeBrowser} from '../../src/capture/browser.js';
import {installEpisodePresentation} from '../../src/reporting/presentation.js';
const sha=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
it('preserves the delivered runtime and hides dynamic UI for capture',async()=>{
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'episode-adapter-')));
 try{
  const author=path.join(root,'author');await mkdir(author);
  await writeFile(path.join(author,'index.html'),'<html><head></head><body><div id="container"><canvas id="world"></canvas><div id="hud" style="position:fixed;inset:0;background:red">HUD</div></div><canvas id="ui-canvas"></canvas><script type="module" src="./main.js"></script></body></html>');
  await writeFile(path.join(author,'main.js'),`import * as THREE from 'three';import {createWorld} from '@worldkit/three';
const scene=new THREE.Scene();scene.background=new THREE.Color('#193148');const camera=new THREE.PerspectiveCamera(50,16/9,.1,300);camera.position.set(3,4,7);camera.lookAt(0,1,0);
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#world')});renderer.setSize(320,180);
const world=await createWorld({scene,camera,renderer,navigation:false,assetDefinitions:{}});
const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80,20,20),new THREE.MeshBasicMaterial({color:'#73664e'}));floor.rotation.x=-Math.PI/2;world.addEntity({id:'floor',object:floor,role:'terrain'});
const actor=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(.5,1.8,.5),new THREE.MeshBasicMaterial({color:'#00ccff'}));mesh.position.y=.9;actor.add(mesh);world.addCharacter({id:'traveler',object:actor,body:{heightMeters:1.8,radiusMeters:.3}});world.setControlledEntity('traveler');world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'traveler'},activation:'on-input',views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'preserve-opening'},position:{subjectTranslationHalfLifeSeconds:.045},lens:{nearMeters:.1,farMeters:300},constraints:{visibility:'require-line-of-sight'}}}}}});await world.start();`);
  const compiler=new ThreeCompiler(author,'three-sdk'),candidate=await compiler.prepare();
  await mkdir(path.join(candidate.root,'captures'));
  const image=await sharp({create:{width:2,height:2,channels:3,background:'#193148'}}).png().toBuffer();
  await writeFile(path.join(candidate.root,'captures/opening.png'),image);
  const captures={selectionPolicy:'important-representatives-v1',conditioningEntityIds:['player'],images:[{view:'opening',image:{path:'opening.png',sha256:sha(image)}},{view:'entity-triview',entityIds:['player'],orientationTargetId:'traveler',image:{path:'opening.png',sha256:sha(image)}},{view:'entity-triview',entityIds:['extra'],orientationTargetId:'extra',image:{path:'opening.png',sha256:sha(image)}}]};
  await writeFile(path.join(candidate.root,'captures/captures.json'),JSON.stringify(captures));
  const files=await hashTree(candidate.root);
  await writeFile(path.join(candidate.root,'delivery.json'),JSON.stringify({kind:'three-creator-delivery',schemaVersion:1,profile:'three-sdk',status:'ready-for-independent-review',technicalStatus:'passed',sourceHash:candidate.sourceHash,worldBuildHash:candidate.worldBuildHash,runtimeHash:candidate.runtimeHash,runtimeSourceHash:candidate.runtimeSourceHash,assetPolicySha256:candidate.assetPolicySha256,files}));
  const source=await prepareEpisodeSource({payloadRoot:candidate.root,outputRoot:path.join(root,'derived'),worldId:'fixture',referenceImage:{path:path.join(candidate.root,'captures/opening.png'),sha256:sha(image)}});
  expect(source.sourceFiles).toEqual(await hashTree(candidate.sourceRoot));
  expect(await loadEpisodeSource(path.join(root,'derived/source.json'))).toEqual(source);
  const derivation=JSON.parse(await readFile(path.join(root,'derived/derivation.json'),'utf8'));
  expect(source.runtimeHash).toBe(candidate.runtimeHash);expect(derivation.authorCompiledEntriesUnchanged).toBe(true);
  expect(source.targets).toHaveLength(1);expect(source.targets[0]).toMatchObject({id:'traveler',role:'primary-subject'});expect(source.referenceImage?.sha256).toBe(sha(image));
  const sdk=await readFile(path.join(source.playableRoot,'runtime/worldkit-three.js'),'utf8');expect(sdk).toContain('subjectTranslationHalfLifeSeconds');expect(sdk).toContain('prepareSegment');expect(sdk).toBe(await readFile(path.join(candidate.playableRoot,'runtime/worldkit-three.js'),'utf8'));
  const session=await openEpisodeBrowser({playableRoot:source.playableRoot,widthPixels:320,heightPixels:180});
  try{
   await session.page.waitForSelector('canvas[data-worldkit-episode-surface]',{state:'visible'});
   const visibility=await session.page.evaluate(()=>{
    const late=document.createElement('div');late.textContent='late notification';document.body.append(late);
    return ['world','hud','ui-canvas'].map(id=>getComputedStyle(document.getElementById(id)!).visibility).concat(getComputedStyle(late).visibility);
   });expect(visibility).toEqual(['visible','hidden','hidden','hidden']);
   const start={positionWorldMetersXYZ:[5,0,0] as [number,number,number],facingYawRadians:.7};
   const prepared=await session.prepareSegment(start,{widthPixels:320,heightPixels:180});expect(prepared.isRunning).toBe(false);
   const next=await session.advance({moveZRatio:-1},3);expect(next.simulationTick-prepared.simulationTick).toBe(3);
   const frame=await session.frame('image/png');expect(frame.captureSurface).toBe('world-renderer-canvas');expect(session.errors).toEqual([]);
   const screenshot=await session.page.screenshot();const pixels=await sharp(screenshot).removeAlpha().raw().toBuffer();let red=0;
   for(let i=0;i<pixels.length;i+=3)if(pixels[i]!>230&&pixels[i+1]!<20&&pixels[i+2]!<20)red++;
   expect(red).toBe(0);await session.release();
  }finally{await session.close();}
  await expect(prepareEpisodeSource({payloadRoot:candidate.root,outputRoot:path.join(root,'derived'),worldId:'fixture'})).rejects.toThrow('SOURCE_OUTPUT_NOT_EMPTY');
  expect(await readFile(path.join(candidate.playableRoot,'index.html'),'utf8')).not.toContain('data-worldkit-episode-presentation');
  await expect(installEpisodePresentation(source.playableRoot)).rejects.toThrow('ALREADY_INSTALLED');
 }finally{await rm(root,{recursive:true,force:true});}
},60_000);
