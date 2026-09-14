import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
type FrameSyncOption='-fps_mode'|'-vsync';
/** Prefer the per-stream option; FFmpeg 4.4 only offers the legacy global flag. */
export function frameSyncOptionFromHelp(help:string):FrameSyncOption {
  if(/^\s*-fps_mode(?:\s|:|\[)/m.test(help))return '-fps_mode';
  if(/^\s*-vsync\s/m.test(help))return '-vsync';
  throw new Error('THREE_FFMPEG_FRAME_SYNC_UNSUPPORTED');
}
let frameSyncOption:Promise<FrameSyncOption>|undefined;
/** Probe the executable used for encoding once; failed probes remain retryable. */
export function ffmpegFrameSyncOption():Promise<FrameSyncOption> {
  return frameSyncOption??=promisify(execFile)('ffmpeg',['-hide_banner','-h','full'],{timeout:10000,maxBuffer:8*1024*1024})
    .then(({stdout,stderr})=>frameSyncOptionFromHelp(stdout+'\n'+stderr))
    .catch(error=>{frameSyncOption=undefined;throw error;});
}
/** Preserve browser timestamps and avoid rounding irregular frames to a nominal rate.
 * The millisecond encoder clock and disabled B-frames retain frame order/timing.
 */
export async function recordedVideoEncodingArgs(inputPath: string, outputPath: string): Promise<string[]> {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    await ffmpegFrameSyncOption(), 'passthrough', '-c:v', 'libx264', '-enc_time_base', '1:1000',
    '-bf', '0', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', outputPath];
}
