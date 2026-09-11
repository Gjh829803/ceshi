import * as T from 'three';

export interface AircraftReadout {speed:number;throttle:number;pitch:number;roll:number;steering:number;position:T.Vector3;velocity:T.Vector3;grounded:boolean;aircraft?:{stalled:boolean;hardLanding:boolean}|undefined}
/** 普通 Three 几何与仪表；调用者使用 SDK 的展示回调，不建立第二时钟。 */
export function buildAircraftCockpit(root:T.Group){
 const dark=new T.MeshStandardMaterial({color:'#243039',roughness:.9});
 const white=new T.MeshStandardMaterial({color:'#e4e8e8'});
 const part=(w:number,h:number,d:number,x:number,y:number,z:number,mat:T.Material=dark)=>{
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);root.add(mesh);return mesh;
 };
 part(1.02,.35,.12,0,1.53,1.06).name='aircraft-panel';
 for(const x of [-.54,.54]){part(.045,.79,.045,x,1.745,1.08,white);part(.045,.79,.045,x,1.745,-.50,white);}
 // Source101 驾驶姿态的鞋底在 y=.744；踏板保留 4 mm 接触间隙。
 for(const x of [-.16,.16])part(.18,.035,.30,x,.7225,.50).name='aircraft-pedal';
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=384;
 const context=canvas.getContext('2d')!,texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const panel=new T.Mesh(new T.PlaneGeometry( .98,.32),new T.MeshBasicMaterial({map:texture}));
 panel.rotation.y=Math.PI;panel.position.set(0,1.53,.994);root.add(panel);
 // 力感应固定握把，与冻结的驾驶姿态配合，不让可视把手脱离手掌。
 for(const [x,y,z] of [[.214,1.508,.52],[-.195,1.524,.495]]){
  part(.14,.025,.065,x!,y!,z!).name='aircraft-grip';
  part(.035,.045,.46,x!,y!-.035,z!+.23);
 }
 const left=part(1.8,.045,.30,-2.9,2.20,-.76,white),right=part(1.8,.045,.30,2.9,2.20,-.76,white);
 const elevator=part(2.6,.04,.26,0,1.30,-3.0,white);
 let last=-1;
 function update(state:AircraftReadout,time:number){
  left.rotation.x=state.steering*.25;right.rotation.x=-state.steering*.25;elevator.rotation.x=-state.pitch;
  const frame=Math.floor(time*12);if(frame===last)return;last=frame;
  const c=context;c.fillStyle='#142029';c.fillRect(0,0,1024,384);
  const labels=['空速 km/h','姿态','高度 m','油门 %','升降 m/s','飞行状态'];
  const values=[String(Math.round(state.speed*3.6)),'',state.position.y.toFixed(0),String(Math.round(state.throttle*100)),state.velocity.y.toFixed(1),state.aircraft?.hardLanding?'重着陆':state.aircraft?.stalled?'失速':state.grounded?'地面':'飞行'];
  for(let n=0;n<6;n++){
   const x=175+(n%3)*337,y=99+Math.floor(n/3)*188;
   c.fillStyle='#071017';c.beginPath();c.arc(x,y,77,0,Math.PI*2);c.fill();
   if(n===1){c.save();c.beginPath();c.arc(x,y,70,0,Math.PI*2);c.clip();c.translate(x,y);c.rotate(-state.roll);const horizon=state.pitch*180;c.fillStyle='#7199ac';c.fillRect(-120,-160,240,160+horizon);c.fillStyle='#aa8463';c.fillRect(-120,horizon,240,160);c.strokeStyle='white';c.lineWidth=3;c.beginPath();c.moveTo(-80,horizon);c.lineTo(80,horizon);c.stroke();c.restore();c.fillStyle='#fff';c.fillRect(x-36,y,27,3);c.fillRect(x+9,y,27,3);}
   else {c.fillStyle=n===5&&(state.aircraft?.stalled||state.aircraft?.hardLanding)?'#ff9a62':'#e9f4ed';c.textAlign='center';c.font='bold 36px sans-serif';c.fillText(values[n]!,x,y+9);}
   c.textAlign='center';c.fillStyle='#c2d1d8';c.font='20px sans-serif';c.fillText(labels[n]!,x,y+65);
  }
  texture.needsUpdate=true;
 }
 return {update};
}
