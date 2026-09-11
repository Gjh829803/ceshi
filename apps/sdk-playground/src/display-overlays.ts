import * as T from 'three';
import {createCollisionDebug} from '@worldkit/preset-content/humanoid/capsule-debug';
import type {EnvironmentDefinition} from '@worldkit/preset-content/environment/types';
import type {humanoid} from '@worldkit/three';
import type {DisplayRenderSettings} from './display-settings';
import {resolveDisplayScope,type DisplayContext} from './display-context';

type PhysicsSource=Parameters<ReturnType<typeof createCollisionDebug>['update']>[0];
export type DisplayInteractionTarget=humanoid.InteractionVisualTarget&{ownerIds?:readonly string[]};
export function createDisplayOverlays(scene:T.Scene,read:()=>{physics:PhysicsSource;map:EnvironmentDefinition;targets:readonly DisplayInteractionTarget[];
  colliderId?:(handle:number)=>string;colliderDistance?:(handle:number,centers:readonly T.Vector3[])=>number}) {
  const root=new T.Group();root.name='display-diagnostics';root.visible=false;scene.add(root);
  let colliderOwner:((handle:number)=>string)|undefined;
  const collisions=createCollisionDebug(scene,handle=>colliderOwner?.(handle));root.add(collisions.person.mesh,collisions.all);
  const waters=new T.Group(),climbs=new T.Group(),anchors=new T.Group();root.add(waters,climbs,anchors);
  const unitBox=new T.BoxGeometry(1,1,1),boxEdges=new T.EdgesGeometry(unitBox);unitBox.dispose();
  const sphere=new T.SphereGeometry(.13,8,6),sphereEdges=new T.EdgesGeometry(sphere);sphere.dispose();
  const waterMaterial=new T.LineBasicMaterial({color:'#65a9f3',transparent:true}),climbMaterial=new T.LineBasicMaterial({color:'#69cbaa',transparent:true}),anchorMaterial=new T.LineBasicMaterial({color:'#f4b860',transparent:true});
  let previousMap:EnvironmentDefinition|undefined;
  const markers=new Map<string,T.LineSegments>();
  function rebuild(map:EnvironmentDefinition) {
    previousMap=map;waters.clear();climbs.clear();
    for(const volume of map.water) {
      const shape=new T.LineSegments(boxEdges,waterMaterial);shape.name='water:'+volume.id;shape.userData.ownerId=shape.name;
      shape.position.set((volume.min[0]+volume.max[0])/2,(volume.min[1]+volume.surface)/2,(volume.min[2]+volume.max[2])/2);
      shape.scale.set(volume.max[0]-volume.min[0],Math.max(.01,volume.surface-volume.min[1]),volume.max[2]-volume.min[2]);waters.add(shape);
    }
    for(const surface of map.climbSurfaces??[]) {
      if(!map.boxes.some(b=>b.id===surface.colliderId&&b.collision!==false))continue;
      const shape=new T.LineSegments(boxEdges,climbMaterial);shape.name='climb:'+surface.id;shape.userData.ownerId=surface.colliderId;
      shape.position.set(surface.center[0],(surface.minY+surface.maxY)/2,surface.center[2]);
      const normal=new T.Vector3(...surface.normal);if(normal.lengthSq()>0)shape.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal.normalize());
      shape.scale.set(surface.width,surface.maxY-surface.minY,.035);climbs.add(shape);
    }
  }
  return {root,
    update(settings:DisplayRenderSettings,context:DisplayContext={roots:[],subjects:[]}) {
      const data=read(),{physics,map,targets}=data;
      colliderOwner=data.colliderId;
      const scope=resolveDisplayScope({...settings,mode:'material'},context);
      const colliderScope=settings.colliderScope==='nearby'&&settings.scope==='all'?resolveDisplayScope({...settings,mode:'material',scope:'subject'},context):scope;
      const matches=(id:string)=>scope.ids===null||scope.ids.has(id);
      const selectedHandles=new Set<number>();
      const needsFilter=settings.colliderScope!=='all'&&colliderScope.ids!==null;
      if(needsFilter&&settings.colliders!=='off'&&physics)physics.world.forEachCollider(c=>{
        const id=data.colliderId?.(c.handle)??'collider-'+c.handle;
        if(colliderScope.ids?.has(id)||settings.colliderScope==='nearby'&&(data.colliderDistance?.(c.handle,colliderScope.centers)??Infinity)<=settings.nearbyMeters)selectedHandles.add(c.handle);
      });
      // The person-only display selects the actual capsule.
      collisions.update(physics,settings.colliders,map.boxes,settings.ground,needsFilter?c=>selectedHandles.has(c.handle):undefined);
      if(settings.colliders==='person'&&needsFilter&&physics) {
        const capsule=physics.capsule as typeof physics.capsule&{handle:number};
        collisions.person.mesh.visible=collisions.person.mesh.visible&&selectedHandles.has(capsule.handle);
      }
      if(previousMap!==map)rebuild(map);
      waters.visible=settings.water;climbs.visible=settings.climbSurfaces;anchors.visible=settings.anchors;
      for(const group of [waters,climbs])for(const shape of group.children)shape.visible=matches(shape.userData.ownerId as string);
      if(settings.anchors) {
        const ids=new Set<string>();
        for(const target of targets) {
          if(target.state==='removed')continue;ids.add(target.id);
          let marker=markers.get(target.id);if(!marker){marker=new T.LineSegments(sphereEdges,anchorMaterial);marker.name='anchor:'+target.id;anchors.add(marker);markers.set(target.id,marker);}
          marker.position.copy(target.position);
          const authored=map.interactions?.find(a=>a.id===target.id);
          marker.visible=matches(target.id)||(target.ownerIds?.some(matches)??false)||(authored?.colliderIds?.some(matches)??false);
        }
        for(const [id,marker]of markers)if(!ids.has(id)){marker.removeFromParent();markers.delete(id);}
      }
      for(const material of [waterMaterial,climbMaterial,anchorMaterial,collisions.person.mesh.material,collisions.all.material as T.LineBasicMaterial]){
        material.opacity=settings.opacity;material.depthTest=!settings.xray;material.depthWrite=false;
      }
    },
    dispose(){collisions.dispose();root.removeFromParent();root.clear();markers.clear();boxEdges.dispose();sphereEdges.dispose();waterMaterial.dispose();climbMaterial.dispose();anchorMaterial.dispose();}
  };
}
