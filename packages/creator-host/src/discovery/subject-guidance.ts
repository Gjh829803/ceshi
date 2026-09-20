import type {CreatorProfile} from '../contracts';

/** Authoring choices over existing SDK entry points, not a second capability registry. */
export function subjectAuthoringGuidance(profile:CreatorProfile){
 if(profile==='three-raw')return {
  selection:'Control the subject requested by the scene. An animal or creature protagonist does not require an extra human or rider. Keep model, movement and animation appropriate to that subject.',
  routes:[],
  integration:'Use ordinary Three authoring and expose the actual subject as observer.controlledObject and a complete capture target. The raw profile supplies its own movement, physics and observation.',
 };
 return {
  selection:'Choose the controlled subject from the request and reference. A nonhuman protagonist does not require an extra human or rider. Being controllable, riding another actor and being rideable are separate capabilities.',
  routes:[
   {id:'humanoid',when:'An ordinary human is the controlled subject.',entryPoint:'createHumanoidWorld',schemaTopic:'getting-started',exampleTopic:'getting-started'},
   {id:'mounted',when:'A human rides or drives a separate creature or vehicle.',entryPoint:'createHumanoidWorld',schemaTopic:'mounted-interaction',exampleTopic:'custom-vehicle'},
   {id:'nonhuman',when:'An animal or other nonhuman creature is itself the controlled subject.',entryPoint:'createWorld',schemaTopic:'nonhuman-subject',exampleTopic:'nonhuman-subject'},
  ],
  vehicleAuthoring:{modelPolicy:"Author vehicle Mesh/Group geometry unless the asset policy explicitly allows a registered reusable vehicle. For an allowed vehicle, select its ID, load the verified visual with world.assets.load(asset.id), attach it to the VehicleInstance object, and clone asset.vehicle.spec. Follow integrationMetadata.visual for mechanical node animation. Resolve declared source node names with node.userData.name ?? node.name because GLTFLoader suffixes duplicate runtime names; keep authored parent orientation and apply phases only on each declared local axis. Visual names do not select handling: a broom-shaped mesh bound to createAircraftSpec('plane') is still fixed-wing, while a balloon-shaped mesh does not gain steering. A flying sword or similar custom visual that follows the spacecraft/飞船 control matrix must use VehicleSpec mode:'spacecraft' with archetype:'spacecraft' and a spaceFlight configuration (for example SPACE_FLIGHT_PRESETS.shuttle or saucer); do not model it as mount or infer controls from its name. Use current input bindings and activeControlActions for the selected runtime context, not a visual name or legacy spec.hint. Mechanical phase arrays may be empty initially or after reset: use phase = phases[index] ?? 0 and assign Number.isFinite(phase) ? phase : 0.",handlingTypes:['car','motorcycle','plane','spacecraft'],aircraftFactory:"humanoid.createAircraftSpec('plane'); set spec.aircraftSubtype to a supported subtype such as 'helicopter'",spacecraftFactory:"mode:'spacecraft', archetype:'spacecraft', spaceFlight:humanoid.SPACE_FLIGHT_PRESETS.shuttle (or saucer)",aircraftExample:{tool:'creator_get_examples',arguments:{topic:'custom-vehicle',variant:'plane'}},factory:'humanoid.createRoadVehicleSpec',schemaTopic:'humanoid',exampleTopic:'custom-vehicle'},
  capabilities:'Read selected assets and the current SDK contracts for movement, animation and collision support. A wingsuit wearer is still a human with a movement mode; a mermaid or dragon needs its own compatible form and movement. Names, appearance and animation clips do not establish flight, swimming or navigation support.',
 };
}
