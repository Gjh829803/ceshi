import Ajv from './vendor/ajv.cjs';
import fs from 'node:fs';
import path from 'node:path';
import {inside,read,slash} from './core.mjs';

const ajv=new Ajv({allErrors:true,strict:false,strictNumbers:true});
ajv.addSchema(read(new URL('../schemas/content-parameters.schema.json',import.meta.url)));
const validateFacts=ajv.compile(read(new URL('../schemas/physical-facts.schema.json',import.meta.url)));
const validateModel=ajv.compile(read(new URL('../schemas/model-facts.schema.json',import.meta.url)));
const validateSockets=ajv.compile(read(new URL('../schemas/sockets.schema.json',import.meta.url)));
const validateCollision=ajv.compile(read(new URL('../schemas/collision.schema.json',import.meta.url)));

function checked(root,subject,file,validator){
 if(!file)return null;
 const value=read(inside(root,file));
 if(!validator(value))throw Error(`ASSET_CONTENT_FACTS_INVALID: ${subject.asset.asset_id}: ${file}: ${ajv.errorsText(validator.errors)}`);
 return value;
}

/** Only declared facts are read. Absence means no physical configuration was supplied. */
export function readPhysicalFacts(root,subject){
 return checked(root,subject,subject.assembly.facts?.physical,validateFacts);
}

export function readSocketBindings(root,subject){
 const value=checked(root,subject,subject.assembly.bindings?.sockets,validateSockets);
 if(value&&new Set(value.sockets.map(socket=>socket.id)).size!==value.sockets.length)
  throw Error(`ASSET_SOCKET_ID_DUPLICATE: ${subject.asset.asset_id}`);
 return value;
}

export function readModelFacts(root,subject){
 const model=checked(root,subject,subject.assembly.facts?.model,validateModel);
 if(model?.socket_ids?.length){
  const ids=new Set((readSocketBindings(root,subject)?.sockets??[]).map(socket=>socket.id));
  for(const id of model.socket_ids)if(!ids.has(id))throw Error(`ASSET_MODEL_SOCKET_MISSING: ${subject.asset.asset_id}/${id}`);
 }
 return model;
}

export function readCollisionFacts(root,subject){
 const file=slash(path.relative(root,path.join(subject.base,'collision/collision.json')));
 return fs.existsSync(inside(root,file))?checked(root,subject,file,validateCollision):null;
}
