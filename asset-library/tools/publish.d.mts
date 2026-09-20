import type {RegistryDescriptor} from '../client/contracts/index.mjs';
export function publishLibrary(root?:string,options?:{output?:string;audience?:'internal'|'public'}):Promise<RegistryDescriptor>;
