import type {EnvironmentDefinition} from '@worldkit/three';

const boxes:EnvironmentDefinition['boxes'][number][]=[
    {id:'near-bank',position:[-10,-.5,0],size:[30,1,40],color:'#cccccc'},
    {id:'pool-floor',position:[10.5,-2.5,0],size:[11,1,40],color:'#bbbbbb'},
    {id:'far-bank',position:[28,-.5,0],size:[24,1,40],color:'#cccccc'},
    {id:'slide-beam',position:[-10,1.275,3],size:[4,.45,1.4],color:'#759fc7'},
    {id:'crawl-roof',position:[-18,1.15,3],size:[3.2,.6,3],color:'#eeeeee'},
    {id:'wall',position:[-16,1.5,-7],size:[6,3,1.8],color:'#eeeeee'},
    {id:'hurdle',position:[-9,.4,-12],size:[4,.8,.8],color:'#eeeeee'},
    {id:'pickup-table',position:[-5,.799,-6.71],size:[1.35,.1,.75],color:'#dddddd',rigidGroup:{id:'pickup-table-body',massKg:24}},
    {id:'place-table',position:[-8,.799,-6.71],size:[1.35,.1,.75],color:'#dddddd',rigidGroup:{id:'place-table-body',massKg:24}},
    {id:'seat',position:[1,.41,-5.51],size:[.56,.1,.38],color:'#eeeeee',rigidGroup:{id:'chair-body',massKg:8}},
    {id:'seat-back',position:[1,.705,-5.275],size:[.56,.55,.075],color:'#eeeeee',rigidGroup:{id:'chair-body',massKg:8}},
  ];
const chairColliders=['seat','seat-back'];

/** Physical support and interaction clearance, in metres. Visible objects are authored in main.ts. */
export const map:EnvironmentDefinition={
  id:'character-actions',name:'人物动作场',description:'移动、滑铲、匍匐、攀爬、搬运与游泳',
  bounds:{min:[-25,-5,-20],max:[40,30,20]},
  boxes,
  interactions:[
    {id:'parcel',label:'小包裹',kind:'pickup',slotId:'pickup',position:[-5.051,.914,-6.363],approach:[-5,.02,-6],yaw:Math.PI,size:[.13,.13,.13],massKg:.3},
    {id:'chair',label:'椅子',kind:'seat',slotId:'seat',position:[1,.46,-5.51],approach:[1,.02,-6],yaw:Math.PI,colliderIds:chairColliders},
  ],
  climbSurfaces:[{id:'climb-wall',colliderId:'wall',kind:'wall',center:[-16,0,-6.1],normal:[0,0,1],width:5,minY:0,maxY:3}],
  water:[{id:'pool',min:[5,-2,-20],max:[16,0,20],surface:0}],
  regions:[],spawns:[],playerSpawn:[3.5,.04,0],
};

// Every part of one movable object shares its group ID and TOTAL mass in kg.
// Legs provide real support; a dynamic tabletop alone falls to the floor.
for(const [id,x] of [['pickup-table',-5],['place-table',-8]] as const){
  for(const dx of [-.55,.55])for(const dz of [-.26,.26])boxes.push({
    id:`${id}-leg-${dx}-${dz}`,position:[x+dx,.3745,-6.71+dz],size:[.09,.749,.09],
    color:'#dddddd',rigidGroup:{id:`${id}-body`,massKg:24},
  });
}
for(const dx of [-.22,.22])for(const dz of [-.14,.14]){
  const id=`chair-leg-${dx}-${dz}`;
  boxes.push({id,position:[1+dx,.18,-5.51+dz],size:[.07,.36,.07],
    color:'#eeeeee',rigidGroup:{id:'chair-body',massKg:8}});
  chairColliders.push(id);
}
// This example keeps ground/walls fixed; choose dynamic objects per scene and gameplay.
