import {RegistryClient} from './registry-client.mjs';

/** Small standalone facade over the same snapshot-pinned Registry protocol. */
export class AssetLibrary {
  constructor(baseUrl, options={}) {
    this.baseUrl=new URL(baseUrl.endsWith('/')?baseUrl:baseUrl+'/');
    this.client=new RegistryClient({registryUrl:baseUrl,...options});
    this.refs=new Map();
  }
  url(relative) {
    if(typeof relative!=='string'||!relative||/[\\:%?#\0]/.test(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('ASSET_PATH_INVALID');
    return new URL(relative,this.baseUrl).href;
  }
  async search(query='',filters={}) {
    const response=await this.client.searchAssets({query,limit:20,...filters});
    for(const row of response.items)this.refs.set(`${row.asset_id}@${row.version}`,{asset_id:row.asset_id,version:row.version,manifest_digest:row.manifest_digest,manifest_path:row.manifest_path});
    return response;
  }
  async describe(id,{version}={}) {
    if(!version){const result=await this.search('',{asset_ids:[id],limit:1});version=result.items[0]?.version;if(!version)throw Error('ASSET_NOT_FOUND: '+id);}
    let ref=this.refs.get(`${id}@${version}`);
    if(!ref){const lock=await this.client.resolveAssembly({assets:[{asset_id:id,version}],purpose:'preview',runtime:null});for(const item of lock.assets)this.refs.set(`${item.asset_id}@${item.version}`,item);ref=this.refs.get(`${id}@${version}`);}
    if(!ref)throw Error('ASSET_NOT_FOUND: '+id);
    return this.client.fetchManifest(ref);
  }
  async resolve(id,{version='latest',purpose='runtime',runtime=null}={}) {
    return this.client.resolveAssembly({assets:[{asset_id:id,version}],purpose,runtime});
  }
  bytes(artifact){return this.client.fetchArtifact(artifact);}
  async blobUrl(artifact){return URL.createObjectURL(new Blob([await this.bytes(artifact)],{type:artifact.mime_type}));}
}
