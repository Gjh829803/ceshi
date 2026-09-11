/** Register the maintained flying-creature bytes and measured bindings; never re-export models. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {humanoid} from '@worldkit/three';
import type {DragonVariant} from '../../shared/preset-content/dragon-variants';
import {readCatalogSources,writeCatalogSources,syncAssetCatalog} from '../three-creator/catalog-sources';

const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sourceDirectory='assets/dragon-training/__creature-assets';

export async function flyingCreatureCatalogEntries(root=repositoryRoot){
  const variants=JSON.parse(await readFile(path.join(root,sourceDirectory,'variants.json'),'utf8')) as DragonVariant[];
  async function resource(logicalPath:string,sourcePath:string){
    const bytes=await readFile(path.join(root,sourcePath)),sha256=createHash('sha256').update(bytes).digest('hex');
    return {path:logicalPath,uri:`./assets/resources/${sha256}${path.extname(sourcePath)}`,sha256,byteLength:bytes.length,sourcePath};
  }
  const flame=await resource('flying-creatures/flame.png',`${sourceDirectory}/FireGenLoop01_8x8.png`);
  const notices=await resource('flying-creatures/README.md','assets/dragon-training/README.md');
  const traces=await Promise.all(['variants.json','variant-sources.json','ground-sources.json','manifest.json'].map(file=>resource(`flying-creatures/${file}`,`${sourceDirectory}/${file}`)));
  return Promise.all(variants.map(async variant=>{
    const id=`creature.dragon.${variant.id.toLowerCase()}`;
    const model=await resource(`flying-creatures/${variant.id}/model.glb`,`${sourceDirectory}/${variant.file}`);
    const spec={...humanoid.createFlyingCreatureSpec(id),name:variant.name,camera:variant.camera,
      ...(variant.seat?{seat:structuredClone(variant.seat)}:{}),
      ...(variant.envelope?{envelope:structuredClone(variant.envelope)}:{}),
      ...(variant.collisionProbes?{flyingCreatureCollision:structuredClone(variant.collisionProbes)}:{}),
      ...(variant.ground?{flyingCreatureGround:structuredClone(variant.ground)}:{})};
    return {id,displayName:`${variant.name} / Flying dragon`,...model,uri:`./assets/subjects/${model.sha256}.glb`,usage:'reusable',
      rootTransform:{positionMetersXYZ:[0,0,0],rotationEulerRadiansXYZ:[0,0,0],scaleXYZ:[1,1,1]},actions:{},
      resources:[model,flame,notices,...traces],vehicle:{schemaVersion:1,spec},collision:spec.envelope,
      locomotionBindingIds:['locomotion.dragon'],
      provenance:{source:`Local Century ${variant.id} extraction`,variantId:variant.id,registeredWithoutChangingAssetBytes:true,
        registrationScript:'scripts/assets/register-flying-creatures.ts',noticesResource:notices.path,
        sourceRecords:traces.map(trace=>trace.path)},
      limitations:[
        'Ground support is stationary on sufficiently wide, flat, dry surfaces; no ground walking, foot terrain IK, slope perching or airborne dismount.',
        'Collision uses measured body, neck and head core probes; wing tips, tail tips and fur may overlap obstacles.',
        'Flame is visual feedback only; no damage, combat resolution or audio. Original game material graphs and cloth/fur simulation are not reproduced.',
      ],
      integrationMetadata:{classification:'flying-mount',exampleTopic:'mounted-interaction',exampleVariant:'flying-creature',documentation:'assets/animals/flying-mounts.md',requiredAssetIds:['humanoid.source-101',id],
        visual:{animationPrefix:variant.id,modelResource:model.path,flameResource:flame.path},
        useWhen:`使用 ${variant.id} 飞龙及其实际骨架、飞行、落地和骑乘能力；编号不代表已确认的官方龙名。`,
        binding:'Load humanoid.FlyingCreatureVisual using visual resources and animationPrefix; pass its root and flyingVisual with this vehicle.spec. The SDK owns its mixer and fixed simulation tick; do not start another animation loop or use generic asset action playback.',
        capabilities:['Flight, boost, glide, brake hover, dodge and flame visual feedback.','Landing, takeoff and Source101 rope-ladder mount/dismount after ground support and clearance checks.','SDK summon navigation with actual flight/landing outcomes; observe summon and ground phases for completion.'],
      },
    };
  }));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const entries=await flyingCreatureCatalogEntries();
  if(process.argv.includes('--check')){
    const sources=await readCatalogSources(repositoryRoot);
    for(const entry of entries)if(JSON.stringify(sources.find(source=>source.id===entry.id))!==JSON.stringify(entry))throw new Error(`FLYING_CREATURE_CATALOG_DRIFT: ${entry.id}`);
    await syncAssetCatalog(repositoryRoot,true);
  }else{
    await writeCatalogSources(repositoryRoot,entries);
    await syncAssetCatalog(repositoryRoot);
  }
  console.log(JSON.stringify({assets:entries.map(entry=>entry.id),mode:process.argv.includes('--check')?'verified':'registered'}));
}
