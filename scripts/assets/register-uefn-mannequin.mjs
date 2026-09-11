/** 更新人物资源闭包；保留其他资产及原始动画文件。 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const manifestPath='assets/three-creator/presets/humanoid/source/manifest.json';
const manifest=read(manifestPath);manifest.model='uefn-mannequin-lod1.glb';write(manifestPath,manifest);
const catalogPath='assets/three-creator/asset-catalog.json',importsPath='assets/three-creator/presets/import-manifest.json';
const catalog=read(catalogPath),imports=read(importsPath),character=catalog.assets.find(a=>a.id==='humanoid.source-101');
for(const logical of ['humanoid/source/manifest.json','humanoid/source/uefn-mannequin-lod1.glb']){
 const sourcePath='assets/three-creator/presets/'+logical,bytes=fs.readFileSync(path.join(root,sourcePath)),sha256=createHash('sha256').update(bytes).digest('hex');
 const resource={path:logical,uri:`./assets/resources/${sha256}${path.extname(logical)}`,sha256,byteLength:bytes.length,sourcePath};
 for(const owner of [character,imports]){const index=owner.resources.findIndex(r=>r.path===logical);if(index<0)owner.resources.push(resource);else owner.resources[index]=resource;}
}
character.displayName='UEFN 白色人形 / 黑色关节 / LOD1 / 48 动作';
character.provenance={...character.provenance,importedWithoutChangingAssetBytes:false,modelModification:'User-supplied UEFN BlackJoints LOD1 skin bound offline to preserved Source101 animation rig.'};
imports.provenance={...imports.provenance,importedWithoutChangingAssetBytes:false,modelModification:character.provenance.modelModification};
write(catalogPath,catalog);write(importsPath,imports);
