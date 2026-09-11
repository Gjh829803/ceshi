import {describe, expect, it} from 'vitest';
import {defaultDisplaySettings, resetDisplaySection, resolveDisplaySettings} from './display-settings';
import {createDisplayOverlays} from './display-overlays';
import * as T from 'three';
import {getMap} from '@worldkit/preset-content/environment/maps';

describe('independent display controls', () => {
  it('resets only the requested section and keeps the selected picture behind helper-only viewing', () => {
    const s = {...defaultDisplaySettings(), mode:'depth' as const, depthFar:25, types:['person' as const], scope:'subject' as const, anchors:true, water:true, helperOnly:'collision' as const};
    expect(resetDisplaySection(s,'objects')).toMatchObject({mode:'depth',depthFar:25,scope:'all',anchors:true,water:true,helperOnly:'collision'});
    expect(resetDisplaySection(s,'picture')).toMatchObject({mode:'material',types:['person'],scope:'subject' as const,anchors:true,helperOnly:'collision'});
    const reset = resetDisplaySection(s,'helpers');
    expect(reset).toMatchObject({mode:'depth',depthFar:25,types:['person'],scope:'subject' as const,anchors:false,water:false,helperOnly:'none'});
    expect(resolveDisplaySettings(s).mode).toBe('collision');
    expect(resolveDisplaySettings({...s,helperOnly:'none'}).mode).toBe('depth');
    expect(s.mode).toBe('depth');
  });
  it('shows only the chosen helper without discarding other saved helper preferences', () => {
    const s = {...defaultDisplaySettings(), colliders:'person' as const, anchors:true, climbSurfaces:true, water:true, wireframe:true,helperOnly:'wireframe' as const};
    expect(resolveDisplaySettings(s)).toMatchObject({mode:'wireframe',colliders:'off',anchors:false,climbSurfaces:false,water:false,wireframe:false});
    expect(resolveDisplaySettings({...s,helperOnly:'none'})).toMatchObject({mode:'material',colliders:'person',anchors:true,climbSurfaces:true,water:true,wireframe:true});
  });
  it('toggles anchor, climb and water geometry independently', () => {
    const scene = new T.Scene(), map = {...getMap('campus'), boxes:[{id:'wall',position:[0,1,0] as const,size:[2,2,1] as const}], climbSurfaces:[{id:'wall-top',colliderId:'wall',kind:'wall' as const,center:[0,1,0] as [number,number,number],normal:[0,0,1] as [number,number,number],width:2,minY:0,maxY:2}]};
    const overlay = createDisplayOverlays(scene,()=>({physics:undefined,map,targets:[{id:'seat',kind:'seat',slotId:'seat',position:new T.Vector3(),state:'available'}]}));
    const visible = (name:string) => {let o:T.Object3D|null=scene.getObjectByName(name)??null; if(!o)return false;while(o&&o!==overlay.root){if(!o.visible)return false;o=o.parent;}return true;};
    try {
      overlay.update(resolveDisplaySettings({...defaultDisplaySettings(),anchors:true}));
      expect(visible('anchor:seat')).toBe(true);expect(visible('climb:wall-top')).toBe(false);
      overlay.update(resolveDisplaySettings({...defaultDisplaySettings(),water:true,climbSurfaces:true}));
      expect(visible('anchor:seat')).toBe(false);expect(visible('climb:wall-top')).toBe(true);expect(visible(`water:${map.water[0]!.id}`)).toBe(true);
      expect(overlay.root.visible).toBe(false);
    } finally {overlay.dispose();}
  });
});
