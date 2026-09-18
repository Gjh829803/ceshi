import type {IncomingMessage,ServerResponse,Server} from 'node:http';
export interface RegistryServerOptions {artifactBaseUrl?:string;staticFiles?:(string|{path:string;mime_type:string})[];}
export function createRegistryHandler(root:string,options?:RegistryServerOptions):(request:IncomingMessage,response:ServerResponse)=>Promise<void>;
export function createRegistryServer(root:string,options?:RegistryServerOptions):Server;
