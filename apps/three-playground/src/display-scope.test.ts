import * as T from 'three';
import {describe,expect,it} from 'vitest';
import {createWorld} from '@worldkit/three';
import {getMap} from '../../../shared/preset-content/environment/maps';
import {createDisplayOverlays} from './display-overlays';
import {defaultDisplaySettings,resolveDisplaySettings,isolateDisplaySelection,exitDisplayIsolation,applyDisplayPreset} from './display-settings';
import {createDisplayScene} from './display-scene';
import {buildDisplayCatalog,resolveDisplayColliderId} from './display-catalog';

describe('object and physical helper scope',()=>{
  it('follows real pickup and loose-crate bindings after a world reset',async()=>{
    const scene=new T.Scene(),map={...getMap('campus'),looseCrates:[{id:'loose-test',position:[5,1,5] as const,size:1}]};
    const world=await createWorld({scene,camera:new T.PerspectiveCamera(),assetDefinitions:{},navigation:false,humanoid:{map,character:{instanceId:'person',object:new T.Group()},vehicles:[]}});
    const runtime=world.humanoid!;
    const verify=()=>{
      const h=runtime.simulation.humanoid!;
      const owner=(handle:number)=>resolveDisplayColliderId(h,handle=>runtime.environment.colliderId(handle),handle);
      const target=[...h.skills.targets.values()].find(t=>t.collider?.isEnabled())!;
      expect(target).toBeDefined();expect(owner(target.collider!.handle)).toBe(target.definition.id);
      expect(h.crates.length).toBe(1);
      for(const [n,crate] of h.crates.entries())for(let c=0;c<crate.body.numColliders();c++)expect(owner(crate.body.collider(c).handle)).toBe('crate:'+n);
      const object=new T.Group(),context={roots:[{id:target.definition.id,object,type:'interaction' as const}],subjects:[object]};
      const overlay=createDisplayOverlays(scene,()=>({physics:h,map,targets:[],colliderId:owner}));
      try{overlay.update(resolveDisplaySettings({...defaultDisplaySettings(),scope:'selected',selectedIds:[target.definition.id],colliders:'all'}),context);
        expect((scene.getObjectByName('playground-all-colliders') as T.LineSegments).geometry.getAttribute('position').count).toBeGreaterThan(0);
      }finally{overlay.dispose();}
    };
    try{verify();runtime.simulation.reset();verify();}finally{world.dispose();}
  });
  it('isolates a nested selected object and restores prior visibility without changing its parent or camera',()=>{
    const scene=new T.Scene(),group=new T.Group(),left=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()),right=left.clone();
    group.add(left,right);scene.add(group);
    const context={roots:[{id:'group',object:group,type:'environment' as const},{id:'left',object:left,type:'environment' as const},{id:'right',object:right,type:'environment' as const}],subjects:[left]};
    const original={...defaultDisplaySettings(),scope:'subject' as const,selectedIds:['right'],hiddenIds:['right']};
    const settings=isolateDisplaySelection(original),preview=createDisplayScene(scene);
    try{
      preview.render(resolveDisplaySettings(settings),context,()=>{expect(left.visible).toBe(false);expect(right.visible).toBe(true);});
      expect(left.visible).toBe(true);expect(right.parent).toBe(group);
      expect(exitDisplayIsolation(settings)).toMatchObject({scope:'subject',hiddenIds:['right']});
      expect(original.hiddenIds).toEqual(['right']);
      expect(applyDisplayPreset(original,'collision')).toMatchObject({mode:'material',scope:'selected',colliderScope:'nearby',colliders:'all'});
    }finally{preview.dispose();}
  });
  it('follows actual collider IDs, expands explicitly to nearby shapes and preserves physics and source visibility',async()=>{
    const map={...getMap('campus'),id:'scope-test',water:[],interactions:[],climbSurfaces:[],boxes:[
      {id:'selected',position:[0,1,0] as const,size:[1,2,1] as const},
      {id:'near',position:[2,1,0] as const,size:[1,2,1] as const},
      {id:'far',position:[30,1,0] as const,size:[1,2,1] as const},
    ]};
    const scene=new T.Scene(),actor=new T.Group(),selected=new T.Mesh(new T.BoxGeometry(1,2,1),new T.MeshBasicMaterial());selected.position.set(0,1,0);scene.add(selected);
    const world=await createWorld({scene,camera:new T.PerspectiveCamera(),assetDefinitions:{},navigation:false,humanoid:{map,character:{instanceId:'person',object:actor},vehicles:[]}});
    const h=world.humanoid!.simulation.humanoid!,environment=world.humanoid!.environment;
    const owner=(handle:number)=>h.capsule.handle===handle?'person':environment.colliderId(handle);
    const overlay=createDisplayOverlays(scene,()=>({physics:h,map,targets:[],colliderId:owner,colliderDistance:(handle,centers)=>{
      const c=h.world.getCollider(handle);return centers.reduce((d,p)=>Math.min(d,p.distanceTo(new T.Vector3().copy(c.projectPoint(p,true)!.point))),Infinity);
    }}));
    const settings={...defaultDisplaySettings(),scope:'selected' as const,selectedIds:['selected'],hiddenIds:['selected'],colliders:'all' as const};
    const context={roots:[{id:'selected',object:selected,type:'environment' as const}],subjects:[actor]};
    const positions=()=>Array.from((scene.getObjectByName('playground-all-colliders') as T.LineSegments).geometry.getAttribute('position').array);
    const before=world.snapshot(),count=h.world.colliders.len();
    try{
      overlay.update(resolveDisplaySettings(settings),context);
      expect(positions()).toEqual(Array.from(h.world.debugRender(undefined,c=>owner(c.handle)==='selected').vertices));
      expect(positions().length).toBeGreaterThan(0);
      overlay.update(resolveDisplaySettings({...settings,colliderScope:'nearby',nearbyMeters:3}),context);
      const near=positions();expect(near.length).toBeGreaterThan(24);expect(Math.max(...near.filter((_,i)=>i%3===0))).toBeLessThan(10);
      overlay.update(resolveDisplaySettings({...settings,colliderScope:'all'}),context);expect(positions().length).toBeGreaterThan(near.length);
      expect(world.snapshot().simulationTick).toBe(before.simulationTick);expect(h.world.colliders.len()).toBe(count);expect(selected.visible).toBe(true);expect(overlay.root.visible).toBe(false);
    }finally{overlay.dispose();world.dispose();}
  });
  it('adapts actual object roots and declared water identities without listing bones',()=>{
    const scene=new T.Scene(),environment=new T.Group(),person=new T.Group(),water=new T.Mesh();water.name='water:pool';environment.add(water);person.add(new T.Bone());scene.add(environment,person);
    const map={...getMap('campus'),water:[{id:'pool',min:[0,-2,0] as const,max:[5,0,5] as const,surface:0}],boxes:[]};
    const result=buildDisplayCatalog({scene,environment,person,map,vehicles:[],colliderIds:new Set(['person'])});
    expect(result.rows.map(r=>r.id)).toEqual(['person','map:'+map.id,'water:pool']);expect(result.rows[0]!.hasCollider).toBe(true);
    expect(result.context.roots.find(r=>r.id==='water:pool')!.object).toBe(water);
  });
});
