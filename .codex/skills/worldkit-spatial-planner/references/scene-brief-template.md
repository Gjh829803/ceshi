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
参考图可见前景平台、中景谷地、远景宫殿、外围山体，以及位于入口的主体。

## 推断的世界延伸
单张图未覆盖的侧后方延伸为连贯户外地形；该部分是为了可玩连续性作出的工程推断，不声称来自参考图。

## 仅视觉层设想
月光、材质、雾、纹理和服装细节只属于后续视觉生成，不转化为碰撞几何。

## 运动模式
陆地步行：主体在连续地面上自然行走和奔跑。

## 空间
首帧前景平台只是世界入口，中段谷地向左右展开，远端宫殿及其外围区域可抵达。镜头外的侧后方仍有与请求相称的地形变化和有意义探索区域，而不是用空白边界填大地图。

## 通行
这是开放地面场景，除建筑、山石等实体碰撞外全图可通行，不设计道路或首选路线。

## 首帧
严格正后方第三人称视角。主体的整体视觉重心、身体/载具主轴与头部或驾驶者严格压在画面 50% 宽度的垂直中线上，完整背朝镜头并正对远景中央宫殿；不得斜后方、三分之四背面、越肩或任何轻微左右偏移。

## 视觉目标
- 主体｜月下旅人：完整人物轮廓与用户参考外观
- 标志物｜月宫：具有多层东方屋顶与中央高塔轮廓的完整宫殿
```

Delete unused visual-target example lines. Keep 1-5 total; never pad the list.
When several complete instances intentionally share one appearance, replace the landmark line with `- 重复标志物｜名称：共同外观说明` and keep them as one target.
The seven common movement labels are examples. A custom line such as `磁力墙面行走：主体可吸附墙面并沿连续墙体移动。` is valid when it better matches the request.
The `用户事实`, `可见参考证据`, `推断的世界延伸`, and `仅视觉层设想` sections keep provenance explicit. Never present an inferred continuation or a visual-only idea as observed geometry.
The `空间` section must identify an entry slice, middle area, and meaningful off-camera/remote exploration appropriate to the request. Do not add dimensions or coordinates; the Builder derives and validates them against the current resource budget and traversability contracts.
The entry whitebox image derived from this Brief always uses the Skill's uniform neutral clear daytime inspection light. Any moonlight, night, sunset, fog-darkness, interior darkness, or stylized exposure described by the reference is deferred to the later styled first-frame stage and never changes whitebox illumination.
