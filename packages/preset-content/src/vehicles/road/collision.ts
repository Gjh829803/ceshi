import {readSubjectSpec} from '../../assets/subject-data';

/** Calibrated body parts are authored in the selected library locomotion profile. */
export function roverBodyParts(utility = false) {
  const parts = readSubjectSpec(utility ? 'trail-rover' : 'rover').wheelPhysics?.bodyParts;
  if (!parts) throw new Error('Missing rover body parts');
  return parts;
}

/** Low chassis and bumper geometry from the selected kart content version. */
export function kartBodyParts() {
  const parts = readSubjectSpec('kart').wheelPhysics?.bodyParts;
  if (!parts) throw new Error('Missing kart body parts');
  return parts;
}
