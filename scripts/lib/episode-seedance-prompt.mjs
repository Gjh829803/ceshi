function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export const EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION =
  "worldkit-reference-video-six-capture@6";

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
    : "最终环境的时间、天气、材质、灯光、色温和画面风格严格按@图片1呈现。";
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

export function buildEpisodeSeedancePrompt({
  sceneBrief,
  motionRenderingGuidance,
  events,
  segmentVisualPrompt = "",
  visualReferenceLines = [],
}) {
  if (!Array.isArray(events) || events.length > 2) {
    throw new Error("Zero to two visual events are allowed per 30-second capture.");
  }
  const scene = markdownSection(sceneBrief, "场景") || "严格按@图片2呈现本段地点与空间气氛。";
  const visual = finalVisualDescription(sceneBrief);
  const eventPrompts = events.map((event, index) => [
    `事件 ${index + 1}：`,
    event.eventPrompt || eventTimeline(event, Number(event.segmentRelativeSeconds)),
  ].join("\n")).join("\n\n");
  const spatial = [
    markdownSection(sceneBrief, "空间与地形"),
    markdownSection(sceneBrief, "空间"),
    markdownSection(sceneBrief, "视觉标志物"),
    markdownSection(sceneBrief, "视觉目标"),
    markdownSection(sceneBrief, "可探索范围"),
  ].filter(Boolean).join(" ");
  const subject = markdownSection(sceneBrief, "主体");
  const movementModes = markdownSection(sceneBrief, "运动模式");
  const finalFrame = [
    segmentVisualPrompt
      ? `当前片段可见性与构图白名单（最高优先级）：${oneLine(segmentVisualPrompt)}`
      : "",
    `地点与空间：${scene}`,
    subject ? `主体最终身份与基础外观：${subject}` : "",
    spatial
      ? `世界背景信息（只解释同一世界的身份和地理，不代表本片段必须看见其中每个目标）：${spatial}`
      : "",
    movementModes ? `主体运动语境：${movementModes}` : "",
    `时间、天气、地面和建筑材质、主光方向、色温与画面风格：严格遵循@图片1。${visual}`,
    events.length > 0
      ? `时间线变化（${events.length} 个独立大型视觉事件，严格按各自时间执行）：\n${eventPrompts}`
      : "时间线变化：本段没有 Prompt Event。保持基础场景、主体外观、天气和灯光连续稳定；不得自行增加变身、技能、环境突变或大型视觉事件。",
  ].filter(Boolean).join("\n");
  const motionDetail = naturalMotionDetail(sceneBrief, motionRenderingGuidance);
  const triViewResponsibilities = visualReferenceLines.length > 0
    ? visualReferenceLines.map((line, index) =>
      `@图片${index + 2}：${line}。它提供该完整目标的正面、右侧面和背面外观、比例、轮廓、材质与细节；只补全视频中该目标的最终外观，不改变@视频1中的位置、可见比例、遮挡和运动。`).join("\n")
    : "";

  return `参考素材职责：

@视频1是本视频唯一且严格的运动、镜头和空间调度参考。
严格复现@视频1中的相机路径、镜头速度、焦点变化、起止构图、人物站位、
移动方向、动作时序、关键姿态、遮挡关系和最终落点。
每一时刻的透视消失点、主体占屏比例、可前进区域边界、地平线高度、近中远景
视差、标志物裁切比例和相互遮挡都以@视频1为准。视频里只露出一部分的目标，
最终画面也只能露出相同部分；不得为了展示设计而后退镜头、抬高镜头或扩大视野。

@视频1不提供最终视觉外观。
忽略其中的白膜材质、灰色占位体、简化几何、低模背景、视窗网格、
坐标轴、线框、辅助线、文字和标记。
最终视频中不得出现任何灰模、白模或3D视窗痕迹。

@图片1是当前镜头最终主体、环境、材质、灯光、色彩和艺术风格的基准。
严格保持其中可见主体身份、服装/外壳、建筑与地貌材质、空间气氛、色调、
天气与主光方向；只迁移最终外观，不改变@视频1规定的空间、动作和镜头。
第 0 帧必须严格复现@图片1里主体面对镜头的哪一侧：如果@图片1看到的是背包、
后脑和背部，就必须保持完整背面朝镜头，不得露出正面面罩、胸甲或把人物转成正面；
如果@图片1看到的是正面或侧面，也必须保留对应可见侧，不得发生前后交换。
把@图片1中的细颗粒材质、边缘磨损、反射粗糙度、织物/金属/岩石/植物层次、
大气透视、阴影软硬、接触阴影和综合色调完整带入视频。不要把白膜方块边缘、
规则网格或语义色块当成最终造型；关键标志物可以恢复成自然、完整且高细节的
真实形态，但它在画面中的包围盒、可见面积、方向、裁切和遮挡必须服从@视频1。

${triViewResponsibilities}

三视图是条件式外观字典，不是场景清单。只有某目标在@视频1当前时刻或@图片1中
真实可见时，才允许调用对应三视图补充它的外观；如果目标在本段@视频1和@图片1中
缺席，就必须从最终视频中缺席，绝对不得因为提供了三视图、Scene Brief 提到了它、
或希望展示完整设计而把它新增到地平线、天空、前景或背景。
当主体背面朝镜头时，只能把主体三视图的 Back 面板用于当前可见侧；Front 和 Right
面板仅作为身份与结构连续性证据，绝对不是把正面、面罩或胸甲转向镜头的姿态命令。
当前镜头看不到的面不得被强行转到镜头前；
当目标只露出局部时，仍按@视频1保留相同裁切和遮挡，只用三视图补足其真实设计。
三视图用于锁定同一目标跨帧的轮廓、比例、配色分区、材质连接、服装/外壳结构和
背侧细节，防止转身或相机绕行时身份漂移；它们不提供新的场景布局，也不允许把
三视图中的正交展示角度覆盖到@视频1的透视镜头上。

最终画面：
${finalFrame}

动作：
动作具有自然重量、惯性、重心转换、衣物滞后和真实接触感。
转向、行动、跳跃、加速等的发生时机、移动方向、空间结果和整体节奏严格遵循@视频1，
但应该基于实际场景补充自然合理的完整动作和过渡帧。
${motionDetail}
补充动作只能发生在既有根运动内部：脚掌、轮胎、桨叶、翼面或载具必须与可见介质
形成持续而可信的接触和受力反馈；身体重心、惯性、二级摆动与运动模糊在相邻帧之间
连续。禁止用瞬移、滑脚、原地踏步或突然改变朝向来修饰白膜动作。

摄影：
保持@视频1的镜头轨迹和镜头节奏。
35mm镜头，稳定第三人称轨道跟拍，并严格复现@视频1真实存在的观察、转向与环绕，
自然运动模糊，稳定空间连续性。
不得自行增加切镜、反打、旋转或额外推拉。
相机必须始终保持@视频1的拍摄侧、跟随距离、俯仰关系、转向响应和运动速度；即使大型
视觉事件发生，也不能为了强调事件改变机位。景深、曝光与运动模糊可以按最终风格
自然细化，但不能遮蔽主体、道路边界或关键标志物，也不能造成焦点跳变。

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
