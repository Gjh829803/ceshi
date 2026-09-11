import {humanoid} from '@worldkit/three';
import type {Object3D} from 'three';

declare const vehicleType: 'car'|'motorcycle'|'plane';
declare const instanceId: string;
const spec = vehicleType==='plane'?humanoid.createAircraftSpec('plane'):humanoid.createRoadVehicleSpec(vehicleType);
// Draw the visual using this configuration and the reference, including its seat/wheels.
declare const vehicleVisual: Object3D;
const vehicle: humanoid.VehicleInstance = {
  instanceId, assetId: `custom.${vehicleType}`, object: vehicleVisual, spec,
};
// Include vehicle in the vehicles option when creating your one humanoid world.
