/** Release model capacity before slow artifact retrieval; retain all completion promises. */
export async function runWithExecutionSlots(plans,maximum,execute,shouldStop=()=>false) {
  if(!Number.isSafeInteger(maximum)||maximum<1||maximum>10)throw Error('CREATOR_EXECUTION_CAPACITY_INVALID');
  const active=new Set(),completions=[];
  for(const plan of plans) {
    while(active.size>=maximum)await Promise.race(active);
    if(shouldStop())break;
    let resolve,released=false;
    const slot=new Promise(done=>{resolve=done;});active.add(slot);
    const release=()=>{if(!released){released=true;active.delete(slot);resolve();}};
    // Unknown outcomes retain a durable admission reservation even if this local
    // transport invocation ends; the admission check still prevents overbooking.
    const completion=Promise.resolve().then(()=>execute(plan,release)).finally(release);
    completion.catch(()=>{});completions.push(completion);
  }
  await Promise.all(completions);
}
