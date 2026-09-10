import * as T from 'three';
import {buildCanoeModel} from './canoe-model';
import {RAFT_SOCKETS} from './raft';
import {humanoid} from '@worldkit/three';
export function buildRaftModel(){
 const donor=buildCanoeModel(),root=new T.Group();root.name='inflatable-boat';
 const rubber=new T.MeshStandardMaterial({color:'#343b40',roughness:1}),dark=new T.MeshStandardMaterial({color:'#171e22',roughness:1});
 const box=(name:string,size:[number,number,number],pos:[number,number,number])=>{const m=new T.Mesh(new T.BoxGeometry(...size),dark);m.name=name;m.position.set(...pos);root.add(m);return m;};
 box('raft.foot-brace',[.50,.05,.20],[0,.28,.51]);
 box('raft.floor',[1.15,.10,3.5],[0,-.09,0]);
 const tubes=new T.Group();tubes.name='raft.tubes';root.add(tubes);
 const points=[[-.6,-1.4],[-.6,.8],[-.48,1.65],[0,1.90],[.48,1.65],[.6,.8],[.6,-1.4],[0,-1.9]].map(([x,z])=>new T.Vector3(x!,-.12,z!));
 tubes.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points,true,'centripetal'),64,.22,12,true),rubber));
 for(const z of [-1.25,-.45,.85])box('raft.bench',[1.12,.065,.26],[0,.285,z]);
 // Keep the original paddle rig, including pure water-contact ripples.
 for(const node of [...donor.children])if(node.name==='kayak.paddle'||node.name.startsWith('kayak.ripple')||node.name.startsWith('kayak.wake'))root.add(node);
 const paddle=root.getObjectByName('kayak.paddle')!;paddle.traverse(node=>{if(node instanceof T.Mesh)node.material=dark;});
 for(const [name,side] of [['control.hand.left',1],['control.hand.right',-1]] as const){const socket=new T.Group();socket.name=name;socket.position.copy(humanoid.paddleGrip({...humanoid.createKayakState(),craft:'canoe',side:-1},side));paddle.add(socket);}
 for(const [name,pos] of Object.entries(RAFT_SOCKETS)){const node=new T.Group();node.name=name;node.position.set(...pos);root.add(node);}
 return root;
}
