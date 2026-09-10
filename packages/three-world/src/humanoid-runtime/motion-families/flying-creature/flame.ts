import * as T from 'three';
interface Particle {born:number;life:number;position:T.Vector3;velocity:T.Vector3;seed:number}
const random=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

/** 固定步记录发射，显示时刻解析采样；暂停、重复采样与截图都不会推进粒子。 */
export class CreatureFlame {
  readonly object:T.Points;
  private particles:Particle[]=[];
  private epoch=-1;
  private tick=-1;
  private lastTime=0;
  private serial=0;
  private remainder=0;
  private readonly geometry=new T.BufferGeometry();
  private readonly positions=new Float32Array(600*3);
  private readonly ages=new Float32Array(600);
  private readonly seeds=new Float32Array(600);
  private readonly material:T.ShaderMaterial;
  constructor(private readonly texture:T.Texture){
    this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    this.geometry.setAttribute('age',new T.BufferAttribute(this.ages,1).setUsage(T.DynamicDrawUsage));
    this.geometry.setAttribute('seed',new T.BufferAttribute(this.seeds,1).setUsage(T.DynamicDrawUsage));
    this.material=new T.ShaderMaterial({uniforms:{atlas:{value:texture},pixelScale:{value:700}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,
      vertexShader:`attribute float age;attribute float seed;varying float vAge;varying float vSeed;uniform float pixelScale;
      void main(){vAge=age;vSeed=seed;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
      gl_PointSize=clamp(pixelScale*(.45+age*1.9)/max(.2,-p.z),1.,150.);}`,
      fragmentShader:`uniform sampler2D atlas;varying float vAge;varying float vSeed;
      void main(){float frame=floor(min(.999,vAge)*64.);vec2 uv=(vec2(mod(frame,8.),7.-floor(frame/8.))+vec2(gl_PointCoord.x,1.-gl_PointCoord.y))/8.;
      vec4 tex=texture2D(atlas,uv);float edge=smoothstep(1.,.65,length(gl_PointCoord-.5)*2.);
      vec3 tint=mix(vec3(1.,.86,.3),vec3(1.,.18,.02),vAge);
      float fade=smoothstep(0.,.06,vAge)*(1.-smoothstep(.5,1.,vAge));
      gl_FragColor=vec4(tex.rgb*tint*1.8,tex.a*fade*edge*.75);}`});
    this.object=new T.Points(this.geometry,this.material);this.object.name='dragon-flame';this.object.frustumCulled=false;
    this.geometry.setDrawRange(0,0);
  }
  commit(epoch:number,tick:number,time:number,emission:number,mouth:T.Vector3,direction:T.Vector3,velocity:T.Vector3):void {
    if(epoch!==this.epoch||tick<this.tick||time<this.lastTime){this.particles=[];this.epoch=epoch;this.tick=-1;this.lastTime=time;this.remainder=0;this.serial=0;}
    if(tick===this.tick)return;
    const dt=Math.min(.05,Math.max(0,time-this.lastTime));this.lastTime=time;this.tick=tick;
    this.particles=this.particles.filter(p=>time-p.born<p.life+.05);
    this.remainder+=dt*180*emission;
    const count=Math.floor(this.remainder);this.remainder-=count;
    for(let n=0;n<count;n++){
      const s=++this.serial,seed=random(s),jitter=new T.Vector3(random(s+1)-.5,random(s+2)-.5,random(s+3)-.5);
      this.particles.push({born:time,life:.4+seed*.22,position:mouth.clone(),velocity:direction.clone().multiplyScalar(25+seed*6).add(velocity).addScaledVector(jitter,3),seed});
    }
    if(this.particles.length>600)this.particles.splice(0,this.particles.length-600);
  }
  sample(time:number,root:T.Object3D):void {
    root.updateWorldMatrix(true,false);const inverse=root.matrixWorld.clone().invert();let count=0;
    for(const p of this.particles){const elapsed=time-p.born;if(elapsed<0||elapsed>=p.life)continue;
      const pos=p.position.clone().addScaledVector(p.velocity,elapsed);pos.y+=elapsed*elapsed*2;
      pos.applyMatrix4(inverse).toArray(this.positions,count*3);this.ages[count]=elapsed/p.life;this.seeds[count++]=p.seed;
    }
    this.geometry.setDrawRange(0,count);for(const attribute of Object.values(this.geometry.attributes))attribute.needsUpdate=true;
  }
  dispose():void{this.geometry.dispose();this.material.dispose();this.texture.dispose();this.object.removeFromParent();}
}
