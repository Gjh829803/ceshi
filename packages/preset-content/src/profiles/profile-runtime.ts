import { humanoid } from '@worldkit/three';
type Runtime=humanoid.HumanoidRuntime;

import { parseAssetProfile, type AssetProfile } from './profiles';

function matchesProfileAsset(assetId: string, vehicle: ReturnType<Runtime['snapshot']>['vehicles'][number]): boolean {
  return vehicle.assetId===assetId
    || vehicle.assetId===`vehicle.${assetId}`
    || assetId==='dragon'&&vehicle.assetId.startsWith('creature.dragon');
}

function targetInstances(runtime: Runtime, profile: AssetProfile): string[] {
  const vehicles=runtime.snapshot().vehicles;
  if(profile.instanceId!==undefined){
    const vehicle=vehicles.find(vehicle=>vehicle.instanceId===profile.instanceId);
    if(!vehicle)throw new Error(`profile instance not found: ${profile.instanceId}`);
    if(!matchesProfileAsset(profile.assetId,vehicle))throw new Error(`profile instance asset mismatch: ${profile.instanceId}`);
    return [profile.instanceId];
  }
  const targets=vehicles.filter(vehicle=>matchesProfileAsset(profile.assetId,vehicle)).map(vehicle=>vehicle.instanceId);
  if(!targets.length)throw new Error(`profile asset not present: ${profile.assetId}`);
  return targets;
}

export function applyControlProfile(runtime: Runtime, profile: AssetProfile) {
  const parsed = parseAssetProfile(profile);
  if(parsed.assetId==='person'){runtime.applyProfile({character:parsed.control});return;}
  const targets=targetInstances(runtime,parsed),vehicles=Object.fromEntries(targets.map(instanceId=>[instanceId,{...parsed.control}]));
  const aircraftFlight=parsed.aircraftFlight;
  if(aircraftFlight===undefined){runtime.applyProfile({vehicles});return;}
  const aircraftByInstance:Record<string,humanoid.AircraftFlightTuning>={};
  for(const instanceId of targets)aircraftByInstance[instanceId]=aircraftFlight;
  const next:humanoid.HumanoidProfile={vehicles,aircraftFlight:aircraftByInstance};
  runtime.applyProfile(next);
}
/** Read controls from their SDK owner; cameras belong to CameraDocument. */
export function readEditableProfile(runtime: Runtime, profile: AssetProfile): AssetProfile {
  const parsed = parseAssetProfile(profile),effective=runtime.exportProfile();
  if(parsed.assetId==='person')parsed.control=humanoid.parseMovementSettings(effective.character??{},parsed.control);
  else {
    const target=targetInstances(runtime,parsed)[0]!;
    const control=effective.vehicles?.[target]??{};
    parsed.control=humanoid.parseMovementSettings(control,parsed.control);
    const aircraftFlight=effective.aircraftFlight?.[target];
    if(aircraftFlight)parsed.aircraftFlight={...humanoid.DEFAULT_AIRCRAFT_FLIGHT,...aircraftFlight};
  }
  return parsed;
}
