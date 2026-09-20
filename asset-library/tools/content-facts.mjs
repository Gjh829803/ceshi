import Ajv from './vendor/ajv.cjs';
import {inside,read} from './core.mjs';

const ajv=new Ajv({allErrors:true,strict:false,strictNumbers:true});
ajv.addSchema(read(new URL('../schemas/content-parameters.schema.json',import.meta.url)));
const validateFacts=ajv.compile(read(new URL('../schemas/physical-facts.schema.json',import.meta.url)));

/** Only declared facts are read. Absence means no physical configuration was supplied. */
export function readPhysicalFacts(root,subject){
 const file=subject.assembly.facts?.physical;
 if(!file)return null;
 const facts=read(inside(root,file));
 if(!validateFacts(facts))throw Error(`ASSET_CONTENT_FACTS_INVALID: ${subject.asset.asset_id}: ${ajv.errorsText(validateFacts.errors)}`);
 return facts;
}
