export type FrameRateReading={fps:number;milliseconds:number;p95:number;maximum:number;over33ms:number;history:{age:number;duration:number}[]};

/** rAF callback cadence only: this is NOT a GPU completion or screen-presentation counter. */
export class FrameRateMeter {
  private readonly endings=new Float64Array(4096);
  private readonly durations=new Float64Array(4096);
  private first=0;
  private count=0;
  private previous:number|undefined;
  private publishedAt=0;

  reset(){this.first=0;this.count=0;this.previous=undefined;this.publishedAt=0;}

  sample(now:number):FrameRateReading|null {
    if(!Number.isFinite(now))return null;
    if(this.previous===undefined){this.previous=now;this.publishedAt=now;return null;}
    const duration=now-this.previous;
    if(duration<=0)return null;
    this.previous=now;
    if(this.count===this.durations.length)this.removeOldest();
    const index=(this.first+this.count)%this.durations.length;
    this.endings[index]=now;this.durations[index]=duration;this.count++;
    while(this.count>1&&this.endings[this.first]!<=now-5000)this.removeOldest();
    if(now-this.publishedAt<500)return null;
    this.publishedAt=now;
    let recentCount=0,recentTime=0,over33ms=0;
    const history:FrameRateReading['history']=[],intervals:number[]=[];
    for(let n=0;n<this.count;n++){
      const i=(this.first+n)%this.durations.length,age=now-this.endings[i]!,duration=this.durations[i]!;
      if(age<1000){recentCount++;recentTime+=duration;}
      if(duration>1000/30)over33ms++;
      history.push({age,duration});intervals.push(duration);
    }
    intervals.sort((a,b)=>a-b);
    const milliseconds=recentTime/recentCount;
    return {fps:1000/milliseconds,milliseconds,p95:intervals[Math.max(0,Math.ceil(intervals.length*.95)-1)]!,maximum:intervals[intervals.length-1]!,over33ms,history};
  }

  private removeOldest(){this.first=(this.first+1)%this.durations.length;this.count--;}
}
