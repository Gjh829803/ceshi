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
  vehicleAuthoring:{modelPolicy:'Author vehicle Mesh/Group geometry; do not load vehicle models. Select handling before drawing; use defaults and inspect details only as needed. Visual names do not select handling: a broom-shaped mesh bound to createAircraftSpec(\'plane\') is still fixed-wing, while a balloon-shaped mesh does not gain steering.',handlingTypes:['car','motorcycle','plane'],aircraftFactory:'humanoid.createAircraftSpec',aircraftExample:{tool:'creator_get_examples',arguments:{topic:'custom-vehicle',variant:'plane'}},factory:'humanoid.createRoadVehicleSpec',schemaTopic:'humanoid',exampleTopic:'custom-vehicle'},
  capabilities:'Read selected assets and the current SDK contracts for movement, animation and collision support. A wingsuit wearer is still a human with a movement mode; a mermaid or dragon needs its own compatible form and movement. Names, appearance and animation clips do not establish flight, swimming or navigation support.',
 };
}
