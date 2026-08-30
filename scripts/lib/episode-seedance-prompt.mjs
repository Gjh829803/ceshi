function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export const EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION =
  "worldkit-reference-video-relaxed-action@1";

function markdownSection(source, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(source ?? "").match(new RegExp(`## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
  return oneLine(match?.[1]);
}

function finalVisualDescription(source) {
  const section = markdownSection(source, "仅视觉层设想");
  const retained = section.replace(/只属于后续视觉表现/g, "作为最终视觉外观").split("。").map((item) => item.trim()).filter((item) =>
    item && !/白膜|块状|碰撞|几何|规划图|检视光/.test(item));
  return retained.length > 0
    ? `${retained.join("。")}。`
    : "最终环境的时间、天气、材质、灯光、色温和画面风格严格按@图片2呈现。";
}

function naturalMotionDetail(sceneBrief, guidance) {
  const evidence = `${sceneBrief}\n${guidance}`.toLowerCase();
  if (/sandboard|skateboard|snowboard|ski|skating|滑板|滑雪|滑行/.test(evidence)) {
    return "滑板滑行时，应主动补充自然且清晰的蹬地加速、双脚调整、脚踝压板、屈膝吸震、髋部与上身倾斜、手臂平衡和连续转弯；跳跃时补充合理蓄力、空中平衡、落地屈膝与回弹，不必照抄白膜中的僵硬肢体姿态，但不得改变@视频1规定的主体根轨迹、速度阶段、方向、起跳落点或镜头。";
  }
  if (/paddle|kayak|rowboat|划桨|划艇|皮划艇/.test(evidence)) {
    return "划行时，应主动补充完整而有力的左右划桨循环、躯干转动、肩臂发力、桨叶入水抓水、出水回桨和身体随船惯性，不必照抄白膜中的简化肢体姿态；不得改变@视频1规定的船体根轨迹、速度阶段、朝向或镜头。";
  }
  if (/wing|glider|bird|翅膀|滑翔|飞行/.test(evidence)) {
    return "飞行时，应主动补充与升力、加速、爬升、下降和转弯相符的完整扇翼周期、滑翔、收展翼、身体倾斜与惯性随动，不必照抄白膜中的简化姿态；不得改变@视频1规定的主体根轨迹、速度阶段、朝向或镜头。";
  }
  return "行走、奔跑、转向和跳跃时，应主动补充完整的交替步态、蹬地、腾空、落脚、屈膝缓冲、重心转移、手臂摆动与衣物滞后，不必照抄白膜中的僵硬肢体姿态；不得改变@视频1规定的主体根轨迹、速度阶段、转向与起落时刻或镜头。";
}

function eventTimeline(event, relativeSeconds) {
  const ending = event.timing?.ending === "hold"
    ? "变化完成后保持到本段结束。"
    : event.timing?.ending === "fade"
      ? `变化完成后用 ${Number(event.timing.endingDurationSeconds).toFixed(1)} 秒自然消退。`
      : "变化完成后自然稳定。";
  return [
    `本段第 ${relativeSeconds.toFixed(3)} 秒开始，用 ${Number(event.timing?.transitionDurationSeconds).toFixed(1)} 秒完成变化。`,
    oneLine(event.beforeState),
    oneLine(event.transitionDescription),
    oneLine(event.afterState),
    ending,
  ].filter(Boolean).join(" ");
}

export function buildEpisodeSeedancePrompt({ sceneBrief, motionRenderingGuidance, event, executedRelativeSeconds }) {
  const scene = markdownSection(sceneBrief, "场景") || "严格按@图片2呈现本段地点与空间气氛。";
  const visual = finalVisualDescription(sceneBrief);
  const finalFrame = [
    `地点与空间：${scene}`,
    `时间、天气、地面和建筑材质、主光方向、色温与画面风格：严格遵循@图片2。${visual}`,
    `时间线变化：${eventTimeline(event, executedRelativeSeconds)}`,
  ].join("\n");
  const motionDetail = naturalMotionDetail(sceneBrief, motionRenderingGuidance);

  return `参考素材职责：

@视频1是本视频唯一且严格的运动、镜头和空间调度参考。
严格复现@视频1中的相机路径、镜头速度、焦点变化、起止构图、人物站位、
移动方向、动作时序、关键姿态、遮挡关系和最终落点。

@视频1不提供最终视觉外观。
忽略其中的白膜材质、灰色占位体、简化几何、低模背景、视窗网格、
坐标轴、线框、辅助线、文字和标记。
最终视频中不得出现任何灰模、白模或3D视窗痕迹。

@图片1是主角最终外观的唯一参考。
严格保持其面部、发型、体型、服装、配色、材质和身份一致。
只替换白膜角色的外观，不改变白膜视频规定的动作、位置和时间节奏。

@图片2是最终环境与灯光参考。
保持其中的建筑材质、空间气氛、色调和主光方向，
但空间布局、相机路径和遮挡关系仍以@视频1为准。

最终画面：
${finalFrame}

动作：
动作具有自然重量、惯性、重心转换、衣物滞后和真实接触感。
转向、行动、跳跃、加速等的发生时机、移动方向、空间结果和整体节奏严格遵循@视频1，
但应该基于实际场景补充自然合理的完整动作和过渡帧。
${motionDetail}

摄影：
保持@视频1的镜头轨迹和镜头节奏。
35mm镜头，稳定第三人称轨道跟拍，并严格复现@视频1已有的弧形环绕，
自然运动模糊，稳定空间连续性。
不得自行增加切镜、反打、旋转或额外推拉。

声音：
生成与画面事件严格同步的环境音和动作音效，包括脚步、载具、衣物、风声、
地面接触、碰撞及场景中真实可见声源产生的声音。
不得加入背景音乐、配乐、歌曲、歌声、对白、旁白、解说或任何人类语音。
不得用音乐替代环境音效，不得增加画面中没有声源依据的夸张声音。

限制：
主体身份全程一致；无角色交换；无额外人物；无肢体融合；
无穿模；无漂移；无闪烁；无材质跳变；无灰模残留；
无文字、字幕、Logo、水印、时间码或界面元素。`;
}
