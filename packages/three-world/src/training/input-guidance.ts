import type {Mode} from './config';
import type {Input} from './simulation';

export type TrainingInputFamily = Mode | 'character';
export interface TrainingInputGuide {
  readonly family: TrainingInputFamily;
  readonly fields: Readonly<Partial<Record<keyof Input,string>>>;
}
/** Controller semantics, read on demand. Omitted channels are ignored: leave them neutral. */
export const GROUND_INPUT_FIELDS = {
  forward: 'Positive accelerates forward; negative brakes forward motion before reversing.',
  steer: 'Positive steers right relative to the vehicle; steering response depends on speed and family.',
  boost: 'Raises the allowed forward speed to maxSpeed; still requires forward input.',
  brake: 'Brakes velocity; wheeled vehicles also loosen lateral grip for handbrake turns.',
} as const;
export const MOUNT_INPUT_FIELDS = {
  forward: 'Positive moves forward; negative reverses at reverseSpeed.',
  steer: 'Positive steers right relative to travel; reverse changes steering direction.',
  boost: 'Requests maxSpeed; slow takes precedence.',
  slow: 'Requests slowSpeed.',
  brake: 'Decelerates toward zero speed.',
} as const;
export const TRAINING_INPUT_GUIDES: Readonly<Record<TrainingInputFamily,Readonly<Partial<Record<keyof Input,string>>>>> = {
  character: {
    forward: 'Positive moves forward relative to camera yaw; on a climb surface axes follow the surface.',
    steer: 'Positive moves right relative to camera yaw; on a climb surface axes follow the surface.',
    boost: 'Requests sprint; stance, carried objects and active actions can limit speed.',
    slow: 'Requests slow walking; takes precedence over sprint.',
    jump: 'Jump/action edge; traversal and swimming interpret it in the current movement context.',
    humanoid: 'Optional semantic action edges; inspect characterCapabilities for current eligibility.',
  },
  wheeled: GROUND_INPUT_FIELDS,
  bike: GROUND_INPUT_FIELDS,
  slide: GROUND_INPUT_FIELDS,
  boat: GROUND_INPUT_FIELDS,
  hover: {...GROUND_INPUT_FIELDS,roll:'Positive applies lateral thrust toward local -X; this is not angular roll.'},
  mount: MOUNT_INPUT_FIELDS,
  carriage: MOUNT_INPUT_FIELDS,
  plane: {
    forward:'Positive pitches the nose down; negative pitches up. This is not throttle.',
    steer:'Positive turns right and adds bank.',roll:'Adds signed bank around local Z.',
    boost:'Increases persistent throttle while held.',slow:'Decreases persistent throttle while held.',
  },
  glider: {
    forward:'Positive pitches the nose down; negative pitches up.',
    steer:'Positive turns right and adds bank.',roll:'Adds signed bank around local Z.',
    boost:'Launches an unlaunched glider once; has no throttle effect after launch.',
  },
  space: {
    forward:'Signed local +Z thrust.',strafe:'Signed local -X thrust.',lift:'Signed local +Y thrust.',
    steer:'Positive rotates about local -Y.',pitch:'Signed angular input about local X.',roll:'Signed angular input about local Z.',
    boost:'Brakes velocity through damping; does not increase thrust.',
  },
  sub: {
    forward:'Signed forward thrust.',steer:'Positive turns right about world Y.',roll:'Signed angular roll.',
    lift:'Positive ascends and pitches up; negative descends and pitches down.',
    boost:'Brakes velocity through damping; does not increase thrust.',
  },
  dragon: {
    forward:'Signed forward/reverse speed intent; grounded and airborne speeds differ.',
    steer:'Positive steers right relative to travel; reverse changes steering direction.',
    lift:'Positive takes off/ascends; negative descends; neutral hovers while airborne.',
    jump:'Supplies positive lift when lift is zero.',
    boost:'Raises airborne forward and vertical speed; grounded forward speed is unchanged.',
    slow:'Together with brake or jump cancels vertical lift; it is not a slow-walk modifier.',
    brake:'Together with slow cancels vertical lift; it does not brake horizontal motion.',
  },
};
export const TRAINING_APPROACH_DESCRIPTION = 'Preparation only: relocates the preset character to a safe boarding position and clears its velocity. Does not walk a route. Use normal input for visible travel, then training.enter when eligible.';
