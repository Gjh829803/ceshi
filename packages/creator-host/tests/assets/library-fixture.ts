import {fileURLToPath} from 'node:url';
import catalog from '../../../../asset-library/dist/whitebox/asset-catalog.json';
import {readCatalogResource} from '../../src/assets/asset-resources.js';

/** Real hashed source clips, independent of their physical placement in the library. */
export async function readHumanoidSource(logicalPath:string):Promise<Buffer<ArrayBuffer>>{
  const subject=catalog.assets.find(asset=>asset.id==='humanoid.uefn-mannequin');
  const resource=subject?.resources?.find(resource=>resource.path==='humanoid/source/'+logicalPath);
  if(!resource)throw new Error('HUMANOID_TEST_RESOURCE_MISSING: '+logicalPath);
  return Buffer.from(await readCatalogResource(fileURLToPath(new URL('../../../../',import.meta.url)),resource));
}
