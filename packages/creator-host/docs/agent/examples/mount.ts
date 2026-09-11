import {HorseVisual, type HumanoidWorldOptions} from '@worldkit/three';

// Read the permitted asset's calibrated spec/seatAnchor and logical resources.
declare const mount: NonNullable<HumanoidWorldOptions['vehicles']>[number];
declare const resolveResource: Parameters<HorseVisual['load']>[0];
const horse = new HorseVisual();
await horse.load(resolveResource);
const vehicle = {...mount, object: horse.root, visual: horse};
// Include vehicle in the vehicles option when creating your one humanoid world.
