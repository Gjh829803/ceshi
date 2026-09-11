import {humanoid, type HumanoidWorldOptions} from '@worldkit/three';

// Read the selected asset's vehicle.spec, integrationMetadata.visual and resources.
// Keep that asset's model, animation prefix, core collision and ground calibration together.
declare const mount: NonNullable<HumanoidWorldOptions['vehicles']>[number];
declare const visualBinding: {modelResource:string;flameResource:string;animationPrefix:string};
declare const resolveResource: (logicalPath:string)=>string;
const visual = new humanoid.FlyingCreatureVisual();
await visual.load({dragonUrl:resolveResource(visualBinding.modelResource),
  flameTextureUrl:resolveResource(visualBinding.flameResource),animationPrefix:visualBinding.animationPrefix});
const vehicle = {...mount, object:visual.root, flyingVisual:visual};
// Include vehicle when creating the one humanoid world; it then owns the visual.
// Before that transfer, dispose visual if world creation fails.
