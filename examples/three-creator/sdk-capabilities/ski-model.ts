import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

/** Reusable equipment only. The SDK samples the named poles against the rider. */
export function buildSkiModel(): Group {
  const root=new Group();root.name='alpine-skis';
  const orange=new MeshStandardMaterial({color:'#e67839',roughness:.8});
  const dark=new MeshStandardMaterial({color:'#303c43',roughness:.9});
  const steel=new MeshStandardMaterial({color:'#abb6bb',roughness:.8});
  for(const [suffix,side] of [['left',1],['right',-1]] as const){
    const ski=new Group();ski.name=`ski.board.${suffix}`;ski.position.x=side*.16;root.add(ski);
    const base=new Mesh(new BoxGeometry(.13,.045,1.65),orange);base.position.set(0,.035,0);ski.add(base);
    const nose=new Mesh(new BoxGeometry(.13,.045,.25),orange);nose.position.set(0,.072,.93);nose.rotation.x=-.3;ski.add(nose);
    for(const z of [-.12,.19]){const binding=new Mesh(new BoxGeometry(.14,.07,.1),dark);binding.position.set(0,.09,z);ski.add(binding);}
    const pole=new Group();pole.name=`ski.pole.${suffix}`;pole.position.set(side*.55,1.05,0);root.add(pole);
    const shaft=new Mesh(new CylinderGeometry(.012,.009,1.1,8),steel);shaft.position.y=-.55;pole.add(shaft);
    const grip=new Mesh(new CylinderGeometry(.025,.025,.13,8),dark);grip.position.y=.025;pole.add(grip);
    const basket=new Mesh(new CylinderGeometry(.05,.05,.012,8),dark);basket.position.y=-1.02;pole.add(basket);
    pole.rotation.x=.35;
  }
  return root;
}
