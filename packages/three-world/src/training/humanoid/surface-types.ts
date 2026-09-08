/** Metres, Y up. The normal points away from the climbable face toward the player. */
export interface ClimbSurface {
  id:string;
  /** ID of a real LevelBox collider. A decorative mesh alone is insufficient. */
  colliderId:string;
  kind:'wall'|'ladder';
  center:[number,number,number];
  normal:[number,number,number];
  width:number;
  minY:number;
  maxY:number;
}

export interface SurfaceCommands {prone?:boolean;climb?:boolean;releaseClimb?:boolean}
export interface SurfacePose {key:string;time:number;phase:string}
