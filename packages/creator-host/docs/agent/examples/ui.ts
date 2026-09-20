import type {World} from '@worldkit/three';

// Supply existing scene state; these names/health mechanics are only an example.
// Publish after world.start(). The Host creates the presentation, never this snippet.
declare const world:World;
declare const health:{readonly value:number;set(value:number):void};
Object.assign(window,{__WORLDKIT_STREAM_WORLD__:{
  world,
  readUiState:()=>({player:{health:health.value,maxHealth:100}}),
  actions:{damage:()=>health.set(Math.max(0,health.value-20)),heal:()=>health.set(100)},
}});
