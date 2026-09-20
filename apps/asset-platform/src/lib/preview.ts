import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import type { RegistryClient } from '@worldkit/asset-client';
import type { AssetManifest, Resource } from '@worldkit/asset-contracts';

export interface ClipOption { name: string; duration: number; embedded?: number; resource?: string; index?: number; format?: string }
export interface PreviewState {
  loading: boolean; error: string | null; note: string; meshes: number; bones: string[]; triangles: number;
  clips: ClipOption[]; clip: number; playing: boolean; time: number; duration: number; neutral: boolean;
}
export const emptyPreview: PreviewState = {loading: true, error: null, note: '', meshes: 0, bones: [], triangles: 0, clips: [], clip: 0, playing: false, time: 0, duration: 0, neutral: false};
const materialsOf = (object: THREE.Mesh) => Array.isArray(object.material) ? object.material : [object.material];
function release(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of materialsOf(object)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
}
export async function artifactBlob(client: RegistryClient, resource: Resource | NonNullable<import('@worldkit/asset-contracts').AssetSummary['preview']>) {
  const bytes = await client.fetchArtifact(resource);
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: resource.mime_type}));
}

/** Only the WebGL canvas is imperative; React owns the controls and inspector state. */
export class AssetPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, .01, 10000);
  private controls: OrbitControls;
  private grid = new THREE.GridHelper(20, 20, 0xc6cbc3, 0xdde1da);
  private marker = new THREE.Mesh(new THREE.SphereGeometry(.018,12,8), new THREE.MeshBasicMaterial({color:0xdb7a2e, depthTest:false}));
  private model: THREE.Object3D | undefined;
  private skeleton: THREE.SkeletonHelper | undefined;
  private mixer: THREE.AnimationMixer | undefined;
  private action: THREE.AnimationAction | undefined;
  private originals = new Map<THREE.Mesh, THREE.Material[]>();
  private boneObjects: THREE.Bone[] = [];
  private observer: ResizeObserver;
  private closed = false;
  private frameId = 0;
  private lastFrame = 0;
  private lastReport = 0;
  private clipRequest = 0;
  private speed = 1;
  private wireframe = false;
  private state: PreviewState = {...emptyPreview};
  constructor(private host: HTMLElement, private client: RegistryClient, private manifest: AssetManifest, private onState: (state: PreviewState) => void) {
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); this.renderer.setClearColor('#ecefe8');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.setAttribute('aria-label', '资产三维预览');
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xfaffeb,0x66725a,2.5));
    const key = new THREE.DirectionalLight(0xfff7e2,3.3); key.position.set(5,10,7); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdce7fd,1.6); fill.position.set(-6,4,-4); this.scene.add(fill);
    this.marker.visible = false; this.marker.renderOrder = 1000; this.scene.add(this.grid,this.marker);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize();
    this.frameId = requestAnimationFrame(this.tick);
    void this.load().catch(error => this.emit({loading:false,error: String(error.message || error)}));
  }
  private emit(patch: Partial<PreviewState>) { if (!this.closed) { this.state = {...this.state,...patch}; this.onState(this.state); } }
  private resize() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height || this.closed) return;
    this.renderer.setSize(width,height,false); this.camera.aspect = width/height; this.camera.updateProjectionMatrix();
  }
  private tick = (time: number) => {
    if (this.closed) return;
    const dt = Math.min((time-this.lastFrame)/1000,.05); this.lastFrame = time;
    if (this.state.playing) this.mixer?.update(dt*this.speed);
    if (this.marker.visible) { const bone = this.boneObjects.find(b => b.name === this.marker.name); bone?.getWorldPosition(this.marker.position); }
    this.controls.update(); this.renderer.render(this.scene,this.camera);
    if (time-this.lastReport > 100 && this.action) { this.emit({time:this.action.time}); this.lastReport = time; }
    this.frameId = requestAnimationFrame(this.tick);
  };
  private resource(id: string) {
    const resource = this.manifest.resources.find(r=>r.resource_id===id);
    if (!resource) throw Error('ASSET_RESOURCE_MISSING: '+id);
    return resource;
  }
  private async parse(resource: Resource) {
    const bytes = await this.client.fetchArtifact(resource);
    if (this.closed) throw Error('Preview closed');
    const buffer = new Uint8Array(bytes).buffer;
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url;
      if (resource.format === 'fbx') return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=';
      throw Error('ASSET_EXTERNAL_RESOURCE_NOT_DECLARED');
    });
    if (resource.format === 'fbx') return new FBXLoader(manager).parse(buffer,'');
    if (!['glb','gltf'].includes(resource.format)) throw Error('ASSET_MODEL_FORMAT_UNSUPPORTED: '+resource.format);
    const gltf = await new GLTFLoader(manager).parseAsync(buffer,''); gltf.scene.animations = gltf.animations; return gltf.scene;
  }
  private async load() {
    if (!this.manifest.model_resource_id) return this.emit({loading:false, note:'尚未提供模型。'});
    const resource = this.resource(this.manifest.model_resource_id), model = await this.parse(resource);
    if (this.closed) { release(model); return; }
    this.model = model;
    if (resource.format === 'fbx') model.scale.multiplyScalar(.01);
    else {
      const rig = this.manifest.sections.bindings.rig as {source_transform?:Record<string,number[]>} | undefined;
      const transform = rig?.source_transform;
      const vector = (v: number[] | undefined): v is [number,number,number] => !!v && v.length===3 && v.every(Number.isFinite);
      if (vector(transform?.scaleXYZ)) model.scale.multiply(new THREE.Vector3(...transform.scaleXYZ));
      if (vector(transform?.rotationEulerRadiansXYZ)) model.rotation.set(...transform.rotationEulerRadiansXYZ);
      if (vector(transform?.positionMetersXYZ)) model.position.set(...transform.positionMetersXYZ);
    }
    let meshes=0, triangles=0;
    model.traverse(object=>{
      if (object instanceof THREE.Bone) this.boneObjects.push(object);
      if (object instanceof THREE.Mesh) { meshes++; triangles+=(object.geometry.index?.count||object.geometry.attributes.position?.count||0)/3; this.originals.set(object,materialsOf(object)); }
    });
    this.scene.add(model); model.updateMatrixWorld(true);
    this.skeleton = new THREE.SkeletonHelper(model); this.skeleton.visible=false; this.skeleton.renderOrder=100;
    for (const material of Array.isArray(this.skeleton.material)?this.skeleton.material:[this.skeleton.material]) { material.depthTest=false; material.transparent=true; material.opacity=.85; }
    this.scene.add(this.skeleton); this.mixer = new THREE.AnimationMixer(model);
    const clips: ClipOption[] = model.animations.map((clip,index)=>({name:clip.name||'animation_'+index,duration:clip.duration,embedded:index}));
    for (const entry of this.manifest.sections.animations) {
      const a=entry as {resource_id?:string;name?:string;duration_seconds?:number;index?:number;format?:string};
      if(a.resource_id && a.resource_id!==this.manifest.model_resource_id) clips.push({name:a.name||a.resource_id,duration:a.duration_seconds||0,resource:a.resource_id,index:a.index||0,format:a.format||this.resource(a.resource_id).format});
    }
    this.emit({loading:false, meshes, triangles:Math.round(triangles),bones:this.boneObjects.map(b=>b.name),clips,note:'资源字节已校验；内容预览不代表运行兼容性已验证。'});
    this.setNeutral(resource.format==='fbx'); this.frame();
    if (clips.length) await this.selectClip(Math.max(0,clips.findIndex(c=>/^idle$|^idle[_ -]|ground[_ -]idle/i.test(c.name))));
  }
  frame(bounds?: THREE.Box3) {
    if (!this.model || this.closed) return;
    const box=bounds||new THREE.Box3().setFromObject(this.model,true), center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
    if (box.isEmpty()) return;
    const radius=Math.max(size.x,size.y,size.z,.1), distance=radius/Math.min(Math.max(.3,this.camera.aspect),1)*1.5;
    this.controls.target.copy(center); this.camera.position.copy(center).add(new THREE.Vector3(.85,.44,1.18).normalize().multiplyScalar(distance));
    this.camera.near=Math.max(.001,radius/1000); this.camera.far=Math.max(1000,radius*100); this.camera.updateProjectionMatrix();
    this.controls.minDistance=radius*.05; this.controls.maxDistance=radius*25; this.controls.update();
    this.grid.position.y=box.min.y-.005*radius; this.grid.scale.setScalar(radius*.22); this.marker.scale.setScalar(radius*1.2);
  }
  async selectClip(index: number) {
    const option=this.state.clips[index]; if (!option||!this.mixer||!this.model||this.closed) return;
    const token=++this.clipRequest;
    this.mixer.stopAllAction(); this.action=undefined;
    this.emit({clip:index,playing:false,time:0,duration:0,note:'正在读取动作…'});
    try {
      let clip: THREE.AnimationClip | undefined;
      if(option.embedded!==undefined) clip=this.model.animations[option.embedded];
      else if(option.resource) {
        if(option.format==='three-clip-json') clip=THREE.AnimationClip.parse(JSON.parse(new TextDecoder().decode(await this.client.fetchArtifact(this.resource(option.resource)))));
        else { const root=await this.parse(this.resource(option.resource)); clip=root.animations[option.index||0]; release(root); }
      }
      if(this.closed||token!==this.clipRequest) return;
      if(!clip) throw Error('动画片段不存在');
      const missing=clip.tracks.filter(track=>!THREE.PropertyBinding.findNode(this.model!,THREE.PropertyBinding.parseTrackName(track.name).nodeName));
      if(missing.length) return this.emit({note:`${missing.length} 条轨道未匹配模型节点，需要补齐绑定。`});
      this.action=this.mixer.clipAction(clip); this.action.reset().setLoop(THREE.LoopRepeat,Infinity).play();
      const bounds=new THREE.Box3();
      for(const fraction of [0,.25,.5,.75,.99]) { this.action.time=clip.duration*fraction; this.mixer.update(0); this.model.updateMatrixWorld(true); bounds.union(new THREE.Box3().setFromObject(this.model,true)); }
      this.action.time=0; this.mixer.update(0); this.frame(bounds);
      this.emit({duration:clip.duration,playing:true,note:option.embedded!==undefined?'内嵌动画 · 循环仅用于预览':'独立动画 · 按原骨骼名称绑定，重定向仍需验证'});
    } catch(error) { if(token===this.clipRequest) this.emit({playing:false,note:'动作加载失败：'+String(error)}); }
  }
  setPlaying(value:boolean) { this.emit({playing:value && !!this.action}); }
  setSpeed(value:number) { this.speed=value; }
  seek(value:number) { if(!this.action||!this.mixer)return; this.action.time=value; this.mixer.update(0); this.emit({time:value,playing:false}); }
  setSkeleton(value:boolean) { if(this.skeleton)this.skeleton.visible=value; if(!value)this.marker.visible=false; }
  setRotate(value:boolean) { this.controls.autoRotate=value; }
  selectBone(name:string) { const bone=this.boneObjects.find(b=>b.name===name); if(bone) { bone.getWorldPosition(this.marker.position); this.marker.name=name; this.marker.visible=true; this.setSkeleton(true); } }
  setWireframe(value:boolean) { this.wireframe=value; this.setNeutral(this.state.neutral); }
  setNeutral(value:boolean) {
    for(const [mesh,originals] of this.originals) {
      for(const material of materialsOf(mesh)) if(!originals.includes(material))material.dispose();
      const materials=value?originals.map(m=>new THREE.MeshStandardMaterial({color:0xe9eadc,roughness:.84,side:m.side,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest})):originals;
      materials.forEach(material=>{ if('wireframe' in material)material.wireframe=this.wireframe; });
      mesh.material=materials.length===1?materials[0]!:materials;
    }
    this.emit({neutral:value});
  }
  dispose() {
    if(this.closed)return;
    this.closed=true; this.clipRequest++; cancelAnimationFrame(this.frameId); this.observer.disconnect(); this.controls.dispose();
    if(this.model) { this.mixer?.stopAllAction(); this.mixer?.uncacheRoot(this.model); for(const [mesh,originals]of this.originals) { for(const m of materialsOf(mesh))if(!originals.includes(m))m.dispose(); mesh.material=originals; } release(this.model); }
    this.originals.clear(); this.skeleton?.dispose(); this.grid.dispose(); release(this.marker);
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
