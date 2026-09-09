import * as T from 'three';
/** Functional single-person bubble cockpit; no additional rider or animation owner. */
export function buildSubmersibleModel(){
 const root=new T.Group();root.name='observation-sub';
 const yellow=new T.MeshStandardMaterial({color:'#d4ad38',roughness:.8}),dark=new T.MeshStandardMaterial({color:'#34424b',roughness:.9});
 const glass=new T.MeshStandardMaterial({color:'#b8e1ed',transparent:true,opacity:.16,roughness:.3,side:T.DoubleSide,depthWrite:false});
 const ellipsoid=(name:string,p:[number,number,number],scale:[number,number,number],mat:T.Material)=>{const m=new T.Mesh(new T.SphereGeometry(1,32,20),mat);m.name=name;m.position.set(...p);m.scale.set(...scale);root.add(m);return m;};
 const box=(parent:T.Object3D,name:string,size:[number,number,number],p:[number,number,number],mat:T.Material=dark)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.name=name;m.position.set(...p);parent.add(m);return m;};
 ellipsoid('pressure.cabin',[0,.35,.2],[1,1.1,1.1],glass);
 ellipsoid('rear.ballast',[0,.32,-.68],[1.01,1.09,.45],yellow);
 ellipsoid('lower.ballast',[0,-.56,.12],[.94,.22,1.13],yellow);
 const ring=new T.Mesh(new T.TorusGeometry(1,.055,8,48),dark);ring.scale.set(1,1.1,1);ring.position.set(0,.35,.19);root.add(ring);
 box(root,'seat.cushion',[.57,.10,.58],[0,.09,.25]);box(root,'seat.back',[.58,.60,.08],[0,.36,-.07]);
 box(root,'cabin.floor',[.75,.06,1.05],[0,-.36,.39]);
 for(const side of [-1,1]){
  box(root,'seat.armrest',[.10,.07,.43],[side*.35,.41,.32]);box(root,'joystick',[.04,.19,.04],[side*.29,.51,.50]);
  const shroud=new T.Mesh(new T.TorusGeometry(.28,.06,8,24),yellow);shroud.position.set(side*1.23,-.15,-.67);root.add(shroud);
  const motor=ellipsoid('thruster.motor',[side*1.23,-.15,-.56],[.16,.16,.20],dark);
  const rotor=new T.Group();rotor.name=`submersible.rotor.${side}`;rotor.position.set(side*1.23,-.15,-.74);root.add(rotor);
  box(rotor,'propeller',[.46,.055,.045],[0,0,0]);box(rotor,'propeller',[.055,.46,.045],[0,0,0]);
  ellipsoid('headlight',[side*.71,-.35,1.0],[.15,.15,.12],new T.MeshBasicMaterial({color:'#fff4cf'}));
  box(root,'landing.skid',[.10,.12,1.95],[side*.67,-.86,.05]);
 }
 box(root,'top.hatch',[.64,.12,.52],[0,1.41,-.27],yellow);
 return root;
}
