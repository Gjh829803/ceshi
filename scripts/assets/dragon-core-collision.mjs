import * as T from 'three';

/** 飞行通行体积只覆盖躯干、颈部和头部；翼尖、长尾、鬃毛不参与硬阻挡。 */
export function measureDragonCore(gltf,id,clipNames){
  const mixer=new T.AnimationMixer(gltf.scene),selections=[],cells=new Map(),point=new T.Vector3();
  gltf.scene.traverse(mesh=>{
    if(!(mesh instanceof T.SkinnedMesh))return;
    const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
    const core=mesh.skeleton.bones.map(b=>/^(Pelvis|Spine\d*|Neck\d*|Head|Jaw)$/i.test(b.name));
    const vertices=[];
    // 独立毛发/羽毛卡片不属于实体身体；保留头部的实体材质分区。
    const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    if(/1003|hair|fur/i.test(material?.name??''))return;
    for(let i=0;i<indices.count;i++){
      let main=0,total=0;
      for(let axis=0;axis<4;axis++){const weight=weights.getComponent(i,axis);total+=weight;if(core[indices.getComponent(i,axis)])main+=weight;}
      if(total>0&&main/total>.65)vertices.push(i);
    }
    selections.push({mesh,vertices});
  });
  const clips=gltf.animations.filter(c=>clipNames?clipNames.includes(c.name):new RegExp(`^${id}_Flight_(Base|Fast|BoostLoop|Hovering)$`).test(c.name));
  for(const clip of clips){
    const action=mixer.clipAction(clip);action.play();
    for(let frame=0;frame<16;frame++){
      mixer.setTime(clip.duration*frame/16);gltf.scene.updateMatrixWorld(true);
      for(const {mesh,vertices} of selections){
        mesh.skeleton.update();
        for(const index of vertices){
          mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld);
          const key=point.toArray().map(v=>Math.floor(v/.2)).join(',');
          if(!cells.has(key))cells.set(key,point.clone());
        }
      }
    }
    action.stop();
  }
  mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
  const points=[...cells.values()];if(!points.length||clips.length<(clipNames?1:3))throw new Error('DRAGON_CORE_GEOMETRY_MISSING:'+id);
  const centers=[points[0]],distances=new Float64Array(points.length).fill(Infinity);
  for(let index=1;index<12;index++){
    const last=centers.at(-1);let farthest=0;
    for(let i=0;i<points.length;i++){distances[i]=Math.min(distances[i],points[i].distanceToSquared(last));if(distances[i]>distances[farthest])farthest=i;}
    if(distances[farthest]<.36)break;
    centers.push(points[farthest]);
  }
  // Lloyd 更新中心可减少靠表面布点造成的空心大球；固定顺序保证可重复准备。
  let groups;
  for(let pass=0;pass<8;pass++){
    groups=centers.map(()=>[]);
    for(const p of points){let nearest=0;for(let i=1;i<centers.length;i++)if(p.distanceToSquared(centers[i])<p.distanceToSquared(centers[nearest]))nearest=i;groups[nearest].push(p);}
    if(pass<7)for(let i=0;i<centers.length;i++)if(groups[i].length)centers[i].copy(groups[i].reduce((sum,p)=>sum.add(p),new T.Vector3()).multiplyScalar(1/groups[i].length));
  }
  if(groups.some(group=>!group.length))throw new Error('DRAGON_CORE_EMPTY_CLUSTER:'+id);
  const probes=centers.map((center,i)=>({id:`${id}-core-${i}`,center:center.toArray().map(v=>+v.toFixed(3)),radius:+(Math.max(...groups[i].map(p=>p.distanceTo(center)))+.2).toFixed(3)}));
  const bounds=new T.Box3();
  for(const p of probes){bounds.expandByPoint(new T.Vector3(...p.center).addScalar(p.radius));bounds.expandByPoint(new T.Vector3(...p.center).addScalar(-p.radius));}
  return {probes,envelope:{kind:'box',halfExtents:bounds.getSize(new T.Vector3()).multiplyScalar(.5).toArray(),offset:bounds.getCenter(new T.Vector3()).toArray()},
    measurement:{policy:'torso-neck-head; wing/tail tips and hair are non-blocking',clips:clips.map(c=>c.name),framesPerClip:16,marginMeters:.2,coreVertices:selections.reduce((n,s)=>n+s.vertices.length,0)}};
}
