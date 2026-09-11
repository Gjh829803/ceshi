import type {Character} from './character';

const owners=new WeakMap<Character,object>();

/** One live instance has one root/mixer owner. Immutable source leases may still be shared. */
export function claimCharacter(character:Character):()=>void{
  if(owners.has(character))throw new Error('HUMANOID_CHARACTER_ALREADY_OWNED');
  const token={};owners.set(character,token);
  return()=>{if(owners.get(character)===token)owners.delete(character);};
}
