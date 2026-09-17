import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createHumanoidWorld,humanoid,parseCameraDocument,type EnvironmentDefinition} from '@worldkit/three';
import cameraData from './camera.json';

const scene=new THREE.Scene();scene.background=new THREE.Color('#cbdde4');
scene.add(new THREE.HemisphereLight('#ffffff','#919d9e',1.5));
const sun=new THREE.DirectionalLight('#fff6e5',1.8);sun.position.set(-35,60,25);scene.add(sun);
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,450);
const canvas=document.querySelector<HTMLCanvasElement>('#world')!;
const colors={stone:'#e7e5df',trim:'#f4f1e9',roof:'#bcafa1',window:'#758a91',sea:'#a9c9d0',dark:'#727d80',awning:'#8babb8',leaf:'#a7b4a2'};
const materials=new Map<string,THREE.MeshStandardMaterial>();
const mat=(color:string)=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:1});materials.set(color,m);}return m;};
const boxes:EnvironmentDefinition['boxes'][number][]=[];
function part(group:THREE.Group,geometry:THREE.BufferGeometry,p:[number,number,number],color=colors.stone){const mesh=new THREE.Mesh(geometry,mat(color));mesh.position.set(...p);group.add(mesh);return mesh;}
function box(group:THREE.Group,size:[number,number,number],p:[number,number,number],color=colors.stone){return part(group,new THREE.BoxGeometry(...size),p,color);}
function solid(id:string,p:[number,number,number],size:[number,number,number],rotation?:[number,number,number]){boxes.push({id,position:p,size,...(rotation?{rotation}:{})});}
function compact(group:THREE.Group){group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>();group.traverse(child=>{if(!(child instanceof THREE.Mesh))return;const material=child.material as THREE.Material;let geometry=child.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld));if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));const list=batches.get(material)??[];list.push(geometry);batches.set(material,list);child.geometry.dispose();});group.clear();for(const [material,list]of batches){const merged=mergeGeometries(list,false)!;for(const geometry of list)geometry.dispose();group.add(new THREE.Mesh(merged,material));}return group;}
function group(name:string,p:[number,number,number]=[0,0,0]){const g=new THREE.Group();g.name=name;g.position.set(...p);scene.add(g);return g;}
const town=group('town-surfaces');
box(town,[110,.5,200],[18,-.25,-40]);solid('town-floor',[18,-.25,-40],[110,.5,200]);
box(town,[400,.3,440],[-238,-1.2,-80],colors.sea);
box(town,[12,.14,190],[-25,.07,-38],'#d4d9d6');
box(town,[18,.04,110],[7,.025,-12],'#d5d6d1');
const slope=Math.atan(6/56);box(town,[14,.5,56],[40,2.75,-66],'#d0d2cd').rotation.x=slope;solid('hill-road',[40,2.75,-66],[14,.5,56],[slope,0,0]);
box(town,[55,.5,55],[44,5.75,-117]);solid('upper-town',[44,5.75,-117],[55,.5,55]);
box(town,[11,.04,49],[40,6.03,-118],'#d2d4cf');
// Waterfront railings are visible, with a continuous independent physical fence.
for(let z=49;z>=-128;z-=6){box(town,[.15,1.1,.15],[-34,.55,z],colors.dark);box(town,[.12,.1,6],[-34,1.08,z-3],colors.dark);box(town,[.12,.07,6],[-34,.5,z-3],colors.dark);}
function roof(g:THREE.Group,w:number,d:number,h:number,y:number){const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,h);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false});geometry.translate(0,0,-d/2);part(g,geometry,[0,y,0],colors.roof);}
function building(id:string,x:number,z:number,w:number,d:number,h:number,y=0,shop=false){const g=group(id,[x,y,z]);box(g,[w,h,d],[0,h/2,0]);roof(g,w+.8,d+.8,1.7,h);box(g,[w+.4,.23,d+.4],[0,h,0],colors.trim);
 const cols=Math.max(2,Math.floor(w/3.5));for(let floor=0;floor<Math.floor(h/3);floor++)for(let c=0;c<cols;c++){const wx=(c-(cols-1)/2)*3.4,wy=2+floor*3;box(g,[1.25,1.6,.13],[wx,wy,d/2+.08],colors.window);for(const dx of [-.82,.82])box(g,[.3,1.7,.18],[wx+dx,wy,d/2+.11],colors.window);if(floor){box(g,[1.95,.15,.95],[wx,wy-.95,d/2+.38],colors.trim);box(g,[1.95,.65,.08],[wx,wy-.55,d/2+.85],colors.dark);}}
 box(g,[1.6,2.4,.16],[0,1.2,d/2+.09],colors.dark);
 if(shop){for(const x of [-w*.25,w*.25]){const awning=box(g,[w*.46,.15,3.4],[x,2.8,d/2+1.5],colors.awning);awning.rotation.x=.1;box(g,[w*.46,.4,.12],[x,2.45,d/2+3.1],colors.awning);}for(let i=0;i<4;i++){const x=(i-1.5)*3;part(g,new THREE.CylinderGeometry(.65,.65,.12,12),[x,.85,d/2+4.3],colors.trim);part(g,new THREE.CylinderGeometry(.09,.09,.8,8),[x,.4,d/2+4.3],colors.dark);for(const side of [-1,1]){box(g,[.6,.1,.6],[x+side*.9,.45,d/2+4.3],colors.roof);box(g,[.6,.65,.08],[x+side*.9,.7,d/2+4.7],colors.roof);}}}
 solid(id+'-shell',[x,y+h/2,z],[w,h,d]);return compact(g);}
const cafe=building('harbor-cafe',15,-31,18,12,9,0,true);
for(const [id,x,z,w,d,h,y]of [['east-house',45,-26,14,13,11,0],['corner-house',63,-49,16,13,13,0],['harbor-house',-13,-65,14,10,8,0],['upper-house-a',23,-110,10,15,9,6],['upper-house-b',59,-113,13,14,12,6],['upper-house-c',25,-135,11,13,10,6],['upper-house-d',59,-137,13,14,11,6],['south-house',54,28,15,17,10,0]] as const)building(id,x,z,w,d,h,y);
const fountain=group('fountain',[-10,0,-14]);part(fountain,new THREE.CylinderGeometry(4.5,4.8,.35,36),[0,.175,0],colors.trim);part(fountain,new THREE.CylinderGeometry(3.8,3.8,.55,36),[0,.62,0]);part(fountain,new THREE.CylinderGeometry(3.35,3.35,.05,36),[0,.91,0],colors.sea);part(fountain,new THREE.CylinderGeometry(.32,.6,1.7,12),[0,1.65,0],colors.trim);part(fountain,new THREE.CylinderGeometry(1.65,1.15,.28,24),[0,2.55,0],colors.trim);part(fountain,new THREE.CylinderGeometry(.14,.24,1.05,10),[0,3.05,0],colors.trim);part(fountain,new THREE.CylinderGeometry(.75,.48,.2,20),[0,3.6,0],colors.trim);part(fountain,new THREE.SphereGeometry(.2,10,8),[0,3.86,0],colors.trim);solid('fountain-basin',[-10,.6,-14],[8.6,1.2,8.6]);compact(fountain);
const harbor=group('harbor');box(harbor,[32,1,5],[-50,-.45,-58],colors.trim);box(harbor,[5,1,45],[-65,-.45,-38],colors.trim);for(let i=0;i<4;i++){const boat=group('boat-'+i,[-45-i*6,-.35,-44+i*6]);const hull=part(boat,new THREE.SphereGeometry(1,12,8),[0,0,0],i%2?colors.trim:colors.awning);hull.scale.set(1.1,.6,3.5);box(boat,[1.2,.5,1.8],[0,.5,-.5],colors.trim);box(boat,[.08,6,.08],[0,3,0],colors.dark);const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([0,.9,.15,0,5.8,.15,0,.9,2.7],3));sail.setIndex([0,1,2,2,1,0]);sail.computeVertexNormals();part(boat,sail,[0,0,0],colors.trim);compact(boat);}compact(harbor);
const lighthouse=group('lighthouse',[-62,0,-112]);const rock=part(lighthouse,new THREE.DodecahedronGeometry(14,0),[0,-5,0],'#babdb6');rock.scale.set(1.1,.9,1.3);part(lighthouse,new THREE.CylinderGeometry(1.5,2.2,16,16),[0,10,0],colors.trim);part(lighthouse,new THREE.CylinderGeometry(2.25,2.25,.5,16),[0,18,0],colors.roof);part(lighthouse,new THREE.CylinderGeometry(1.25,1.25,2.5,10),[0,19.4,0],colors.window);part(lighthouse,new THREE.ConeGeometry(2.25,1.8,12),[0,21.2,0],colors.roof);compact(lighthouse);
function lamp(x:number,z:number,y=0){part(town,new THREE.CylinderGeometry(.09,.17,3.8,8),[x,y+1.9,z],colors.dark);box(town,[.65,.85,.65],[x,y+4.15,z],colors.trim);part(town,new THREE.ConeGeometry(.65,.45,4),[x,y+4.8,z],colors.dark);}
for(const z of [24,2,-24,-48,-77,-103])lamp(-28,z);for(const z of [-4,-40])lamp(28,z);
for(const [x,z,y]of [[-18,-6,0],[-18,-24,0],[27,-23,0],[27,-40,0],[66,-94,6],[22,-98,6],[66,-125,6]] as const){part(town,new THREE.CylinderGeometry(.75,.55,1,10),[x,y+.5,z],colors.roof);part(town,new THREE.SphereGeometry(1.5,10,8),[x,y+2,z],colors.leaf);}
for(const [x,z]of [[27,-113],[62,-107],[24,-136],[64,-136],[-21,-71]] as const){const y=x>0?6:0;part(town,new THREE.CylinderGeometry(.15,.25,4,8),[x,y+2,z],colors.dark);const c=part(town,new THREE.ConeGeometry(1.05,6,10),[x,y+5,z],colors.leaf);c.scale.z=.8;}
// Keep long, connected routes: quay, plaza, cafe street, ramp and upper village.
const map:EnvironmentDefinition={id:'seaside-town',name:'海滨小镇',description:'港口广场、海滨步道与上坡旧街',bounds:{min:[-38,-5,-147],max:[75,34,61]},boxes,water:[],regions:[{id:'town',name:'海滨小镇',description:'步行与骑行',center:[18,0,-40],size:[108,198],color:colors.stone,modes:['character','motorcycle']}],spawns:[{id:'motorcycle-start',name:'摩托车',vehicleId:'motorcycle',position:[1.8,0,7.2],yaw:Math.PI,regionId:'town'}],playerSpawn:[0,0,7],boundaries:[{id:'town-edge',shape:'rectangle',minimumXZ:[-35,-145],maximumXZ:[71,57],bottomMeters:-3,topMeters:15,thicknessMeters:.5,blocksCamera:false}],recovery:{fallBelowY:-4,checkpoint:{position:[0,0,7],yaw:Math.PI}}};
compact(town);
const spec=humanoid.createRoadVehicleSpec('motorcycle');spec.id='motorcycle';spec.maxSpeed=12;spec.speed=9;
const bike=new THREE.Group(),physics=spec.wheelPhysics,rigs:{steering:THREE.Group;spin:THREE.Group;radius:number}[]=[];
const bikeColor='#ad7770';
for(const [index,w]of physics.wheels.entries()){const steering=new THREE.Group(),spin=new THREE.Group();steering.position.set(w.x,physics.hubHeight,w.z);const wheel=new THREE.Mesh(new THREE.CylinderGeometry(physics.radius,physics.radius,physics.wheelWidth,16),mat('#59636a'));wheel.rotation.z=Math.PI/2;spin.add(wheel);steering.add(spin);bike.add(steering);rigs.push({steering,spin,radius:physics.radius});box(bike,[.09,.6,.09],[0,.72,w.z],colors.dark);}
box(bike,[.38,.28,1.35],[0,.62,0],bikeColor);box(bike,[.36,.1,.6],[spec.seat[0],spec.seat[1]-.215,spec.seat[2]],colors.dark);box(bike,[.38,.27,.55],[0,.95,.36],bikeColor);box(bike,[.08,.4,.08],[0,1.06,.72],colors.dark);box(bike,[.78,.07,.08],[0,1.26,.72],colors.dark);box(bike,[.75,.06,.13],[0,.47,-.1],colors.dark);
const world=await createHumanoidWorld({scene,camera,canvas,map,characterId:'visitor',characterColor:'#617d87',characterLoadOptions:{loadTextures:false},vehicles:[{instanceId:'motorcycle',assetId:'custom.motorcycle',object:bike,spec}]});
world.setCameraFollow({configuration:parseCameraDocument(cameraData)});
for(const [id,object]of [['fountain',fountain],['harbor-cafe',cafe],['lighthouse',lighthouse]] as const)world.addEntity({id,object,role:'decoration'});
world.setCaptureTargets(['visitor','motorcycle','fountain','harbor-cafe','lighthouse']);
const mechanical={wheelRigs:rigs,steering:rigs.filter((_,i)=>physics.wheels[i]!.steering)};
world.humanoid!.onVisualUpdate((dt,sample)=>{const state=world.humanoid!.simulation.vehicles[0]!;humanoid.updateVehicleWheels(mechanical,sample.vehicles[0]!,{dt,grounded:state.grounded,revision:sample.epoch});});
const help=world.state.define('helpVisible',true);
const readUiState=()=>{const s=world.snapshot(),p=world.getEntityState('visitor'),h=s.humanoid!,position=p.positionWorldMetersXYZ,motion=p.motion?.velocityWorldMetersPerSecondXYZ??[0,0,0];return {place:{name:'海滨小镇',district:position[1]>3?'山坡旧街':position[0]<-18?'海港步道':position[2]<-35?'咖啡馆街':'喷泉广场'},visitor:{mode:h.mountedInstanceId?'骑行':'步行',speed:Math.round((h.mountedInstanceId?h.vehicles[0]!.speedMetersPerSecond:Math.hypot(motion[0],motion[2]))*10)/10},panels:{helpVisible:help.value}};};
await world.start();
Object.assign(window,{__WORLDKIT_STREAM_WORLD__:{world,readUiState,actions:{toggleHelp:()=>help.set(!help.value),recover:async()=>{await world.execute({type:'vehicle.recover',actorId:'visitor'});}}}});
