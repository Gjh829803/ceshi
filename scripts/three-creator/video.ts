/** Preserve MediaRecorder frame timestamps when encoding the single MP4 output.
 * `-vsync passthrough` is supported by FFmpeg 4.4 and has the same single-stream
 * behavior as `-fps_mode passthrough`. The millisecond encoder clock prevents
 * rounding irregular browser frames to a nominal constant frame rate.
 */
export function recordedVideoEncodingArgs(inputPath: string, outputPath: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
    '-vsync', 'passthrough', '-c:v', 'libx264', '-enc_time_base', '1:1000',
    '-bf', '0', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', outputPath];
}
