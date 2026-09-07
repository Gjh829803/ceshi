import type {FrameRateReading} from './fps';

/** A small callback-pacing display; deliberately makes no claim about presented frames. */
export class FramePacingPanel {
  readonly element=document.createElement('section');
  private p95:HTMLElement;private maximum:HTMLElement;private spikes:HTMLElement;
  private context:CanvasRenderingContext2D;
  constructor(parent:Element){
    this.element.className='panel frame-pacing';
    this.element.innerHTML=`<div class="pace-heading">回调间隔 <span>近 5 秒</span></div><div class="pace-row" title="95%的回调间隔不超过此数值，单位毫秒；单次大停顿请看最长间隔">P95 <b data-pace="p95">—</b></div><div class="pace-row">最长间隔 <b data-pace="max">—</b></div><div class="pace-row" title="回调间隔超过33.3毫秒的次数，不是屏幕掉帧计数">超过 33 ms <b data-pace="spikes">—</b></div><canvas width="320" height="60" aria-label="最近五秒回调间隔曲线，越高代表等待越久，图表上限100毫秒"></canvas><div class="pace-caption">曲线 0–100 ms · 越低越均匀</div><div class="pace-note">屏幕实际呈现帧率：未测量</div>`;
    parent.append(this.element);
    this.p95=this.element.querySelector('[data-pace="p95"]')!;this.maximum=this.element.querySelector('[data-pace="max"]')!;this.spikes=this.element.querySelector('[data-pace="spikes"]')!;
    this.context=this.element.querySelector('canvas')!.getContext('2d')!;
  }
  reset(){this.p95.textContent=this.maximum.textContent=this.spikes.textContent='—';this.element.removeAttribute('data-spike');this.context.clearRect(0,0,320,60);}
  update(reading:FrameRateReading){
    this.p95.textContent=`${reading.p95.toFixed(1)} ms`;this.maximum.textContent=`${reading.maximum.toFixed(1)} ms`;this.spikes.textContent=`${reading.over33ms} 次`;
    this.element.toggleAttribute('data-spike',reading.over33ms>0);
    const ctx=this.context,w=320,h=60,buckets=new Float32Array(160);ctx.clearRect(0,0,w,h);
    for(const sample of reading.history){const n=Math.max(0,Math.min(159,Math.floor((1-sample.age/5000)*159)));buckets[n]=Math.max(buckets[n]!,sample.duration);}
    ctx.strokeStyle='#91aeb64a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h*(1-1/3));ctx.lineTo(w,h*(1-1/3));ctx.stroke();
    for(let n=0;n<buckets.length;n++){const interval=buckets[n]!;if(!interval)continue;ctx.fillStyle=interval>1000/30?'#f4b36d':'#baf2db';const height=Math.max(1,Math.min(interval/100,1)*h);ctx.fillRect(n*2,h-height,2,height);}
  }
}
