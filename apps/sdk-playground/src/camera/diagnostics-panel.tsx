import {useEffect,useState} from 'react';
import type {CameraInspection} from '@worldkit/three';
import {Button} from '../components/ui/button';
import type {CameraEditorBinding} from './binding';

/** Live readings have their own render boundary; unchanged parameter controls do
 * not rerender on every observed camera tick. The SDK remains the only owner. */
export function CameraDiagnosticsPanel({binding,snapshotInspection}:{binding:CameraEditorBinding;snapshotInspection:CameraInspection|undefined}) {
  const [inspection,setObserved]=useState<CameraInspection>();
  const {state}=binding;
  useEffect(()=>binding.subscribeInspection?.(setObserved),[binding]);
  useEffect(()=>setObserved(binding.inspect?.()??snapshotInspection),[binding,snapshotInspection]);
  return <>
      {inspection?.viewSelection && <div aria-label="相机视角选择">
        <p>视角来源：{{default:"默认",rule:"状态规则",manual:"手动选择",retained:"保留可用视角"}[inspection.viewSelection.source]}
          {inspection.viewSelection.ruleId && ` · ${inspection.viewSelection.ruleId}`}
          {inspection.viewSelection.suspendedBy && ` · ${inspection.viewSelection.suspendedBy === "editing" ? "编辑草稿中" : "录制控制中"}`}
        </p>
        {inspection.viewSelection.pending && <p>等待切换：{inspection.viewSelection.pending.viewId}</p>}
        {inspection.viewSelection.unavailableDefaultView && <p>默认视角 {inspection.viewSelection.unavailableDefaultView.viewId} 不可用：{inspection.viewSelection.unavailableDefaultView.failure?.message ?? "当前主体不支持"}；保留 {inspection.viewSelection.viewId}</p>}
        {inspection.viewSelection.unavailableRules.map(rule=><p key={rule.ruleId}>{rule.ruleId} → {rule.viewId}：{rule.reason === "state-unavailable" ? "主体未提供该状态" : rule.failure?.message ?? "视角暂不适用于当前主体"}</p>)}
        <Button variant="secondary" onClick={()=>state.resumeAutomatic()}>恢复自动选择</Button>
      </div>}
      {binding.setPerformanceEnabled && <details>
        <summary>相机性能采样</summary>
        <label><input type="checkbox" aria-label="相机性能采样" checked={inspection?.performance?.status === 'measured'}
          onChange={event => {binding.setPerformanceEnabled?.(event.target.checked);setObserved(binding.inspect?.());}} />按需采样 CPU 耗时</label>
        <p>每阶段保留最近 240 次调用；探针耗时已包含在阶段耗时中。此处不代表 GPU 耗时或屏幕帧率。</p>
        {inspection?.performance?.status === 'unavailable' && <p>计时不可用：{inspection.performance.reason}</p>}
        {inspection?.performance?.status === 'measured' && <table aria-label="相机阶段耗时">
          <thead><tr><th>阶段</th><th>样本</th><th>P95 / 最大（ms）</th><th>探针次数 / 总耗时（ms）</th></tr></thead>
          <tbody>{Object.entries(inspection.performance.stages).map(([stage, value]) => <tr key={stage}>
            <td>{{input:'输入与选择',fixed:'固定步求解',presentation:'显示修正'}[stage]}</td><td>{value.count}</td>
            <td>{value.p95Milliseconds.toFixed(3)} / {value.maximumMilliseconds.toFixed(3)}</td>
            <td>{value.queryCount} / {value.queryMilliseconds.toFixed(3)}</td>
          </tr>)}</tbody>
        </table>}
      </details>}
  </>;
}
