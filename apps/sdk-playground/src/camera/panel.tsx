import "./editor.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CAMERA_FIELD_METADATA,
  CAMERA_STRATEGY_DEFAULTS,
  serializeCameraDocument,
  type CameraFieldMetadata,
  type CameraInspection,
} from "@worldkit/three";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Input } from "../components/ui/input";
import { ChoiceSelect, ChoiceOption } from "../components/choice-select";
import {
  CameraEditorState,
  fieldInputKey,
  fieldProvenance,
  readPath,
  scopeValues,
  type EditScope,
} from "./editor-state";
import type {CameraEditorBinding} from "./binding";
import {CameraDiagnosticsPanel} from "./diagnostics-panel";

const display = (v: unknown) =>
  v === undefined ? "继承" : typeof v === "string" ? v : JSON.stringify(v);
function Field({
  field,
  value,
  onChange,
  onBegin,
  onEnd,
}: {
  field: CameraFieldMetadata;
  value: unknown;
  onChange(value: string): void;
  onBegin(): void;
  onEnd(): void;
}) {
  const [text, setText] = useState(
    display(value) === "继承" ? "" : display(value),
  );
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === undefined ? "" : display(value));
  }, [value]);
  // Render discriminated choices when every required payload has a schema
  // default. Other unions retain their lossless JSON editor.
  const branches = field.schema.oneOf as {properties?: Record<string, Record<string, unknown>>}[] | undefined;
  const choices = branches?.every(branch => typeof branch.properties?.kind?.const === 'string' &&
    Object.entries(branch.properties).every(([key, value]) => key === 'kind' || value.type === 'number' && typeof value.default === 'number')) ? branches : undefined;
  if (choices) {
    let current: Record<string, unknown> | undefined;
    try { current = text ? JSON.parse(text) : undefined; } catch { /* Show the invalid raw input below. */ }
    if (!text || current && typeof current.kind === 'string' && choices.some(branch => branch.properties!.kind!.const === current.kind)) {
      const selected = choices.find(branch => branch.properties!.kind!.const === current?.kind);
      const change = (value: Record<string, unknown> | undefined) => { const next = value ? JSON.stringify(value) : ''; setText(next); onChange(next); };
      return <>
        <ChoiceSelect aria-label={`${field.path} 类型`} value={String(current?.kind ?? '__inherit')}
          onValueChange={kind => {
            if (kind === '__inherit') { change(undefined); return; }
            const branch = choices.find(branch => branch.properties!.kind!.const === kind)!;
            change(Object.fromEntries(Object.entries(branch.properties!).map(([key, value]) => [key, key === 'kind' ? kind : value.default])));
          }}>
          <ChoiceOption value="__inherit">继承</ChoiceOption>
          {choices.map(branch => <ChoiceOption key={String(branch.properties!.kind!.const)} value={String(branch.properties!.kind!.const)}>{String(branch.properties!.kind!.const)}</ChoiceOption>)}
        </ChoiceSelect>
        {selected && Object.entries(selected.properties!).filter(([key]) => key !== 'kind').map(([key]) => <Input
          key={key} type="number" step="any" aria-label={`${field.path}.${key}`}
          value={typeof current?.[key] === 'number' ? current[key] : ''}
          onFocus={onBegin} onBlur={onEnd}
          onChange={event => change({...current!, [key]: event.target.value === '' ? null : Number(event.target.value)})} />)}
      </>;
    }
  }
  const options = field.schema.type === "boolean" ? ["true", "false"] : field.schema.enum as string[] | undefined;
  const minimum =
    field.schema.minimum ??
    (typeof field.schema.exclusiveMinimum === "number"
      ? field.schema.exclusiveMinimum + 0.01
      : undefined);
  const maximum =
    field.schema.maximum ??
    (typeof field.schema.exclusiveMaximum === "number"
      ? field.schema.exclusiveMaximum - 0.01
      : undefined);
  return options ? (
    <ChoiceSelect
      aria-label={field.path}
      value={text || "__inherit"}
      onValueChange={(value) => {
        const next = value === "__inherit" ? "" : value;
        setText(next);
        onChange(next);
      }}
    >
      <ChoiceOption value="__inherit">继承</ChoiceOption>
      {options.map((v) => (
        <ChoiceOption key={v} value={v}>
          {field.schema.type === "boolean" ? v === "true" ? "开启" : "关闭" : v}
        </ChoiceOption>
      ))}
    </ChoiceSelect>
  ) : (
    <>
      <Input
        aria-label={field.path}
        value={text}
        placeholder="继承（清空覆盖）"
        onFocus={() => {
          focused.current = true;
          onBegin();
        }}
        onBlur={() => {
          focused.current = false;
          onEnd();
        }}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
      {typeof minimum === "number" &&
        typeof maximum === "number" &&
        text !== "" &&
        Number.isFinite(Number(text)) && (
          <Slider
            aria-label={`${field.path} 滑块`}
            min={minimum}
            max={maximum}
            step={0.01}
            value={[Number(text)]}
            onPointerDownCapture={onBegin}
            onKeyDownCapture={onBegin}
            onValueChange={([value]) => {
              if (value !== undefined) {
                setText(String(value));
                onChange(String(value));
              }
            }}
            onValueCommit={onEnd}
            onBlur={onEnd}
          />
        )}
    </>
  );
}
/** The same panel is mounted by Inspector and Workbench against one document/session. */
export function CameraPanel({
  binding,
  subjectId = "person",
}: {
  binding: CameraEditorBinding;
  subjectId?: string;
}) {
  const { state, client } = binding,
    s = useSyncExternalStore(state.subscribe, state.getSnapshot);
  const [observed, setObserved] = useState<CameraInspection>();
  useEffect(() => {
    setObserved(binding.inspect?.());
    return binding.subscribeInspection?.(next => setObserved(previous => previous?.resolved === next.resolved && previous?.mode === next.mode ? previous : next));
  }, [binding]);
  useEffect(() => { if (s.inspection) setObserved(s.inspection); }, [s.inspection]);
  const inspection = observed ?? s.inspection;
  const [view, setView] = useState(s.draft.defaultViewId),
    [kind, setKind] = useState<EditScope["kind"]>("subject"),
    [subject, setSubject] = useState(subjectId),
    [preview, setPreview] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const previewHost = useRef<HTMLDivElement>(null),
    previewController = useRef<
      ReturnType<CameraEditorBinding["preview"]> | undefined
    >(undefined);
  useEffect(() => setSubject(subjectId), [subjectId]);
  useEffect(() => {
    if (!preview || !previewHost.current) return;
    const controller = binding.preview(previewHost.current);
    previewController.current = controller;
    return () => {
      controller.dispose();
      previewController.current = undefined;
    };
  }, [preview, binding]);
  const selected = s.draft.views[view] ?? s.draft.views[s.draft.defaultViewId]!;
  const presetId =
    s.draft.binding.subjectOverrides?.[subject]?.views[view]?.presetId ??
    selected.presetId;
  const scope: EditScope =
    kind === "view"
      ? { kind }
      : kind === "subject"
        ? { kind, id: subject }
        : { kind, id: presetId ?? "" };
  const fields = CAMERA_FIELD_METADATA.filter((f) => f.kind === selected.kind);
  const committed = inspection?.resolved,
    known = committed?.viewId === view && committed.subjectId === subject;
  const groups = [...new Set(fields.map((f) => f.path.split(".")[0]!))];
  const imported = async (file: File | undefined) => {
    if (file) state.editDocument(await file.text());
  };
  const download = () => {
    const url = URL.createObjectURL(
        new Blob([serializeCameraDocument(s.draft) + "\n"], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `${state.project.configurationId}-camera.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section
      className="camera-document-editor"
      aria-label="项目相机编辑器"
      style={{
        display: "grid",
        gap: 10,
        minWidth: 0,
        overflowWrap: "anywhere",
      }}
    >
      <div className="camera-document-context">
        <h3>项目相机 · {state.project.configurationId}</h3>
        <output aria-label="相机保存状态">
          {s.dirty ? "未保存草稿" : "与项目文件一致"} ·{" "}
          {s.recovered ? "本机恢复副本" : "当前会话"} · 文件：
          {
            {
              idle: "已载入项目文件",
              saving: "保存中",
              saved: "已保存",
              failed: "保存失败",
              conflict: "版本冲突",
            }[s.saveStatus]
          }{" "}
          ·{" "}
          {state.adopted()
            ? "已保存版本已被当前构建与运行时采用"
            : "已保存版本尚未确认被构建与运行时采用"}{" "}
          · 草稿应用：{" "}
          {s.appliedDraftRevision === undefined
            ? "尚未应用"
            : `已应用（修订 ${s.appliedDraftRevision}）`}{" "}
          / 基线 {s.baselineRevision ?? "未提交"}
        </output>
      </div>
      <ChoiceSelect
        aria-label="相机编辑视图"
        value={view}
        onValueChange={setView}
      >
        {Object.keys(s.draft.views).map((id) => (
          <ChoiceOption key={id} value={id}>
            {id}
          </ChoiceOption>
        ))}
      </ChoiceSelect>
      <ChoiceSelect
        aria-label="相机编辑主体"
        value={subject}
        onValueChange={setSubject}
      >
        {[
          ...new Set([
            subject,
            ...Object.keys(s.draft.binding.subjectOverrides ?? {}),
          ]),
        ].map((id) => (
          <ChoiceOption key={id} value={id}>
            {id}
          </ChoiceOption>
        ))}
      </ChoiceSelect>
      <ChoiceSelect
        aria-label="相机编辑作用域"
        value={kind}
        onValueChange={(v) => setKind(v as EditScope["kind"])}
      >
        <ChoiceOption value="view">项目视图</ChoiceOption>
        <ChoiceOption value="subject">项目主体</ChoiceOption>
        <ChoiceOption value="preset" disabled={!presetId}>
          预设快照 {presetId ?? "未绑定"}
        </ChoiceOption>
      </ChoiceSelect>
      <p>
        有效值来自最近 SDK 提交；
        {known ? "当前所选主体/视图" : "所选主体/视图未观测，有效值未知"}
        。清空字段移除当前覆盖。联合对象使用 JSON。
      </p>
      {groups.map((group) => (
        <details key={group} open={group === "lens"}>
          <summary>
            {(
              {
                lens: "镜头",
                position: "跟随构图",
                orientation: "朝向",
                constraints: "碰撞与收缩",
                subjectFade: "近距离人物显示",
                effects: "效果",
                zoom: "缩放",
                framing: "开场构图",
              } as Record<string, string>
            )[group] ?? group}
          </summary>
          {fields
            .filter((f) => f.path.startsWith(group + "."))
            .map((field) => {
              const configured = readPath(
                  scopeValues(s.draft, scope, view),
                  field.path,
                ),
                value =
                  s.invalidInputs[fieldInputKey(scope, view, field.path)] ??
                  configured,
                provenance = known ? fieldProvenance(committed, field.path) : undefined;
              const inherited = readPath(
                CAMERA_STRATEGY_DEFAULTS[selected.kind],
                field.path,
              );
              const presetValue = readPath(
                  presetId ? s.draft.presets?.[presetId]?.values : undefined,
                  field.path,
                ),
                viewValue = readPath(selected.overrides, field.path);
              const control = (
                <label
                  key={`${kind}:${subject}:${view}:${field.path}`}
                  style={{ display: "grid", gap: 4, margin: "10px 0" }}
                >
                  <span>
                    {typeof field.schema.title === "string" ? field.schema.title : field.path} {field.unit ? `(${field.unit})` : ""}
                  </span>
                  {typeof field.schema.description === "string" && <small>{field.schema.description}</small>}
                  <Field
                    field={field}
                    value={value}
                    onBegin={() => state.beginGroup()}
                    onEnd={() => state.endGroup()}
                    onChange={(text) =>
                      state.field(scope, view, field.path, text)
                    }
                  />
                  <small>
                    继承层：SDK {display(inherited)} / 预设{" "}
                    {display(presetValue)} / 项目视图 {display(viewValue)} ·
                    当前覆盖 {display(value)} · 最近配置{" "}
                    {display(provenance?.configured)} · 有效{" "}
                    {provenance ? display(provenance.effective) : "未知"} · 来源{" "}
                    {provenance?.source ?? "未观测"}{" "}
                    {provenance?.inactiveReason
                      ? `未生效：${provenance.inactiveReason}`
                      : ""}
                  </small>
                </label>
              );
              return field.visibility === "advanced" ? (
                <details key={`${kind}:${subject}:${view}:${field.path}`}>
                  <summary>高级 · {field.path}</summary>
                  {control}
                </details>
              ) : (
                control
              );
            })}
        </details>
      ))}
      <h4>预览与相机基线</h4>
      <div className="camera-document-actions">
        <Button variant="secondary" onClick={binding.rebind}>
          重新绑定预览
        </Button>
        <Button variant="secondary" onClick={() => state.view(view)}>
          预览所选视图
        </Button>
        <Button variant="secondary" onClick={() => state.apply()}>
          应用草稿
        </Button>
        <Button variant="secondary" onClick={() => state.cancel()}>
          取消应用
        </Button>
        <Button variant="secondary" onClick={() => state.undo()}>
          撤销草稿
        </Button>
        <Button variant="secondary" onClick={() => state.commit()}>
          提交相机基线
        </Button>
        <Button variant="secondary" onClick={() => state.opening(view)}>
          采用当前画面为开场
        </Button>
        <Button variant="secondary" onClick={() => setPreview(!preview)}>
          独立自由预览
        </Button>
      </div>
      {preview && (
        <>
          <div
            ref={previewHost}
            aria-label="独立相机预览"
            style={{ height: 240 }}
          />
          <Button
            variant="secondary"
            onClick={() =>
              state.opening(view, previewController.current?.opening())
            }
          >
            采用独立预览为开场
          </Button>
        </>
      )}
      <CameraDiagnosticsPanel binding={binding} snapshotInspection={s.inspection} />
      <h4>项目文件</h4>
      <div className="camera-document-actions">
        <Button
          variant="secondary"
          disabled={!client || s.saveStatus === "saving"}
          onClick={() => {
            if (client) void state.save(client);
          }}
        >
          保存项目文件
        </Button>
        <Button
          variant="secondary"
          disabled={!client}
          onClick={() => {
            if (client) void state.refresh(client);
          }}
        >
          重新读取文件
        </Button>
        <Button variant="secondary" onClick={download}>
          导出 JSON
        </Button>
        <Button
          variant="secondary"
          onClick={() => importInput.current?.click()}
        >
          导入 JSON
        </Button>
        <Input
          ref={importInput}
          style={{ display: "none" }}
          aria-label="导入相机 JSON"
          type="file"
          accept="application/json,.json"
          onChange={(e) =>
            void imported(e.target.files?.[0]).catch((error) =>
              state.replace(String(error)),
            )
          }
        />
      </div>
      {!client && <p>静态页面：导入/导出可用，尚未写回项目文件。</p>}
      {s.conflict && (
        <div role="alert">
          文件冲突：草稿与外部版本均已保留。
          <Button variant="secondary" onClick={() => state.acceptExternal()}>
            采用外部文件
          </Button>
          <Button variant="secondary" onClick={() => state.keepDraft()}>
            保留草稿，以外部版本为保存基点
          </Button>
          <details>
            <summary>外部版本</summary>
            <pre style={{ maxHeight: 240, overflow: "auto" }}>
              {JSON.stringify(s.conflict, null, 2)}
            </pre>
          </details>
        </div>
      )}
      {Object.keys(s.invalidInputs).length > 0 && (
        <p role="alert">
          草稿有 {Object.keys(s.invalidInputs).length}{" "}
          个非法字段；输入已保留，不能应用或保存。
        </p>
      )}
      {s.error && <p role="alert">{s.error}（保留最后有效预览）</p>}
      <details>
        <summary>完整文档 / 开场 / 输入 / 过渡</summary>
        <textarea
          aria-label="完整相机文档"
          value={s.documentInput?.text ?? JSON.stringify(s.draft, null, 2)}
          onFocus={() => state.beginGroup()}
          onBlur={() => state.endGroup()}
          onChange={(e) => state.editDocument(e.target.value)}
          style={{ width: "100%", height: 240 }}
        />
        {s.documentInput?.error && (
          <>
            <p role="alert">
              完整文档输入无效：{s.documentInput.error}
              。原文已保留，不能应用或保存。
            </p>
            <Button
              variant="secondary"
              onClick={() => state.discardDocumentInput()}
            >
              放弃完整文档输入
            </Button>
          </>
        )}
      </details>
    </section>
  );
}
