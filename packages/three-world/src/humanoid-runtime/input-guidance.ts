import type {Mode} from './config';
import type {Input} from './simulation';

export type HumanoidInputFamily = Mode | 'character';
export interface HumanoidInputGuide {
  readonly family: HumanoidInputFamily;
  readonly fields: Readonly<Partial<Record<keyof Input,string>>>;
}
/** Controller semantics, read on demand. Omitted channels are ignored: leave them neutral. */
export const GROUND_INPUT_FIELDS = {
  forward: 'Positive accelerates forward; negative brakes forward motion before reversing.',
  steer: 'Positive steers right relative to the vehicle; steering response depends on speed and family.',
  boost: 'Raises the allowed forward speed to maxSpeed; still requires forward input.',
  slow: 'Suppresses drive and boost and applies this controller’s existing brake.',
  brake: 'Brakes velocity; wheeled vehicles also loosen lateral grip for handbrake turns.',
} as const;
export const MOUNT_INPUT_FIELDS = {
  forward: 'Positive moves forward; negative reverses at reverseSpeed.',
  steer: 'Positive steers right relative to travel; reverse changes steering direction.',
  boost: 'Requests maxSpeed; slow takes precedence.',
  slow: 'Requests slowSpeed.',
  jump: 'Mount: jump edge while grounded; carriage does not jump.',
  brake: 'Decelerates toward zero speed.',
} as const;
export const HUMANOID_INPUT_GUIDES: Readonly<Record<HumanoidInputFamily,Readonly<Partial<Record<keyof Input,string>>>>> = {
  character: {
    forward: 'Positive moves forward relative to camera yaw; on a climb surface axes follow the surface.',
    steer: 'Positive moves right relative to camera yaw; on a climb surface axes follow the surface.',
    boost: 'Requests sprint; stance, carried objects and active actions can limit speed.',
    slow: 'Requests slow walking; takes precedence over sprint.',
    jump: 'Jump/action edge; traversal and swimming interpret it in the current movement context.',
    actions: 'Optional semantic action edges; inspect characterCapabilities for current eligibility.',
  },
  paddled_boat: {
    forward: 'Positive paddles forward; negative paddles backward.',
    steer: 'Positive turns right by changing paddle side or stroke strength.',
    boost: 'Requests faster paddling when supported by the selected craft.',
    brake: 'Adds water drag; raft profiles also use it for braking on land.',
    slow: 'Suppresses paddling and applies water drag.',
  },

  bus: {
    forward: 'Positive drives forward; negative brakes before selecting reverse.',
    steer: 'Positive turns the front wheels right; turning depends on speed and wheelbase.',
    brake: 'Applies the service brake and holds the bus on a slope.',
    slow: 'Suppresses drive and applies the service brake.',
  },

  tank: {
    forward: 'Positive drives both tracks forward; negative brakes before reversing.',
    steer: 'Positive applies differential track steering and can pivot the tank at rest.',
    boost: 'Raises the available forward speed while forward drive is applied.',
    brake: 'Stops both tracks and prevents differential steering.',
    slow: 'Suppresses drive and stops both tracks.',
    roll: 'Rotates the turret.',
    pitch: 'Raises or lowers the gun.',
  },

  sled: {
    forward: 'Positive pushes forward at low speed; negative brakes forward motion, then pushes backwards at low speed.',
    steer: 'Positive turns right, including at rest; backward travel retains reversed steering response.',
    brake: 'Drags both feet to slow the sled.',
    slow: 'Suppresses pushing and applies the existing brake.',
  },

  ski: {
    forward: 'Positive pushes with the poles at low speed; negative applies braking and does not reverse.',
    steer: 'Positive edges the skis to turn right and loses some speed.',
    brake: 'Applies ski-edge braking.',
    slow: 'Suppresses pushing and applies ski-edge braking.',
  },
  wheeled: GROUND_INPUT_FIELDS,
  motorcycle: GROUND_INPUT_FIELDS,
  unicycle: {
    forward: 'Positive returns the supporting foot to the pedal before driving; negative brakes before reversing. No propulsion while airborne.',
    steer: 'Positive shifts balance to turn right; requires movement.',
    boost: 'Requests faster pedalling and maxSpeed while driving forward.',
    brake: 'Brakes the wheel; releasing drive slows to a stop and plants the left foot on nearby ground.',
    slow: 'Suppresses pedalling and applies the wheel brake.',
  },
  skateboard: GROUND_INPUT_FIELDS,
  boat: GROUND_INPUT_FIELDS,
  hover: {...GROUND_INPUT_FIELDS,roll:'Positive applies lateral thrust toward local -X; this is not angular roll.'},
  mount: MOUNT_INPUT_FIELDS,
  carriage: MOUNT_INPUT_FIELDS,
  plane: {
    forward:'Fixed-wing/pusher: signed rate of persistent throttle change. Rotorcraft: signed forward/reverse speed demand. Soaring: target airspeed trim, not propulsion. Balloon ignores horizontal and attitude inputs.',
    pitch:'Positive pitches down; negative pitches up. Independent of forward/throttle; balloon ignores it.',
    lift:'Rotorcraft: signed rate of vertical-speed demand change (50% throttle hovers). Balloon: positive heats, negative vents. Soaring: negative deploys spoilers/descent assist. Fixed-wing ignores it.',
    steer:'Positive turns right. Fixed-wing banks into the turn; rotorcraft yaws in hover and banks during forward flight.',roll:'Adds signed bank around local Z.',
    boost:'Powered fixed-wing: increases throttle. Rotorcraft: raises the requested forward speed. Soaring: limited tow/run-up, never continuous engine thrust. Balloon ignores it.',
    slow:'Fixed-wing: lowers throttle and applies ground brakes. Rotorcraft: brakes horizontal motion without lowering collective lift. Soaring: air brake/spoilers. Balloon ignores it.',
    brake:'Ground wheel brake. Wingsuit: starts two-second canopy deployment. Paraglider/deployed wingsuit: canopy landing brake. Keyboard Space is lift for rotorcraft and balloon.',
  },
  glider: {
    forward:'Signed target airspeed adjustment through trim; does not create engine thrust.',
    pitch:'Positive pitches down; negative pitches up.',
    lift:'Negative requests spoilers/descent assist.',slow:'Air brake.',brake:'Ground/landing brake.',
    steer:'Positive turns right and adds bank.',roll:'Adds signed bank around local Z.',
    boost:'Launches an unlaunched glider once; has no throttle effect after launch.',
  },
  spacecraft: {
    forward:'Signed local +Z thrust.',strafe:'Signed local -X thrust.',lift:'Signed local +Y thrust.',
    steer:'Positive rotates about local -Y.',pitch:'Signed angular input about local X.',roll:'Signed angular input about local Z.',
    slow:'Uses counter-thrust to brake linear and angular velocity in either flight mode; Shift has no binding.',
    brake:'Ignored; keyboard Space is handled through lift. F enters/exits via the shared vehicle action.',
  },
  submarine: {
    forward:'Signed forward thrust.',steer:'Positive turns right about world Y.',roll:'Signed angular roll.',
    lift:'Positive ascends; negative descends. Independent of pitch and horizontal drive.',
    pitch:'Positive pitches down; negative pitches up.',
    boost:'Requests enhanced propulsion where supported by the powertrain.',
    slow:'Suppresses forward propulsion and brakes velocity.',
  },
  dragon: {
    forward:'Positive requests forward speed; negative brakes, never reverses in flight.',
    steer:'Positive steers right relative to travel; reverse changes steering direction.',
    lift:'Positive takes off/ascends; negative descends; neutral hovers while airborne.',
    jump:'Supplies positive lift when lift is zero.',
    boost:'Raises airborne forward and vertical speed; grounded forward speed is unchanged.',
    pitch:'Positive pitches down; negative pitches up. Separate from Space/C lift.',
    slow:'Brakes horizontal motion without cancelling lift.',
  },
};
export const VEHICLE_APPROACH_DESCRIPTION = 'Preparation only: relocates the preset character to a safe boarding position and clears its velocity. Does not walk a route. Use normal input for visible travel, then vehicle.enter when eligible.';
