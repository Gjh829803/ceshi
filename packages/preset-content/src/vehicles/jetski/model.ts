import * as T from 'three';
import {JETSKI_SOCKETS} from './spec';
/** V bow, narrow straddle saddle and open foot wells fitted to the supplied rider. */
export function buildJetSkiModel():T.Group{
 const root=new T.Group();root.name='jet-ski';
 const dark=new T.MeshStandardMaterial({color:'#252c33',roughness:1}),gray=new T.MeshStandardMaterial({color:'#606a73',roughness:1}),lime=new T.MeshStandardMaterial({color:'#bad43e',roughness:1});
 const box=(parent:T.Object3D,name:string,size:[number,number,number],p:[number,number,number],mat:T.Material=dark)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.name=name;m.position.set(...p);parent.add(m);return m;};
 // Cross sections form a closed faceted hull, with the upper deck below the rider's feet.
 const sections=[[-1.55,.45,-.13,.17],[-.8,.68,-.30,.22],[.45,.68,-.28,.24],[1.2,.43,-.12,.52],[1.6,.035,.18,.46]];
 const points:number[]=[];for(const [z,w,b,t] of sections as [number,number,number,number][])points.push(-w,t,z,w,t,z,w*.7,b,z,-w*.7,b,z);
 const indices:number[]=[];for(let s=0;s<sections.length-1;s++)for(let n=0;n<4;n++){const a=s*4+n,b=s*4+(n+1)%4,c=(s+1)*4+n,d=(s+1)*4+(n+1)%4;indices.push(a,c,b,b,c,d);}
 indices.push(0,1,2,0,2,3,16,18,17,16,19,18);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const hull=new T.Mesh(geometry,gray);hull.name='body.hull';root.add(hull);
 box(root,'body.spine',[.23,.43,1.52],[0,.53,-.38]);box(root,'seat.cushion',[.27,.09,1.1],[0,.82,-.50]);
 const hood=box(root,'body.console',[.48,.25,.56],[0,.68,.58]);hood.rotation.x=-.20;
 const accent=box(root,'bow.accent',[.29,.025,.68],[0,.57,1.03],lime);accent.rotation.x=-.28;
 box(root,'console.accent',[.38,.03,.22],[0,.81,.53],lime);
 for(const side of [-1,1]){box(root,'foot.platform',[.26,.035,.55],[side*.42,.233,-.035]);box(root,'rear.accent',[.12,.025,.62],[side*.50,.24,-.97],lime);}
 box(root,'rear.deck',[.92,.035,.32],[0,.21,-1.34]);
 const stem=box(root,'handlebar.stem',[.05,.48,.05],[0,1.04,.12],gray);
 const bar=new T.Group();bar.name='jetski.handlebar';bar.position.set(0,1.285,.12);root.add(bar);
 box(bar,'handlebar.cross',[.70,.045,.045],[0,0,0],gray);
 for(const side of [-1,1]){const socket=new T.Group();socket.name=side===1?'control.hand.left':'control.hand.right';socket.position.set(side*.29,0,0);bar.add(socket);box(socket,'grip',[.13,.065,.065],[0,0,0]);}
 const nozzle=new T.Group();nozzle.name='jetski.nozzle';nozzle.position.set(0,-.02,-1.45);root.add(nozzle);box(nozzle,'jet.outlet',[.24,.18,.23],[0,0,-.06]);
 for(const [name,p] of Object.entries(JETSKI_SOCKETS)){const socket=new T.Group();socket.name=name;socket.position.set(...p);root.add(socket);}
 return root;
}
