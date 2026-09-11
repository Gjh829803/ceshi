import path from 'node:path';
/** Resolve one shared capsule's case input independently in prepare and continuation. */
export function caseRuntimeConfig(config:Record<string,any>,sourceManifestPath:string,repositoryRoot:string,manifestSha256:string):Record<string,any>{
 if(!config.planningSourceRoot)return config;
 const relative=path.relative(repositoryRoot,path.resolve(sourceManifestPath));
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!path.isAbsolute(config.planningSourceRoot))throw Error('EPISODE_CASE_SOURCE_OUTSIDE_CAPSULE');
 return {...config,sourceManifestRelativePath:relative.split(path.sep).join('/'),planningSourceManifest:path.join(config.planningSourceRoot,relative),planningSourceManifestSha256:manifestSha256};
}
