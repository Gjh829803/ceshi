/** Attempt independent owners in their declared order, then rethrow the first original failure.
 * This helper owns no resources, state, scheduling or dependency ordering.
 */
export function disposeInOrder(steps:Iterable<()=>void>):void {
  let failed=false,firstError:unknown;
  for(const cleanup of steps){
    try{cleanup();}catch(error){if(!failed){failed=true;firstError=error;}}
  }
  // Even throwing undefined/null is a failure; do not test the thrown value's truthiness.
  if(failed)throw firstError;
}
