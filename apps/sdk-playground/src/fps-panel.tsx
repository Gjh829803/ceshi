import React, { useRef, useEffect, useState, useSyncExternalStore } from "react";
import type { FrameRateReading } from "@worldkit/preset-content/fps";
import { performanceDetails } from "./performance-details";

function PerformanceDetails() {
  const data = useSyncExternalStore(performanceDetails.subscribe, performanceDetails.getSnapshot);
  useEffect(() => { performanceDetails.setEnabled(true); return () => performanceDetails.setEnabled(false); }, []);
  const ms = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(2)} ms`;
  const gpuLabel = data?.gpuStatus === 'unsupported' ? '不支持' : data?.gpuStatus === 'lost' ? '上下文丢失' : data?.gpuStatus === 'invalid' ? '样本无效' : data?.status === 'live' ? '等待结果' : '—';
  return <div className="performance-details-values">
    <div className="pace-row"><span>渲染分辨率</span><b>{data ? `${data.width} × ${data.height} px` : '—'}</b></div>
    <div className="pace-row"><span>渲染像素比例</span><b>{data ? data.pixelRatio.toFixed(2) : '—'}</b></div>
    <div className="pace-row" title="近 0.5 秒每个实时帧内所有固定更新的平均 CPU 耗时；不含显示插值与渲染"><span>CPU 更新</span><b>{ms(data?.cpuUpdate)}</b></div>
    <div className="pace-row" title="近 0.5 秒主游戏画面 renderer.render 调用的平均 CPU 耗时；不是 GPU 耗时"><span>CPU 渲染提交</span><b>{ms(data?.cpuSubmit)}</b></div>
    <div className="pace-row" title="最近一次有效的主游戏画面 GPU 异步计时；不包含屏幕呈现等待"><span>GPU</span><b>{data?.gpu != null ? ms(data.gpu) : gpuLabel}</b></div>
    <div className="pace-caption">{data?.status === 'hidden' ? '后台 · 采样暂停' : data?.status === 'idle' ? '暂停或无实时帧' : data?.status === 'live' ? '实时采样 · 每 0.5 秒更新' : '采样中…'}</div>
  </div>;
}
export function FramePacingView({
  reading, panels,
}: {
  panels?:import('./panel-state').PanelStateStore;
  reading: FrameRateReading | null;
}) {
  const [detailsOpen, setDetailsOpen] = useState(()=>panels?.read('performance').detailsOpen??false);
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
        渲染帧间隔 <span>近 5 秒</span>
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
        aria-label="最近五秒游戏渲染帧间隔曲线，越高代表等待越久，图表上限100毫秒"
      />
      <div className="pace-caption">曲线 0–100 ms · 越低越均匀</div>
      <div className="pace-note" title="随游戏自动统计主画面实时渲染帧，近 1 秒平均，每 0.5 秒更新；不代表 GPU 完成或屏幕最终呈现帧率。">
        <div className="pace-row"><strong>游戏实时 FPS</strong><b data-game-fps>{r ? r.fps.toFixed(0) : "—"}</b></div>
        <div className="pace-caption">主画面渲染计数 · 自动检测</div>
      </div>
      <button className="performance-details-toggle" type="button" aria-expanded={detailsOpen} aria-controls="performanceDetails" onClick={() => {setDetailsOpen(!detailsOpen);panels?.update('performance',{detailsOpen:!detailsOpen});}}>
        {detailsOpen ? '▾' : '▸'} 详细信息
      </button>
      {detailsOpen && <div id="performanceDetails"><PerformanceDetails/></div>}
    </section>
  );
}
