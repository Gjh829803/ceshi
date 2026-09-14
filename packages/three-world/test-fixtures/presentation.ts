import * as THREE from 'three';
import { createWorld } from '../src/index.js';

export async function bootPresentationFixture() {
 document.body.innerHTML=`<style>
 body{margin:0;background:#101c2b;color:#e7edf5;font:16px system-ui}main{padding:24px;max-width:1000px;margin:auto}
 h1{font-size:24px}p{color:#b5c5d6}.viewport{position:relative;width:800px;height:450px;max-width:100%;background:#070e18}
 #world{display:block;width:100%;height:100%}button,input{font:inherit;padding:8px;border-radius:5px;border:0}button{cursor:pointer}
 #hud{position:absolute;top:16px;left:16px;background:#ff00ff;color:#000;padding:18px;font-weight:700;min-width:180px}
 #controls{position:absolute;bottom:14px;left:14px;right:14px;display:flex;gap:8px;align-items:center}#prompt{width:200px}
 #anchor{background:#0d1725df;border:1px solid #9bdaff;border-radius:6px;padding:4px 10px;white-space:nowrap}
 #mapping{position:absolute;top:16px;right:16px;background:#101c2be0;padding:9px;font-size:12px;max-width:200px}
 .actions{display:flex;gap:10px;margin:16px 0}
 </style><main><h1>世界画面与 UI 分层验证</h1><p>本地 SDK 演示 · 蓝色画面是测试输出，没有调用视频模型。</p>
 <div class="viewport"><canvas id="world" width="800" height="450"></canvas></div>
 <div class="actions"><button id="raw">原始世界</button><button id="frame">显示映射测试帧</button><button id="stream">显示无映射测试视频</button></div>
 <p>WASD 移动 · Shift 奔跑 · 方向键转镜头 · 拖动旋转。输入框获得焦点时，游戏停止接收按键。</p>
 <p>粉色 HUD 和人物标签属于独立 UI；无映射视频会隐藏它们。底部即时控件保持可用。</p></main>`;
 const canvas=document.querySelector<HTMLCanvasElement>('#world')!;
 // A caller-owned renderer without preserveDrawingBuffer also exercises the capture path.
 const renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:false});renderer.setSize(800,450,false);
 const camera=new THREE.PerspectiveCamera(55,800/450,.05,200);camera.position.set(5,4,9);camera.lookAt(0,1,0);
 const world=await createWorld({renderer,camera,navigation:false,assetDefinitions:{}});
 world.scene.background=new THREE.Color('#6c9aac');
 const ground=new THREE.Mesh(new THREE.BoxGeometry(60,.5,60),new THREE.MeshBasicMaterial({color:'#87a584'}));ground.position.y=-.25;world.addEntity({id:'ground',role:'terrain',object:ground});
 const wall=new THREE.Mesh(new THREE.BoxGeometry(9,3,.5),new THREE.MeshBasicMaterial({color:'#d9c89d'}));wall.position.set(0,1.5,-6);world.addEntity({id:'wall',role:'obstacle',object:wall});
 const hero=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.3,1.1),new THREE.MeshBasicMaterial({color:'#ffb342'}));body.position.y=.85;hero.add(body);
 world.addCharacter({id:'hero',object:hero,body:{heightMeters:1.8,radiusMeters:.3}});world.setControlledEntity('hero');world.setCameraFollow({configuration:{kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'hero'},activation:'on-input',views:{'third-person':{kind:'third-person',overrides:{framing:{kind:'preserve-opening'}}}}}});
 const health=world.state.define('health',100);
 let presentation=world.createPresentation({historyFrames:3});
 const hud=document.createElement('div');hud.id='hud';
 presentation.ui.bind({id:'health',element:hud,read:()=>health.value,render:value=>{hud.textContent=`生命 ${value} · UI ONLY`;}});
 const anchor=document.createElement('div');anchor.id='anchor';anchor.textContent='探索者 · UI ONLY';presentation.ui.anchor({id:'hero',entityId:'hero',element:anchor,offsetLocalMetersXYZ:[0,2.1,0]});
 const controls=document.createElement('div');controls.id='controls';controls.innerHTML='<input id="prompt" placeholder="输入世界控制指令"><button id="damage">测试扣除生命</button><button id="reset">重置</button><span id="live"></span>';
 presentation.ui.mount(controls);
 const live=controls.querySelector<HTMLSpanElement>('#live')!;
 // A live label is independently mounted; selectors share the authoritative StateHandle.
 presentation.ui.bind({id:'live',element:live,clock:'live',read:()=>health.value,render:value=>{live.textContent=`即时状态 ${value}`;live.style.cssText='position:absolute;bottom:65px;left:16px';}});
 controls.querySelector('#damage')!.addEventListener('click',()=>health.set(health.value-10));
 controls.querySelector('#reset')!.addEventListener('click',()=>void world.reset());
 const mapping=document.createElement('div');mapping.id='mapping';
 presentation.ui.bind({id:'mapping',element:mapping,clock:'live',read:()=>{const s=presentation.status();return {mode:s.mode,synchronization:s.synchronization};},render:s=>{mapping.textContent=`显示：${s.mode} / ${s.synchronization}`;}});
 const output=document.createElement('canvas');output.width=800;output.height=450;
 const ctx=output.getContext('2d')!;ctx.fillStyle='#15375c';ctx.fillRect(0,0,800,450);ctx.fillStyle='#3894b0';ctx.fillRect(220,100,360,260);ctx.fillStyle='#cbe8ef';ctx.font='22px system-ui';ctx.fillText('LOCAL TEST OUTPUT',260,225);
 const packets:Awaited<ReturnType<typeof presentation.modelInput.captureFrame>>[]=[];
 const capture=async()=>{const frame=await presentation.modelInput.captureFrame();packets.push(frame);return frame;};
 const modelStreams:MediaStream[]=[];const modelIntervals:ReturnType<typeof setInterval>[]=[];
 // Independent synthetic video producer for this local fixture, not a gameplay loop.
 const makeOutputStream=()=>{const stream=output.captureStream(15);modelStreams.push(stream);let pulse=0;
  modelIntervals.push(setInterval(()=>{ctx.fillStyle=pulse++%2?'#15375c':'#16375c';ctx.fillRect(0,0,1,1);},50));return stream;};
 document.querySelector('#raw')!.addEventListener('click',()=>presentation.output.showWorld());
 document.querySelector('#frame')!.addEventListener('click',()=>void (async()=>{const packet=await capture();presentation.output.presentFrame({source:packet.source,image:output});})());
 document.querySelector('#stream')!.addEventListener('click',()=>{presentation.output.attachStream(makeOutputStream());});
 await world.start();world.render();
 const fixture={world,renderer,camera,hero,health,presentation,canvas,hud,anchor,live,output,packets,capture,modelStreams,makeOutputStream,
  recreate:()=>{presentation.dispose();presentation=world.createPresentation();fixture.presentation=presentation;return presentation;},
  dispose:()=>{for(const interval of modelIntervals)clearInterval(interval);world.dispose();renderer.dispose();for(const packet of packets)packet.image.close();for(const stream of modelStreams)for(const track of stream.getTracks())track.stop();},
 };
 Object.assign(window,{presentationFixture:fixture});return fixture;
}
void bootPresentationFixture();
