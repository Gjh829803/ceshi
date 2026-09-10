import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChoiceSelect, ChoiceOption } from "./components/choice-select";
import { Icon } from "./components/icon";
import { MAPS } from "../../../shared/preset-content/environment/maps";
import { DRAGON_TRAINING, trainingMapHref } from "./training-destinations";
import "./styles.css";
import "./styles/workspace.css";
import "./styles/dragon-training.css";

function DragonTraining() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch("./flying-creature/bundle.json", { signal: abort.signal })
      .then(async (response) => setAvailable(response.ok && (await response.json()).kind === "flying-creature-training"))
      .catch(() => { if (!abort.signal.aborted) setAvailable(false); });
    return () => abort.abort();
  }, []);
  return <main className="dragon-training-page">
    <header className="workspace-header">
      <div className="brand"><span className="brand-emblem">V</span><strong>VECTOR</strong></div>
      <div className="scene-switch">
        <Icon name="box" />
        <label className="sr-only" htmlFor="mapSelect">当前训练地图</label>
        <ChoiceSelect id="mapSelect" value={DRAGON_TRAINING.id} onValueChange={(id) => {
          if (id !== DRAGON_TRAINING.id) location.assign(trainingMapHref(id));
        }}>
          {MAPS.map((map) => <ChoiceOption key={map.id} value={map.id}>{map.name}</ChoiceOption>)}
          <ChoiceOption value={DRAGON_TRAINING.id}>{DRAGON_TRAINING.name}</ChoiceOption>
        </ChoiceSelect>
      </div>
      <span className="dragon-training-caption">飞行生物 · 骑乘、悬停与空中操控</span>
      <a className="dragon-training-return" href={trainingMapHref("campus")}>返回综合园区</a>
    </header>
    {available === true ? <iframe className="dragon-training-frame" title="飞龙训练场" src="./flying-creature/flying-creature.html" allow="fullscreen" />
      : <section className="dragon-training-status" role="status">
        <h1>{available === null ? "正在准备飞龙训练场…" : "飞龙训练场暂时不可用"}</h1>
        <p>{available === null ? "即将进入空中训练区域" : "本站尚未提供训练场资源，请联系维护者。可以从顶部菜单选择其他场地。"}</p>
      </section>}
  </main>;
}
createRoot(document.getElementById("app")!).render(<DragonTraining />);
