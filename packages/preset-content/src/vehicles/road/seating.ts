import {readModelFacts, readSubjectSpec} from '../../assets/subject-data';

type RoadSubject = 'rover' | 'racer' | 'trail-rover' | 'supercar' | 'kart' | 'motorcycle' | 'touring-motorcycle';
type Cushion = {center: [number, number, number]; size: [number, number, number]};
const roadSubjects: RoadSubject[] = ['rover', 'racer', 'trail-rover', 'supercar', 'kart', 'motorcycle', 'touring-motorcycle'];
/** Local geometry in metres, generated from each library subject's model profile. */
export const ROAD_CUSHIONS = Object.fromEntries(roadSubjects.map(id => {
  const cushion = readModelFacts(id).roadCushion;
  if (!cushion) throw new Error(`Missing road cushion: ${id}`);
  return [id, cushion];
})) as Record<RoadSubject, Cushion>;

/** Calibrated pelvis anchor; the library owns its clearance from the cushion. */
export function roadSeatAnchor(id: RoadSubject): [number, number, number] {
  return [...readSubjectSpec(id).seat];
}

// Support thighs without lifting the pelvis; retain the upstream centre relief.
export const KART_CUSHION_SUPPORT_RISE = .03;
export function kartCushionSupportRise(x: number): number {
  return KART_CUSHION_SUPPORT_RISE * Math.max(0, Math.min(1, (Math.abs(x) - .025) / .04));
}
