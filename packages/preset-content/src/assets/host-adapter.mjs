import fs from 'node:fs';
import crypto from 'node:crypto';
import Ajv from 'ajv';

const readConfig = name => JSON.parse(fs.readFileSync(new URL(`../../config/${name}`, import.meta.url), 'utf8'));
const ownership = readConfig('integrations/content-ownership.json');
const physicalValidator=new Ajv({allErrors:true,strict:false,strictNumbers:true});
const validatePhysical=physicalValidator.compile(readConfig('integrations/content-parameters.schema.json'));
const defaults = {presets:readConfig('presets/subjects.json'), integrations:readConfig('integrations/whitebox.json')};
const selection = readConfig('integrations/subjects.json');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function checkOwnership(value, rules, owner, prefix = '') {
  if (!object(value)) throw Error(`CONTENT_FACTS_OBJECT_REQUIRED: ${prefix}`);
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__','prototype','constructor'].includes(key)) throw Error(`CONTENT_UNSAFE_FIELD: ${prefix}${key}`);
    const rule = Object.hasOwn(rules,key) ? rules[key] : undefined;
    if (owner === 'content' && !rule || owner === 'engine' && rule === true)
      throw Error(`CONTENT_FIELD_OWNERSHIP: ${owner} cannot set ${prefix}${key}`);
    if (object(rule)) checkOwnership(item,rule,owner,`${prefix}${key}.`);
  }
}

/** Merge disjoint ownership only. A collision is an error, never an override. */
function merge(content, tuning, prefix = '') {
  const result = structuredClone(content);
  for (const [key,value] of Object.entries(tuning)) {
    if (Object.hasOwn(result,key)) {
      if (!object(result[key]) || !object(value)) throw Error(`CONTENT_TUNING_CONFLICT: ${prefix}${key}`);
      result[key] = merge(result[key],value,`${prefix}${key}.`);
    } else result[key] = structuredClone(value);
  }
  return result;
}

/** Isolated engine configuration; content is supplied by the caller, including remote manifests. */
export function createContentAdapter(configuration) {
  const {presets,integrations} = structuredClone(configuration);
  for (const [id,preset] of Object.entries(presets)) checkOwnership(preset.parameters,ownership,'engine',`${id}.`);
  for (const [id,integration] of Object.entries(integrations.assets)) {
    for (const field of Object.keys(integration.vehicle?.spec||{}))
      if (!['spawn','yaw','color'].includes(field)) throw Error(`CONTENT_INTEGRATION_FIELD_OWNERSHIP: ${id}.${field}`);
  }
  function binding(assetId,version) {
    const integration=integrations.assets[assetId];
    if (!integration) throw Error(`CONTENT_INTEGRATION_MISSING: ${assetId}`);
    if (integration.asset_version !== version) throw Error(`CONTENT_VERSION_UNSUPPORTED: ${assetId}@${version}`);
    return integration;
  }
  function composeContentSpec(assetId,contentFacts) {
    if (!object(contentFacts) || Object.keys(contentFacts).some(k => !['asset_version','parameters'].includes(k)))
      throw Error('CONTENT_FACTS_ENVELOPE_INVALID');
    binding(assetId,contentFacts.asset_version);
    checkOwnership(contentFacts.parameters,ownership,'content');
    if(!validatePhysical(contentFacts.parameters))
      throw Error(`CONTENT_FACTS_INVALID: ${assetId}: ${physicalValidator.errorsText(validatePhysical.errors)}`);
    const preset=presets[assetId];
    if (!preset) throw Error(`CONTENT_PRESET_MISSING: ${assetId}`);
    if (preset.parameters.mode && (!contentFacts.parameters.seat || !contentFacts.parameters.envelope))
      throw Error(`CONTENT_GEOMETRY_REQUIRED: ${assetId}`);
    return merge(contentFacts.parameters,preset.parameters);
  }
  function composeAssetCatalog(entries) {
    if (!Array.isArray(entries)) throw Error('CONTENT_CATALOG_ARRAY_REQUIRED');
    return entries.map(source => {
      const {contentVersion,...entry}=structuredClone(source);
      const integration=integrations.assets[entry.id];
      if (!integration) {
        if (entry.vehicle) throw Error(`CONTENT_INTEGRATION_MISSING: ${entry.id}`);
        return entry; // Pure model preview needs no vehicle integration.
      }
      binding(entry.id,contentVersion);
      if (entry.integrationMetadata?.cameraPresetReferences) throw Error('CONTENT_ENGINE_CAMERA_REFERENCE');
      if (integration.cameraPresetReferences) entry.integrationMetadata={...entry.integrationMetadata,cameraPresetReferences:structuredClone(integration.cameraPresetReferences)};
      if (entry.vehicle) {
        if (!object(integration.vehicle)) throw Error(`CONTENT_VEHICLE_INTEGRATION_MISSING: ${entry.id}`);
        const placement=integration.vehicle.spec, tuning=presets[entry.id]?.parameters;
        if (integration.vehicle.schemaVersion !== 1 || !object(placement) ||
            typeof placement.color !== 'string' || !placement.color || !Number.isFinite(placement.yaw) ||
            !Array.isArray(placement.spawn) || placement.spawn.length !== 3 ||
            ![0,1,2].every(index=>Number.isFinite(placement.spawn[index])))
          throw Error(`CONTENT_VEHICLE_INTEGRATION_INVALID: ${entry.id}`);
        if (!object(tuning) || !['mode','kernel'].every(key=>typeof tuning[key]==='string' && tuning[key]) ||
            typeof tuning.hint !== 'string' || !['speed','accel','grip','steer'].every(key=>Number.isFinite(tuning[key])))
          throw Error(`CONTENT_VEHICLE_PRESET_INVALID: ${entry.id}`);
        const spec=composeContentSpec(entry.id,{asset_version:contentVersion,parameters:entry.vehicle.spec});
        entry.vehicle={...entry.vehicle,spec:merge(spec,placement)};
      }
      return entry;
    });
  }
  function runtimeAssetContext(assetIds) {
    const ids=[...new Set(assetIds)].sort();
    const selected=Object.fromEntries(ids.map(id => {
      if (!integrations.assets[id] || !presets[id]) throw Error(`CONTENT_INTEGRATION_MISSING: ${id}`);
      return [id,{integration:integrations.assets[id],preset:presets[id]}];
    }));
    return {runtime_id:integrations.runtime_id,runtime_version:integrations.runtime_version,
      adapter_id:integrations.adapter_id,adapter_version:integrations.adapter_version,
      preset_digest:digest(selected),overrides_digest:digest({}),supported_contracts:structuredClone(integrations.supported_contracts)};
  }
  return {composeContentSpec,composeAssetCatalog,runtimeAssetContext};
}

const adapter=createContentAdapter(defaults);
export const {composeContentSpec,composeAssetCatalog,runtimeAssetContext}=adapter;

/** Explicit callbacks keep standalone library tools independent of the engine package. */
export function presetAuthoringContext(configuration=defaults, subjectSelection=selection) {
  const local=createContentAdapter(configuration), cameraPresets={};
  for (const [id,preset] of Object.entries(configuration.presets)) cameraPresets[id]=structuredClone(preset.camera);
  return {selection:structuredClone(subjectSelection),composeContentSpec:local.composeContentSpec,cameraPresets};
}
