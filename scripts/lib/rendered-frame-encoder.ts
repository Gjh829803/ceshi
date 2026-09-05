import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** Engine-independent sink for already rendered JPEG frames. It never invents,
 * repeats, retimes, resizes, pads or captures a frame. */
export interface RenderedFrameEncoder {
  write(bytes: Buffer): Promise<void>;
  finish(): Promise<void>;
  abort(): Promise<void>;
}

export function createRenderedFrameEncoder(options: {
  outputPath: string; frameRate: number; frameCount: number; executablePath?: string;
}): RenderedFrameEncoder {
  const process = spawn(options.executablePath ?? 'ffmpeg', [
    '-y', '-v', 'error', '-f', 'image2pipe', '-vcodec', 'mjpeg',
    '-framerate', String(options.frameRate), '-i', 'pipe:0',
    '-an', '-frames:v', String(options.frameCount), '-fps_mode', 'passthrough',
    '-enc_time_base', `1/${options.frameRate}`, '-video_track_timescale', '24000',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', options.outputPath,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let diagnostic = '', failed: Error | undefined, written = 0, ended = false;
  process.stderr.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-16_384); });
  const closed = new Promise<void>((resolve, reject) => {
    process.once('error', error => { failed = error; reject(error); });
    process.once('close', code => {
      if (code === 0) resolve();
      else { failed = new Error(`EPISODE_ENCODER_FAILED: ${diagnostic || `exit ${code}`}`); reject(failed); }
    });
  });
  // Observe early encoder errors even while the caller is obtaining a frame.
  void closed.catch(() => undefined);
  process.stdin.on('error', error => { failed = error; });
  return {
    async write(bytes) {
      if (failed) throw failed;
      if (ended || written >= options.frameCount) throw new Error('EPISODE_ENCODER_FRAME_COUNT_EXCEEDED');
      if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('EPISODE_ENCODER_JPEG_REQUIRED');
      await new Promise<void>((resolve, reject) => process.stdin.write(bytes, error => error ? reject(error) : resolve()));
      written += 1;
    },
    async finish() {
      if (written !== options.frameCount) throw new Error(`EPISODE_ENCODER_INCOMPLETE: ${written}/${options.frameCount}`);
      ended = true; process.stdin.end(); await closed;
    },
    async abort() {
      ended = true; process.stdin.destroy(); process.kill('SIGTERM'); await closed.catch(() => undefined);
    },
  };
}

export async function inspectRenderedVideo(filename: string) {
  const { stdout } = await promisify(execFile)('ffprobe', [
    '-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,pix_fmt:format=duration',
    '-of', 'json', filename,
  ], { maxBuffer: 128 * 1024 });
  const info = JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; nb_read_frames?: string; duration?: string; pix_fmt?: string }[]; format: { duration: string } };
  const video = info.streams.find(stream => stream.codec_type === 'video');
  if (!video) throw new Error('EPISODE_VIDEO_STREAM_MISSING');
  return { widthPixels: video.width, heightPixels: video.height, codec: video.codec_name, pixelFormat: video.pix_fmt,
    frameRate: video.r_frame_rate, averageFrameRate: video.avg_frame_rate, frameCount: Number(video.nb_read_frames),
    durationSeconds: Number(video.duration ?? info.format.duration), hasAudio: info.streams.some(stream => stream.codec_type === 'audio') };
}
