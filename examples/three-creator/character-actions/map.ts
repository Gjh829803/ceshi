import type {TrainingMap} from '@worldkit/three';

/** Three visuals and collision boxes share these dimensions, in metres. */
export const map:TrainingMap={
  id:'character-actions',name:'人物动作场',description:'移动、滑铲、匍匐、攀爬、搬运与游泳',
  bounds:{min:[-25,-5,-20],max:[40,30,20]},
  boxes:[
    {id:'near-bank',position:[-10,-.5,0],size:[30,1,40],color:'#889e73'},
    {id:'pool-floor',position:[10.5,-2.5,0],size:[11,1,40],color:'#a4b8b1'},
    {id:'far-bank',position:[28,-.5,0],size:[24,1,40],color:'#889e73'},
    {id:'slide-beam',position:[-10,1.275,3],size:[4,.45,1.4],color:'#759fc7'},
    {id:'crawl-roof',position:[-18,1.15,3],size:[3.2,.6,3],color:'#ac9bc2'},
    {id:'wall',position:[-16,1.5,-7],size:[6,3,1.8],color:'#a59478'},
    {id:'hurdle',position:[-9,.4,-12],size:[4,.8,.8],color:'#7ac7bd'},
    {id:'pickup-table',position:[-5,.799,-6.71],size:[1.35,.1,.75],color:'#c6ae85'},
    {id:'place-table',position:[-8,.799,-6.71],size:[1.35,.1,.75],color:'#9cbcb2'},
    {id:'seat',position:[1,.41,-5.51],size:[.56,.1,.38],color:'#d4ad74'},
    {id:'seat-back',position:[1,.705,-5.275],size:[.56,.55,.075],color:'#c59462'},
  ],
  interactions:[
    {id:'parcel',label:'小包裹',kind:'pickup',position:[-5.051,.914,-6.363],approach:[-5,.02,-6],yaw:Math.PI,size:[.13,.13,.13],massKg:.3},
    {id:'chair',label:'椅子',kind:'seat',position:[1,.46,-5.51],approach:[1,.02,-6],yaw:Math.PI,colliderIds:['seat','seat-back']},
  ],
  climbSurfaces:[{id:'climb-wall',colliderId:'wall',kind:'wall',center:[-16,0,-6.1],normal:[0,0,1],width:5,minY:0,maxY:3}],
  water:[{id:'pool',min:[5,-2,-20],max:[16,0,20],surface:0}],
  regions:[],spawns:[],playerSpawn:[3.5,.04,0],characterCameraDistanceMeters:7,
};
