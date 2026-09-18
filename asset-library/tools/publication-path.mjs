import fs from 'node:fs';
import path from 'node:path';
import {assertSafePath,protocolError} from '../client/contracts/index.mjs';

/** Reject symlink components, including existing parents of not-yet-created files. */
export function publicationPath(root,relative){
 assertSafePath(relative);const absoluteRoot=path.resolve(root);let current=absoluteRoot;
 if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw protocolError('ASSET_PATH_SYMLINK');
 for(const component of relative.split('/')){current=path.join(current,component);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw protocolError('ASSET_PATH_SYMLINK');}
 return current;
}
