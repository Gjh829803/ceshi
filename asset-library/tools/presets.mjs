import fs from 'node:fs';
import path from 'node:path';
import {inside, read, write} from './core.mjs';
import {readPhysicalFacts,readModelFacts,readSocketBindings} from './content-facts.mjs';

/** Derive the engine adapter's bundled ownership contract from the library schema. */
export function syncContentOwnership(libraryRoot, packageRoot, check = false) {
  const rules = schema => Object.fromEntries(Object.entries(schema.properties).map(([key,value]) => [key,value.properties ? rules(value) : true]));
  const value=rules(read(inside(libraryRoot,'schemas/content-parameters.schema.json')));
  const destination=path.join(packageRoot,'config/integrations/content-ownership.json');
  const contents=JSON.stringify(value,null,2)+'\n';
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination,'utf8')!==contents)
      throw Error(`PRESET_CONTENT_OWNERSHIP_OUT_OF_DATE: ${destination}`);
  } else write(destination,contents);
  const schemaFile=path.join(packageRoot,'config/integrations/content-parameters.schema.json');
  const schemaContents=JSON.stringify(read(inside(libraryRoot,'schemas/content-parameters.schema.json')),null,2)+'\n';
  if(check){
    if(!fs.existsSync(schemaFile)||fs.readFileSync(schemaFile,'utf8')!==schemaContents)
      throw Error(`PRESET_CONTENT_SCHEMA_OUT_OF_DATE: ${schemaFile}`);
  }else write(schemaFile,schemaContents);
  return destination;
}

/** Authoring bridge: callers supply engine composition; standalone tools import no engine code. */
export function buildPresetContent(libraryRoot, authoring) {
  if (!authoring?.selection || typeof authoring.composeContentSpec !== 'function') throw Error('PRESET_AUTHORING_CONTEXT_REQUIRED');
  const manifest = authoring.selection;
  const subjects = {}, models = {}, cameras = {}, dragonCameras = {}, dragonSpecs = {}, dragons = [];
  const at = (subject, relative) => read(inside(libraryRoot, `${subject.path}/${relative}`));
  const descriptor = subject => ({asset:at(subject,'asset.json'),assembly:at(subject,'assemblies/default.json'),base:inside(libraryRoot,subject.path)});
  const factsFor = (subject,kind='physical') => {
    const facts=kind==='model'?readModelFacts(libraryRoot,descriptor(subject)):readPhysicalFacts(libraryRoot,descriptor(subject));
    if(!facts)throw Error(`PRESET_FACTS_MISSING: ${subject.path}/${kind}`);
    return facts;
  };
  const parametersFor = subject => {
    const asset=at(subject,'asset.json');
    return authoring.composeContentSpec(asset.asset_id,{asset_version:asset.asset_version,parameters:factsFor(subject).parameters});
  };
  const addCamera = (subject, id, output, flat) => {
    const presets = authoring.cameraPresets[at(subject,'asset.json').asset_id];
    for (const kind of ['third-person', 'first-person', 'shoulder']) {
      const key = `${id}.${kind}`, preset = presets[key];
      if (!preset || preset.kind !== kind) throw Error(`PRESET_CAMERA_MISSING: ${key}`);
      output[flat ? key : kind] = preset;
    }
  };
  for (const subject of manifest.subjects) {
    const parameters = parametersFor(subject);
    if (!parameters?.id || !parameters.mode || !parameters.envelope || !parameters.seat)
      throw Error(`PRESET_PARAMETERS_MISSING: ${subject.path}`);
    if (Object.hasOwn(subjects, parameters.id)) throw Error(`PRESET_DUPLICATE_ID: ${parameters.id}`);
    if (['spawn', 'yaw', 'color'].some(key => Object.hasOwn(parameters, key)))
      throw Error(`PRESET_SCENE_FIELDS: ${parameters.id}`);
    subjects[parameters.id] = parameters;
    if (subject.model) {
      const model = factsFor(subject,'model');
      models[parameters.id] = {};
      if (model.roadCushion) models[parameters.id].roadCushion = model.roadCushion;
      if (model.socket_ids) {
        const sockets = readSocketBindings(libraryRoot,descriptor(subject))?.sockets??[];
        models[parameters.id].sockets = Object.fromEntries(model.socket_ids.map(id => {
          const socket = sockets.find(socket => socket.id === id);
          if (!socket?.positionMetersXYZ) throw Error(`PRESET_SOCKET_MISSING: ${parameters.id}/${id}`);
          return [id, socket.positionMetersXYZ];
        }));
      }
    }
    addCamera(subject, parameters.id, cameras, true);
  }
  for (const subject of manifest.dragon_variants) {
    const {presentation} = factsFor(subject);
    const parameters = parametersFor(subject);
    const resources = at(subject, 'resources.json');
    if (!presentation?.id || !presentation.name || !resources.model)
      throw Error(`PRESET_DRAGON_MISSING: ${subject.path}`);
    if (!parameters?.id || !parameters.mode || !parameters.envelope || !parameters.seat)
      throw Error(`PRESET_PARAMETERS_MISSING: ${subject.path}`);
    if (Object.hasOwn(dragonSpecs, presentation.id)) throw Error(`PRESET_DUPLICATE_ID: ${presentation.id}`);
    dragonSpecs[presentation.id] = parameters;
    const variant = {id: presentation.id, name: presentation.name, file: path.posix.basename(resources.model)};
    const fields = {ground: 'flyingCreatureGround', seat: 'seat', collisionProbes: 'flyingCreatureCollision', envelope: 'envelope'};
    for (const field of presentation.fields) {
      if (!fields[field] || parameters[fields[field]] === undefined)
        throw Error(`PRESET_DRAGON_FIELD_MISSING: ${presentation.id}/${field}`);
      variant[field] = parameters[fields[field]];
    }
    dragons.push(variant);
    dragonCameras[variant.id] = {};
    addCamera(subject, variant.id, dragonCameras[variant.id], false);
  }
  const person = {path: manifest.person};
  const personProfile = factsFor(person).body;
  if (!personProfile?.envelope) throw Error('PRESET_PERSON_PROFILE_MISSING');
  addCamera(person, 'person', cameras, true);
  return {
    'subjects.json': subjects,
    'models.json': models,
    'dragon-variants.json': dragons,
    'dragon-specs.json': dragonSpecs,
    'person.json': personProfile,
    'camera-presets.json': cameras,
    'dragon-camera-presets.json': dragonCameras,
  };
}

/** Stable package-local snapshots keep Node exports valid and browser imports static. */
export function syncPresetContent(libraryRoot, packageRoot, check = false, authoring) {
  const snapshots = buildPresetContent(libraryRoot, authoring);
  const files = [];
  for (const [name, value] of Object.entries(snapshots)) {
    const destination = path.join(packageRoot, 'config/generated', name);
    const contents = JSON.stringify(value, null, 2) + '\n';
    if (check) {
      if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== contents)
        throw Error(`PRESET_CONTENT_OUT_OF_DATE: ${destination}`);
    } else write(destination, contents);
    files.push(destination);
  }
  return {checked: check, files};
}
