/** Client-clock receipt timing only; never a measurement of visible response latency. */
export class ReceiptTimings {
  private pending=new Map<string,number>();
  private samples:{at:number;ms:number}[]=[];
  constructor(private readonly now:()=>number=()=>performance.now()){}
  private prune(at:number):void {
    for(const [key,sent]of this.pending)if(at-sent>30_000)this.pending.delete(key);
    this.samples=this.samples.filter(sample=>at-sample.at<=60_000);
  }
  sent(key:string):void {
    const at=this.now();this.prune(at);this.pending.set(key,at);
    while(this.pending.size>256)this.pending.delete(this.pending.keys().next().value!);
  }
  received(key:string):void {
    const at=this.now();this.prune(at);const sent=this.pending.get(key);
    if(sent===undefined)return;
    this.pending.delete(key);this.samples.push({at,ms:Math.max(0,at-sent)});
    if(this.samples.length>128)this.samples.shift();
  }
  snapshot():{latestMs:number|null;p95Ms:number|null;sampleCount:number} {
    this.prune(this.now());const sorted=this.samples.map(sample=>sample.ms).sort((a,b)=>a-b);
    return {latestMs:this.samples.at(-1)?.ms??null,p95Ms:sorted[Math.ceil(sorted.length*.95)-1]??null,sampleCount:sorted.length};
  }
  reset():void {this.pending.clear();this.samples=[];}
}
