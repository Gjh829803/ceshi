import type { PresentationSampleContext } from './state';
/** One display-history decision shared by camera, actor roots and skeletal presentation. */
export class WorldPresentationContext {
 private epoch=0;
 private last:PresentationSampleContext|undefined;
 private cutTick:number|undefined;
 sample(tick:number,alpha:number,discontinuity=false):PresentationSampleContext {
  if(!Number.isFinite(alpha)||alpha<0||alpha>1)throw new Error('WORLD_PRESENTATION_ALPHA_INVALID');
  if(discontinuity || (this.cutTick!==tick&&this.last?.currentTick===tick && alpha<this.last.alpha)){this.epoch++;this.cutTick=tick;}
  const cut=this.cutTick===tick;
  return this.last={epoch:this.epoch,previousTick:cut?tick:Math.max(0,tick-1),currentTick:tick,alpha:cut?1:alpha,cut};
 }
 reset():void {this.epoch++;this.last=undefined;this.cutTick=undefined;}
}
