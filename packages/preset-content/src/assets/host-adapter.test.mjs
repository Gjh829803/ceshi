import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildWhiteboxCatalog} from '../../../../asset-library/tools/whitebox.mjs';
import {buildPresetContent,syncContentOwnership} from '../../../../asset-library/tools/presets.mjs';
import {composeAssetCatalog,composeContentSpec,createContentAdapter,presetAuthoringContext,runtimeAssetContext} from './host-adapter.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(root+file,'utf8'));
const engine = () => ({presets:read('packages/preset-content/config/presets/subjects.json'),integrations:read('packages/preset-content/config/integrations/whitebox.json')});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const catalog = buildWhiteboxCatalog(root+'asset-library');
const rover = catalog.assets.find(a=>a.id==='vehicle.rover');
const roverFacts = () => ({asset_version:rover.contentVersion,parameters:structuredClone(rover.vehicle.spec)});
test('standalone library schema and engine content ownership declare the same contract',()=>{
  assert.doesNotThrow(()=>syncContentOwnership(root+'asset-library',root+'packages/preset-content',true));
  const fromSchema = schema => Object.fromEntries(Object.entries(schema.properties).map(([key,value])=>[key,value.properties?fromSchema(value):true]));
  assert.deepEqual(fromSchema(read('asset-library/schemas/content-parameters.schema.json')),read('packages/preset-content/config/integrations/content-ownership.json'));
});
test('published Whitebox content does not own runtime handling', () => {
  const rover = buildWhiteboxCatalog(root + 'asset-library').assets.find(a => a.id === 'vehicle.rover');
  assert.equal(rover.vehicle.spec.speed, undefined);
  assert.equal(rover.vehicle.spec.wheelPhysics.powertrain, undefined);
  assert.equal(rover.integrationMetadata?.cameraPresetReferences, undefined);
});
test('helicopter binding preserves the supplied model and composes the helicopter runtime contract', () => {
  const helicopter = buildWhiteboxCatalog(root + 'asset-library').assets.find(asset => asset.id === 'vehicle.helicopter');
  assert.ok(helicopter);
  assert.equal(helicopter.contentVersion, '0.1.1');
  assert.equal(helicopter.sha256, '7419a6f70a6832c7a06c035217271c3a5470ee1eb232cfab0c5ef09f3a1583b4');
  assert.equal(helicopter.byteLength, 146688);
  assert.equal(helicopter.usage, 'reusable');
  assert.equal(helicopter.integrationMetadata.visual.load, 'world.assets.load');
  assert.deepEqual(helicopter.integrationMetadata.visual.rotors, [
    {nodeName:'aircraft-rotor', occurrence:0, phaseIndex:0, rotationAxis:'y'},
    {nodeName:'aircraft-rotor', occurrence:1, phaseIndex:1, rotationAxis:'y'},
  ]);
  const composed = composeAssetCatalog([helicopter])[0];
  assert.equal(composed.sha256, helicopter.sha256);
  assert.equal(composed.vehicle.spec.mode, 'plane');
  assert.equal(composed.vehicle.spec.aircraftSubtype, 'helicopter');
  assert.deepEqual(composed.vehicle.spec.seat, [0,1.3,.1]);
  assert.deepEqual(composed.vehicle.spec.envelope, {kind:'box',halfExtents:[4.5,1.4,4.1],offset:[0,1.4,0]});
  assert.deepEqual(composed.integrationMetadata.cameraPresetReferences.map(reference => reference.key), [
    'helicopter.third-person','helicopter.first-person','helicopter.shoulder',
  ]);
});
test('full Host catalog and seven generated snapshots preserve the merged dev calibration', () => {
  // dev f6000cdc/d84a9641 calibration plus 8b6854ea kart seat and compound chassis.
  assert.equal(fingerprint({...catalog,assets:composeAssetCatalog(catalog.assets)}),'86ac2473211ad563fe7e275768b37cb53ff169c74743745d82b620b78ed81505');
  assert.equal(fingerprint(buildPresetContent(root+'asset-library',presetAuthoringContext())),'e8d48e3869469dbc389f085c095ba1c683a4c841ad897517d1388942e30decbf');
});
test('remote composition is pure, preserves measured geometry, and rejects competing authorities', () => {
  const facts=roverFacts(), before=structuredClone(facts), composed=composeContentSpec('vehicle.rover',facts);
  assert.deepEqual(facts,before);
  assert.deepEqual(composed.seat,facts.parameters.seat);
  assert.deepEqual(composed.wheelPhysics.wheels,facts.parameters.wheelPhysics.wheels);
  assert.equal(composed.speed,44.44444444444444);
  for (const key of ['speed','unexpectedOverride','mode']) {
    const invalid=roverFacts(); invalid.parameters[key]=1;
    assert.throws(()=>composeContentSpec('vehicle.rover',invalid),/CONTENT_FIELD_OWNERSHIP/);
  }
  const invalid=roverFacts(); invalid.parameters.wheelPhysics.powertrain={};
  assert.throws(()=>composeContentSpec('vehicle.rover',invalid),/CONTENT_FIELD_OWNERSHIP/);
  for (const path of [['seat'],['wheelPhysics','radius'],['flyingCreatureGround','probes']]) {
    const configuration=engine(), parameters=configuration.presets['vehicle.rover'].parameters;
    if(path.length===1)parameters[path[0]]=[];
    else {parameters[path[0]]||={};parameters[path[0]][path[1]]=1;}
    assert.throws(()=>createContentAdapter(configuration),/CONTENT_FIELD_OWNERSHIP/);
  }
  const configuration=engine();configuration.integrations.assets['vehicle.rover'].vehicle.spec.seat=[0,99,0];
  assert.throws(()=>createContentAdapter(configuration),/CONTENT_INTEGRATION_FIELD_OWNERSHIP/);
});
test('versions bind exactly; unknown runtime integration cannot silently become a vehicle', () => {
  assert.throws(()=>composeContentSpec('vehicle.rover',{...roverFacts(),asset_version:'0.2.0'}),/CONTENT_VERSION_UNSUPPORTED/);
  assert.throws(()=>composeContentSpec('vehicle.rover',roverFacts().parameters),/CONTENT_FACTS_ENVELOPE_INVALID/);
  assert.throws(()=>composeAssetCatalog([{...rover,contentVersion:'0.2.0'}]),/CONTENT_VERSION_UNSUPPORTED/);
  assert.throws(()=>composeAssetCatalog([{...rover,id:'unknown.vehicle'}]),/CONTENT_INTEGRATION_MISSING/);
  assert.deepEqual(composeAssetCatalog([{id:'unknown.model',contentVersion:'1.0.0',uri:'model.glb'}]),[{id:'unknown.model',uri:'model.glb'}]);
});
test('known model-only bindings cannot acquire vehicles without complete engine integration and tuning', () => {
  const model={id:'animal.akita-inu',contentVersion:'0.1.0',uri:'model.glb'};
  const injected={...model,vehicle:{schemaVersion:1,spec:{id:'akita',name:'Akita',en:'Akita',seat:[0,1,0],
    envelope:{kind:'box',halfExtents:[1,1,1],offset:[0,0,0]}}}};
  assert.throws(()=>composeAssetCatalog([injected]),/CONTENT_VEHICLE_INTEGRATION_MISSING/);
  assert.deepEqual(composeAssetCatalog([model]),[{id:model.id,uri:model.uri}]);
  for (const field of ['mode','kernel','speed','accel','grip','steer','hint']) {
    const configuration=engine();delete configuration.presets[rover.id].parameters[field];
    assert.throws(()=>createContentAdapter(configuration).composeAssetCatalog([rover]),/CONTENT_VEHICLE_PRESET_INVALID/,field);
  }
  for (const field of ['spawn','yaw','color']) {
    const configuration=engine();delete configuration.integrations.assets[rover.id].vehicle.spec[field];
    assert.throws(()=>createContentAdapter(configuration).composeAssetCatalog([rover]),/CONTENT_VEHICLE_INTEGRATION_INVALID/,field);
  }
});
test('engine tuning changes runtime identity independently of content artifacts; geometry only changes composed facts', () => {
  const contentBefore=fingerprint(catalog),configuration=engine(),context=runtimeAssetContext(['vehicle.rover']);
  configuration.presets['vehicle.rover'].parameters.speed=77;
  configuration.presets['vehicle.rover'].camera['rover.third-person'].values.position.distanceMeters=42;
  const adapter=createContentAdapter(configuration), composed=adapter.composeAssetCatalog(catalog.assets);
  assert.equal(composed.find(a=>a.id===rover.id).vehicle.spec.speed,77);
  assert.notEqual(adapter.runtimeAssetContext(['vehicle.rover']).preset_digest,context.preset_digest);
  assert.equal(fingerprint(catalog),contentBefore);
  const facts=roverFacts();facts.parameters.seat=[0,2.7,0];facts.parameters.wheelPhysics.radius=.85;
  const changed=adapter.composeContentSpec(rover.id,facts);
  assert.deepEqual(changed.seat,[0,2.7,0]);assert.equal(changed.wheelPhysics.radius,.85);
  assert.equal(changed.speed,77);
  assert.equal(fingerprint(catalog),contentBefore);
  assert.equal(runtimeAssetContext([rover.id,rover.id]).preset_digest,context.preset_digest);
  assert.deepEqual(context.supported_contracts,[{contract_id:'module.host.subject',version:'1.0.0'}]);
  context.supported_contracts[0].version='changed';
  assert.equal(runtimeAssetContext([rover.id]).supported_contracts[0].version,'1.0.0');
});

test('remote physical facts reject invalid numbers, vectors and collision dimensions before composition',()=>{
 for(const patch of [{radius:'bad'},{radius:NaN},{radius:Infinity},{radius:-1},{seat:[0,undefined,0]},{seat:[0,1]},{envelope:{kind:'box',halfExtents:[1,0,1],offset:[0,0,0]}},{wheelPhysics:{radius:false}}]){
  const facts=roverFacts();Object.assign(facts.parameters,patch);
  assert.throws(()=>composeContentSpec(rover.id,facts),/CONTENT_FACTS_INVALID/,JSON.stringify(patch));
  const entry=structuredClone(rover);Object.assign(entry.vehicle.spec,patch);
  assert.throws(()=>composeAssetCatalog([entry]),/CONTENT_FACTS_INVALID/);
 }
 const signed=roverFacts();signed.parameters.seat=[-1,0,-3];signed.parameters.rearAxleZMeters=-2;
 assert.deepEqual(composeContentSpec(rover.id,signed).seat,[-1,0,-3]);
});
