# Scene Brief Template

Keep every section short. The file is the unified Planner's natural-language authority for its two generated planning images and for the Builder; it is not a geometry specification.

```md
# WorldKit Scene Brief

## 场景
开阔山谷中的月下宫殿世界。完整环境包含前景平台、中景谷地、远景宫殿与外围山体。

## 主体
一名普通第三人称旅人；衣物和背包只属于最终外观。

## 用户事实
用户要求依据参考图创建一个可操作的户外白模世界，并保持主体、地形、水面和核心物件的语义一致。

## 可见参考证据
参考图可见较低的前景平台、中景谷地、远端高台宫殿与有实际厚度的外围山体；一条由低处开始、持续抬升并经过主要落脚平台的石阶/桥体到达更高的山门。宫殿基座高于中景谷地，桥下与两侧保留明显落差，而不是同一水平面的屏幕分区。

## 推断的世界延伸
单张图未覆盖的左右侧、入口后方和远端延伸为同一个连续户外世界；完整俯视可探索占地至少是参考图可见地理范围的四倍，通常向可见宽度和深度各延伸约两倍。新增区域延续谷地、山体和宫殿的相对关系，并包含真实侧后方地形与远端目的地，而不是空白填充。该部分是为了完整探索作出的工程推断，不声称来自参考图。

## 仅视觉层设想
月光、材质、雾、纹理和服装细节只属于后续视觉生成，不转化为碰撞几何。

## 运动模式
- 陆地步行：主体在地面上自然行走和奔跑。
- 空中飞行：主体也能离开地面自由升降和转向。

## 空间
一个连续的入口山谷世界：首帧前景低平台只占完整俯视范围约四分之一，中段谷地向左右和入口后方展开，石阶/桥体按参考图方向与曲率逐级升至远端高台山门；山门后、宫殿两侧和外围山体继续构成同一地理空间。外围山体在桥两侧和宫殿后方具有连续深度，不是面向镜头的薄墙。镜头外空间包含真实侧谷、后方平台和远端探索区域，而不是用空白边界填大地图。

## 通行
浅绿色只标记陆地步行所使用的真实地面、平台、桥面和台阶；空中飞行范围不画路线或可行区域。参考图明确可见的上升石阶/桥体必须具有连续抬升、主要落脚平台、足够宽度与两侧落差。由于同一主体还可飞行，不要求所有浅绿色地面彼此连通；飞行通过的空气保持为空，只保留实体碰撞。

## 首帧
严格正后方第三人称视角。主体的整体视觉重心、身体/载具主轴与头部或驾驶者严格压在画面 50% 宽度的垂直中线上，完整背朝镜头并正对远景中央宫殿；不得斜后方、三分之四背面、越肩或任何轻微左右偏移。

## 视觉目标
- 主体｜月下旅人：完整人物轮廓与用户参考外观
- 标志物｜月宫：具有多层东方屋顶与中央高塔轮廓的完整宫殿
```

Delete unused visual-target example lines. Keep 1-5 total; never pad the list.
Always keep one continuous geographic world in the current workflow. Do not
add S1/S2 panels, portals, teleports, or a second hidden scene.
When several complete instances intentionally share one appearance, replace the landmark line with `- 重复标志物｜名称：共同外观说明` and keep them as one target.
`标志物` is not limited to buildings. A prominent non-controlled person,
animal, creature, mount, vehicle, machine, sculpture, or signature prop uses
`- 标志物｜名称：完整身份与外观说明` when its identity materially defines the
reference. Several intentionally identical important instances use one
`重复标志物` line. Keep `主体` reserved for the one controlled Subject; ordinary
background crowds, herds, traffic, and decoration do not consume target slots.
The seven common movement labels are examples. Use one bullet per real mode and
put the startup/default mode first. A custom line such as
`- 磁力墙面行走：主体可吸附墙面并沿连续墙体移动。` is valid when it better matches the request.
The `用户事实`, `可见参考证据`, `推断的世界延伸`, and `仅视觉层设想` sections keep provenance explicit. Never present an inferred continuation or a visual-only idea as observed geometry.
The `空间` section must identify an entry slice, middle area, meaningful
off-camera/remote exploration, and the one continuous footprint whose area is
at least four times the reference-visible geography. Do not add meter dimensions
or coordinates; the Builder derives them against current resources.
Both Planner images derived from this Brief use discrete cubes, the Skill's exact
functional/target colors, and uniform neutral clear daytime inspection light.
Any moonlight, night, sunset, fog-darkness, interior darkness, material, or
stylized exposure described by the reference is deferred to the later styled
first-frame stage and never changes block-whitebox illumination.
