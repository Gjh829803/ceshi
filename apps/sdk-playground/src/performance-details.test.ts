import {afterEach, expect, it, vi} from 'vitest';
import type {WebGLRenderer, Scene, Camera} from 'three';
import type {ThreeWorld, WorldFrameTiming} from '@worldkit/three';
import {PerformanceDetailsMonitor} from './performance-details';

const disposals:(()=>void)[]=[];
afterEach(()=>{for(const dispose of disposals.splice(0))dispose();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(supported=true) {
  vi.useFakeTimers();let clock=100, callback:((sample:WorldFrameTiming)=>void)|undefined;
  vi.spyOn(performance,'now').mockImplementation(()=>clock);
  const document=Object.assign(new EventTarget(),{hidden:false});vi.stubGlobal('document',document);
  const state={available:false,disjoint:false,lost:false};
  const gl={drawingBufferWidth:1200,drawingBufferHeight:800,QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,CURRENT_QUERY:3,
    getExtension:()=>supported?{TIME_ELAPSED_EXT:4,GPU_DISJOINT_EXT:5}:null,
    isContextLost:()=>state.lost,getParameter:()=>state.disjoint,getQuery:()=>null,
    createQuery:vi.fn(()=>({})),deleteQuery:vi.fn(),beginQuery:vi.fn(),endQuery:vi.fn(),
    getQueryParameter:vi.fn((_q:unknown,key:number)=>key===1?state.available:2_500_000),
  };
  const render=vi.fn(()=>{clock+=3;});
  const renderer={domElement:new EventTarget(),getContext:()=>gl,getPixelRatio:()=>1.5,getRenderTarget:()=>null,render} as unknown as WebGLRenderer;
  const world={onFrameTiming:(fn:typeof callback)=>{callback=fn;return()=>{callback=undefined;};}} as unknown as ThreeWorld;
  const scene={} as Scene,camera={} as Camera,monitor=new PerformanceDetailsMonitor();
  monitor.attach(renderer,world,scene,camera);disposals.push(()=>monitor.dispose());
  const frame=()=>{renderer.render(scene,camera);callback?.({source:'realtime',simulationTick:1,sampledAtMilliseconds:clock,cpuUpdateMilliseconds:4});};
  const publish=(ms=500)=>{clock+=ms;vi.advanceTimersByTime(ms);};
  return {monitor,renderer,render,gl,state,document,frame,publish,scene,camera};
}
it('samples only when expanded, excludes other cameras and restores the renderer on close',()=>{
  const f=fixture(false);expect(f.renderer.render).toBe(f.render);
  f.monitor.setEnabled(true);f.renderer.render(f.scene,{} as Camera);f.frame();f.publish();
  expect(f.monitor.getSnapshot()).toMatchObject({width:1200,height:800,pixelRatio:1.5,cpuUpdate:4,cpuSubmit:3,gpu:null,gpuStatus:'unsupported',status:'live'});
  expect(f.gl.createQuery).not.toHaveBeenCalled();
  f.monitor.setEnabled(false);expect(f.renderer.render).toBe(f.render);expect(f.monitor.getSnapshot()).toBeNull();
  f.monitor.setEnabled(true);expect(f.monitor.getSnapshot()?.cpuUpdate).toBeNull();
});
it('reads GPU time asynchronously, rejects disjoint samples and releases outstanding queries',()=>{
  const f=fixture();f.monitor.setEnabled(true);f.frame();f.frame();
  expect(f.gl.createQuery).toHaveBeenCalledTimes(1);
  expect(f.gl.getQueryParameter.mock.calls.every(([,key])=>key===1)).toBe(true);
  f.state.available=true;f.frame();f.publish();expect(f.monitor.getSnapshot()?.gpu).toBe(2.5);
  f.state.disjoint=true;f.frame();f.publish();
  expect(f.monitor.getSnapshot()).toMatchObject({gpu:null,gpuStatus:'invalid'});
  f.state.disjoint=false;f.state.available=false;f.frame();
  const before=f.gl.deleteQuery.mock.calls.length;f.monitor.setEnabled(false);
  expect(f.gl.deleteQuery.mock.calls.length).toBe(before+1);
});
it('clears stale timing on pause, background and context loss without preventing rendering',()=>{
  const f=fixture();f.monitor.setEnabled(true);f.frame();f.publish();f.publish(2000);
  expect(f.monitor.getSnapshot()).toMatchObject({status:'idle',cpuUpdate:null,cpuSubmit:null,gpu:null});
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));f.frame();f.publish();
  expect(f.monitor.getSnapshot()).toMatchObject({status:'hidden',cpuUpdate:null,gpu:null});
  f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));f.state.lost=true;f.frame();f.publish();
  expect(f.monitor.getSnapshot()).toMatchObject({status:'live',gpuStatus:'lost',gpu:null});
  f.renderer.domElement.dispatchEvent(new Event('webglcontextlost'));
  f.state.lost=false;f.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
  expect(f.monitor.getSnapshot()).toMatchObject({gpuStatus:'pending',gpu:null});
  expect(f.render).toHaveBeenCalledTimes(3);
});
