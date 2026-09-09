import React, { useRef, useEffect } from "react";
import type { FrameRateReading } from "../../../shared/preset-content/fps";
export function FramePacingView({
  reading,
}: {
  reading: FrameRateReading | null;
}) {
  const r = reading,
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 320, 60);
    if (!r) return;
    const buckets = new Float32Array(160);
    for (const sample of r.history) {
      const n = Math.max(
        0,
        Math.min(159, Math.floor((1 - sample.age / 5000) * 159)),
      );
      buckets[n] = Math.max(buckets[n]!, sample.duration);
    }
    ctx.strokeStyle = "#91aeb64a";
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(320, 40);
    ctx.stroke();
    for (let n = 0; n < buckets.length; n++) {
      const interval = buckets[n]!;
      if (!interval) continue;
      ctx.fillStyle = interval > 1000 / 30 ? "#f4b36d" : "#baf2db";
      const h = Math.max(1, Math.min(interval / 100, 1) * 60);
      ctx.fillRect(n * 2, 60 - h, 2, h);
    }
  }, [r]);
  return (
    <section
      className="panel frame-pacing"
      data-spike={(!!r && r.over33ms > 0) || undefined}
    >
      <div className="pace-heading">
        回调间隔 <span>近 5 秒</span>
      </div>
      <div className="pace-row">
        P95 <b>{r ? `${r.p95.toFixed(1)} ms` : "—"}</b>
      </div>
      <div className="pace-row">
        最长间隔 <b>{r ? `${r.maximum.toFixed(1)} ms` : "—"}</b>
      </div>
      <div className="pace-row">
        超过 33 ms <b>{r ? `${r.over33ms} 次` : "—"}</b>
      </div>
      <canvas
        ref={canvas}
        width="320"
        height="60"
        aria-label="最近五秒回调间隔曲线，越高代表等待越久，图表上限100毫秒"
      />
      <div className="pace-caption">曲线 0–100 ms · 越低越均匀</div>
      <div className="pace-note">屏幕实际呈现帧率：未测量</div>
    </section>
  );
}
