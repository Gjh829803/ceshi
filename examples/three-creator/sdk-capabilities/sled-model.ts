import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';

/** Shared by the live library and the exported reusable GLB. No runtime owner. */
export function buildSledModel(): Group {
  const root = new Group(); root.name = 'wooden-runner-sled';
  const wood = new MeshStandardMaterial({color:'#b89465',roughness:.85});
  const steel = new MeshStandardMaterial({color:'#7d8b91',roughness:.65,metalness:.15});
  const rope = new MeshStandardMaterial({color:'#655b49',roughness:1});
  const beam = (name:string,a:Vector3,b:Vector3,r:number,mat=steel) => {
    const d=b.clone().sub(a),m=new Mesh(new CylinderGeometry(r,r,d.length(),8),mat);
    m.name=name;m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new Vector3(0,1,0),d.normalize());root.add(m);
  };
  for(const side of [-1,1]) {
    const x=side*.37;
    const points=[new Vector3(x,.055,-.97),new Vector3(x,.035,-.7),new Vector3(x,.035,.65),
      new Vector3(x,.10,.91),new Vector3(x,.29,1),new Vector3(x,.44,.86),new Vector3(x,.45,.65)];
    const runner=new Mesh(new TubeGeometry(new CatmullRomCurve3(points),36,.028,8,false),steel);
    runner.name=side<0?'runner.left':'runner.right';root.add(runner);
    for(const z of [-.65,.4])beam('seat.support',new Vector3(x,.06,z),new Vector3(side*.24,.43,z),.024);
    const cord=new Mesh(new TubeGeometry(new CatmullRomCurve3([
      new Vector3(x,.44,.72),new Vector3(side*.29,.72,.48),new Vector3(side*.22,.84,.3),
    ]),12,.012,6,false),rope);cord.name='steering.rope';root.add(cord);
  }
  for(const z of [-.65,.4])beam('seat.crossbar',new Vector3(-.37,.4,z),new Vector3(.37,.4,z),.026);
  for(let i=0;i<4;i++) {
    const slat=new Mesh(new BoxGeometry(.128,.065,1.34),wood);
    slat.name=`seat.slat.${i}`;slat.position.set((i-1.5)*.145,.455,-.15);root.add(slat);
  }
  beam('nose.crossbar',new Vector3(-.37,.38,.87),new Vector3(.37,.38,.87),.024);
  return root;
}
