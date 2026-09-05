# GPT-6 五案例云端交付记录

本报告只记录云端调用、真实工具反馈、交付身份与静态产物核验；不把链路交付视为视觉还原、完整道路可达或零缺陷验收。独立质量结论由 Root 的浏览器与视觉评审另行汇总。

本轮模型为 `gpt-6-astra / xhigh`，冻结 V3 Runtime 为 `sha256:67c79376c6b19117414f20799a96dd615ddf0063ea9485b61654ab4a02fe3613`，SDK源码快照 `9dff2e91`。后续本地诊断/URL修复及平台路由兼容层不计入本轮云端源码。

| 案例 | 最终 Job | 链路 | 云端处理秒 | CLI秒 | 试玩秒 | 目标 | 5米格数 | 移动米 | 工具调用 | 真实预览图 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 海岸灯塔 | `gen_7f4f2c564a32b853` | delivered | 1790.2 | 1788.4 | 260.0 | 19/19 | 96 | 618.3 | 65 | 6 |
| 森林瞭望塔 | `gen_1f04dd24d1d30a8d` | delivered | 2748.4 | 2593.5 | 180.0 | 3/3 | 36 | 425.5 | 145 | 9 |
| 纸月宫殿 | `gen_c18e93849298f49e` | delivered | 2505.9 | 2504.2 | 240.0 | 24/24 | 68 | 538.5 | 73 | 6 |
| 梯田山谷 | `gen_a4e89f0e4fc94dea` | delivered | 939.1 | 937.6 | 180.0 | 8/8 | 34 | 423.8 | 58 | 4 |
| 九尾狐麦田 | `gen_4a4f2b81c6d9ab90` | delivered | 704.9 | 703.5 | 180.0 | 6/6 | 30 | 424.9 | 44 | 3 |

剩余四例请求按用户要求并发提交；观察到的CLI区间最大重叠数为3。最初的宫殿请求受共享账户slot等待影响，不能把四个在途job等同于四个模型同时执行。

云端处理时间包括取账户槽的等待，CLI时间单列；模拟秒数与真实墙钟时间不同。每次测试仅覆盖作者提供的 waypoint 路线，不能据此推断所有地形可达。完整原始指标、token使用、工具计数与每一失败 operation 见同名JSON。

## 海岸灯塔

- Job：`gen_7f4f2c564a32b853`；Run：`gpt6-five-case-eval-20260905-r3`。
- sourceHash：`sha256:f7ba70e2b7ed8e034c05123900c13d6b6126071f6d4413c31558ddfe11edd8a2`。
- Archive：`sha256:4f1ed4da1b830f50065c0f376eec2865a148d1c2ef4407583525ff5e3a14c453`，15402444 bytes。
- 完整事件：`sha256:039c2c752de15a9bb941d661d49ad6d922530656e67e6208383cf30d2f5a0e7f`。
- Host报告：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-coast-lighthouse/host-artifact-verification.json`。
- Payload：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-coast-lighthouse/payload`。
- 工具计数：`creator_describe_environment=1`、`creator_get_authoring_schema=1`、`assets_search=2`、`assets_describe=1`、`world_validate=7`、`operations_get=38`、`world_preview=8`、`world_playtest=4`、`world_capture_triviews=2`、`world_submit=1`。

该任务内每轮失败记录（operation去重，保留短测未通过）：

| 轮次 | Operation | 类型 | 原因 |
| ---: | --- | --- | --- |
| 7 | `op-3e46ff13-bfac-4938-b352-9a6db287ba80` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_COLLIDER_DRIFT: Collider 'headland-lighthouse' geometry or traversal binding changed during build(). |
| 10 | `op-a4f20e7f-8100-4808-ba0e-9b0170b72a23` | world.playtest | PLAYER_STUCK_NEAR_TARGET: tide-pools |
| 13 | `op-9174fe0a-63d7-44c1-be96-2e5a25ede18d` | world.playtest | 工具报告failed；请求25s/实际25s，目标3/19，格数15，最远37.572227039758495m。 |
| 17 | `op-1d1a7919-cc16-41e9-9874-5e29e37f802c` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |

历史尝试：`gen_9a075d23684d2efe`（gpt6-five-case-eval-20260905），completed；codex exit=1; stdout=; stderr=09297Z ERROR codex_core::session: Failed to create session: required MCP servers failed to initialize: worldkit_creator: handshaking with MCP server failed: connection closed: initialize response Error: thread/start: thread/start failed: error creating thread: Fatal error: Failed to initialize session: required MCP servers failed to initialize: worldkit_creator: handshaking with MCP server failed: connection closed: initialize response (code -32603) CREATOR_LAUNCHER_FAILED: CREATOR_CODEX_EXIT_1 。

历史尝试：`gen_bc944f7058f0f303`（gpt6-five-case-eval-20260905-r2），completed；codex exit=1; stdout=; stderr=Reading additional input from stdin... CREATOR_LAUNCHER_FAILED: CREATOR_DELIVERY_CONTRACT_FAILED 。

## 森林瞭望塔

- Job：`gen_1f04dd24d1d30a8d`；Run：`gpt6-five-case-eval-20260905-r3`。
- sourceHash：`sha256:3978fca7905450297e309f31b8fd18661da837556179fe5e5303ae88d997eb01`。
- Archive：`sha256:5d3e208d27c1a75d4910472aa55ef0e5e474c3d896df69c40b0b01292d1188bc`，6894308 bytes。
- 完整事件：`sha256:56c124c605dd0f1d8f651ed60ee6b74370a3de944b3882e19394e6043f59bcd6`。
- Host报告：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-forest-lookout/host-artifact-verification.json`。
- Payload：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-forest-lookout/payload`。
- 工具计数：`creator_describe_environment=1`、`creator_get_authoring_schema=1`、`assets_search=4`、`world_validate=24`、`operations_get=84`、`world_preview=20`、`world_playtest=6`、`world_capture_triviews=4`、`world_submit=1`。

该任务内每轮失败记录（operation去重，保留短测未通过）：

| 轮次 | Operation | 类型 | 原因 |
| ---: | --- | --- | --- |
| 1 | `op-7d5eab85-6ba8-44cf-a802-01561ea12f2e` | world.validate | ../../../../../lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/a270dcbda4a23dbd/source/scene.ts (1:9): "defineBabylonNativeScene" is not exported by "scripts/creator/authoring.ts", imported by "../../../../../lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/a270dcbda4a23dbd/source/scene.ts". file: /fsx/pipeline/lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/a270dcbda4a23dbd/source/scene.ts:1:9 1: import { defineBabylonNativeScene, registerEntity } from '@worldkit/creator'; ^ 2: import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'; 3: import { Vector3 } from '@babylonjs/core/Maths/math.vector';  |
| 2 | `op-280508eb-68b3-4fe9-b32a-82d2be255425` | world.validate | ../../../../../lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/4e8412241bec379e/source/scene.ts (1:7): "default" is not exported by "scripts/creator/authoring.ts", imported by "../../../../../lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/4e8412241bec379e/source/scene.ts". file: /fsx/pipeline/lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/4e8412241bec379e/source/scene.ts:1:7 1: import defineBabylonNativeScene, { registerEntity } from '@worldkit/creator'; ^ 2: import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'; 3: import { Vector3 } from '@babylonjs/core/Maths/math.vector';  |
| 4 | `op-5841b501-8c2d-4cac-943b-e3ed5090c6c1` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 6 | `op-3486864a-27af-45a7-bcc3-1165272e8648` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 8 | `op-c8811e98-16b3-4933-b8a0-bc58e6baea12` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 12 | `op-c5c4eebe-ae8e-4274-ae13-ba4bb569cb71` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 14 | `op-a8d727fa-5c3e-4f68-beed-a64282497234` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 16 | `op-65ae8fcd-af56-4b0f-9191-8685a6ef2055` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 18 | `op-669d9e8b-6bb9-49d5-8fb4-ee416e73b171` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 20 | `op-d5c32a43-9e74-4cea-88f9-12f00efa3cd7` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 21 | `op-96bdf53c-e46a-4d31-9905-3655d89aadea` | world.validate | [vite:esbuild] Transform failed with 1 error: /fsx/pipeline/lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/79160e24dd92a10a/source/scene.ts:2:0: ERROR: Unexpected "}" file: /fsx/pipeline/lwdp_generation/gen_1f04dd24d1d30a8d/tasks/gpt6-eval-forest-lookout/.creator-evidence/79160e24dd92a10a/source/scene.ts:2:0 Unexpected "}" 1 \| const tx=-17,tz=-28; B('tower-platform',tx,10,tz,12,.7,10,wood); B('tower-roof',tx,15.3,tz,14,.6,11,steel); B('tower... 2 \| }}; \| ^ 3 \|  |
| 25 | `op-f7d0f342-4902-4240-b623-1b50be0fcce4` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 27 | `op-1f28c09e-1d81-4011-964f-2f82b96ac346` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 32 | `op-f8e6eded-4fb6-4b3d-a7c9-a4ee0d74966d` | world.playtest | 工具报告failed；请求15s/实际15s，目标1/5，格数8，最远29.798640228365926m。 |
| 33 | `op-babcf612-2551-464e-a30d-811a669dc1af` | world.playtest | 工具报告failed；请求180s/实际180s，目标3/5，格数27，最远40.688196579887965m。 |
| 34 | `op-dff6a68d-d990-4fa0-aede-38b095570ccd` | world.validate | Unexpected token ']', ..."":5}, ], "st"... is not valid JSON |
| 38 | `op-835f6c7a-561a-49e8-ad03-65b7fb0f52cb` | world.capture-triviews | page.evaluate: Error: BABYLON_ARTIFACT_ENTITY_NOT_RENDERABLE: water-tank at pee (http://127.0.0.1:34475/assets/index-DJ9CPC9r.js:3492:31474) at mee (http://127.0.0.1:34475/assets/index-DJ9CPC9r.js:3492:33905) at kv.captureArtifactView (http://127.0.0.1:34475/assets/index-DJ9CPC9r.js:3492:122995) at http://127.0.0.1:34475/assets/index-DJ9CPC9r.js:3493:4582 at W (http://127.0.0.1:34475/assets/index-DJ9CPC9r.js:3493:4773) |
| 41 | `op-7127e419-99f5-490c-8c0d-b972fb609ab3` | world.playtest | page.evaluate: Error: ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not run fixed input. at Br (http://127.0.0.1:43127/assets/index-CEWgSc6V.js:3492:139207) at Ete.runFixedInputTick (http://127.0.0.1:43127/assets/index-CEWgSc6V.js:3492:145164) at async M (http://127.0.0.1:43127/assets/index-CEWgSc6V.js:3493:3340) |
| 44 | `op-65a8aef7-6bbc-4aec-a25b-e749155bc281` | world.capture-triviews | page.evaluate: Error: BABYLON_ARTIFACT_ENTITY_NOT_RENDERABLE: water-tank at pee (http://127.0.0.1:46265/assets/index-CbhANMRC.js:3492:31474) at mee (http://127.0.0.1:46265/assets/index-CbhANMRC.js:3492:33905) at kv.captureArtifactView (http://127.0.0.1:46265/assets/index-CbhANMRC.js:3492:122995) at http://127.0.0.1:46265/assets/index-CbhANMRC.js:3493:4582 at W (http://127.0.0.1:46265/assets/index-CbhANMRC.js:3493:4773) |
| 48 | `op-d6d47c6d-8b61-48c1-91ad-3bfcf2a2d983` | world.capture-triviews | page.evaluate: Error: BABYLON_ARTIFACT_ENTITY_NOT_RENDERABLE: gate-sign at pee (http://127.0.0.1:45491/assets/index-BP-LC4Xl.js:3492:31474) at mee (http://127.0.0.1:45491/assets/index-BP-LC4Xl.js:3492:33905) at kv.captureArtifactView (http://127.0.0.1:45491/assets/index-BP-LC4Xl.js:3492:122995) at http://127.0.0.1:45491/assets/index-BP-LC4Xl.js:3493:4582 at W (http://127.0.0.1:45491/assets/index-BP-LC4Xl.js:3493:4773) |
| 50 | `op-c43039de-95a7-4059-9172-d3542ace85dc` | world.preview | CREATOR_RUNTIME_FAILED: TypeError: a.isReady is not a function |

## 纸月宫殿

- Job：`gen_c18e93849298f49e`；Run：`gpt6-five-case-eval-20260905-r3-ac4`。
- sourceHash：`sha256:aa40b06e3a1aa24cf54cb83ac7e70bb3edcae343325fd5f270ff0af0a1f84d19`。
- Archive：`sha256:beb5afec58851beb1758822e88a1447b272917116263b274332d09e547dc84d4`，22752043 bytes。
- 完整事件：`sha256:0e366469cca8741236539968e3386a7a6643e99e84da4ba989ae886aac5e9316`。
- Host报告：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-paper-moon-palace/host-artifact-verification.json`。
- Payload：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-paper-moon-palace/payload`。
- 工具计数：`creator_describe_environment=1`、`creator_get_authoring_schema=1`、`assets_search=2`、`assets_describe=1`、`world_validate=7`、`operations_get=41`、`world_preview=8`、`world_playtest=9`、`world_capture_triviews=2`、`world_submit=1`。

该任务内每轮失败记录（operation去重，保留短测未通过）：

| 轮次 | Operation | 类型 | 原因 |
| ---: | --- | --- | --- |
| 2 | `op-5fdba53a-5e38-4d1f-a584-c33f406829bb` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 6 | `op-0170c26a-81f2-4577-ae85-cff4ed47343d` | world.playtest | PLAYER_STUCK_NEAR_TARGET: first-landing |
| 10 | `op-0a591810-668c-4456-ac24-8df6ab4ef3d3` | world.playtest | 工具报告failed；请求30s/实际30s，目标3/24，格数15，最远64.35042275372746m。 |
| 12 | `op-58e4aefb-780b-4e5e-b339-a959fb1a7164` | world.playtest | PLAYER_STUCK_NEAR_TARGET: gate-west-front |
| 13 | `op-c12f90c9-ca77-4a9a-80cf-03e45660ffa8` | world.playtest | page.evaluate: Error: ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not run fixed input. at Ur (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:3492:139207) at Ete.runFixedInputTick (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:3492:145164) at async P (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:3493:3340) |
| 14 | `op-bccce122-3beb-47a4-bb37-514d28cd0481` | world.playtest | page.evaluate: Error: 3C_ROLLBACK_FAILED_CLOSED: a failed Golden Tick could not restore every transaction participant. at en (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:2864:122494) at #l (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:2864:127575) at #i (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:2864:126315) at UY.reset (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:2864:125839) at pF.reset (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:2864:137945) at kv.reset (http://127.0.0.1:43501/assets/index-DUoYovsZ.js:3492:118587) at http://127.0.0.1:43501/assets/index-DUoYovsZ.js:3493:5069 |
| 17 | `op-6f202887-a205-4bd2-93f1-6116eaa2373c` | world.playtest | page.evaluate: Error: ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not run fixed input. at Ur (http://127.0.0.1:34497/assets/index-BGtuykoI.js:3492:139207) at Ete.runFixedInputTick (http://127.0.0.1:34497/assets/index-BGtuykoI.js:3492:145164) at async P (http://127.0.0.1:34497/assets/index-BGtuykoI.js:3493:3340) |
| 18 | `op-f398e0f2-9532-41f0-a7a8-0d8023af7104` | world.playtest | page.evaluate: Error: ADAPTER_FIXED_INPUT_FAILED: Gameplay World Port could not run fixed input. at Ur (http://127.0.0.1:43289/assets/index-CAu1rsIt.js:3492:139207) at Ete.runFixedInputTick (http://127.0.0.1:43289/assets/index-CAu1rsIt.js:3492:145164) at async P (http://127.0.0.1:43289/assets/index-CAu1rsIt.js:3493:3340) |

历史尝试：`gen_bdad645aceef06e1`（gpt6-five-case-eval-20260905-r3），cancelled；Provider did not succeed: cancelled/undefined。

## 梯田山谷

- Job：`gen_a4e89f0e4fc94dea`；Run：`gpt6-five-case-eval-20260905-r3`。
- sourceHash：`sha256:2f19908b853268f588d303aaffd1301c162af361729440dcb7da46f64c9b0fce`。
- Archive：`sha256:0a35ddc09279d592fec520f465df4a1bcd5eb6ce12553f22bb180dd4ecd66160`，7755437 bytes。
- 完整事件：`sha256:c32a930bac0df4600777b54ed1360f0136f3c4d683f58c32897e2d4eeed07543`。
- Host报告：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-rice-terraces/host-artifact-verification.json`。
- Payload：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-rice-terraces/payload`。
- 工具计数：`creator_describe_environment=1`、`creator_get_authoring_schema=1`、`assets_search=6`、`assets_describe=1`、`world_validate=6`、`operations_get=29`、`world_preview=4`、`world_playtest=6`、`world_capture_triviews=3`、`world_submit=1`。

该任务内每轮失败记录（operation去重，保留短测未通过）：

| 轮次 | Operation | 类型 | 原因 |
| ---: | --- | --- | --- |
| 4 | `op-1f99a12a-5f7c-4e1c-b4d5-3af584167919` | world.playtest | PLAYER_STUCK_NEAR_TARGET: center-paddy |
| 6 | `op-81a80352-971a-40af-a751-fdeca1de1726` | world.playtest | PLAYER_STUCK_NEAR_TARGET: center-paddy |
| 8 | `op-4f12b9df-d182-411c-a0e4-46458874eeb6` | world.playtest | 工具报告failed；请求30s/实际30s，目标4/8，格数19，最远36.262480777102624m。 |
| 11 | `op-c5e4cf16-d240-4fc9-b336-9ebb2c4e906d` | world.capture-triviews | page.evaluate: Error: BABYLON_ARTIFACT_ENTITY_NOT_RENDERABLE: terrace-right-high at bee (http://127.0.0.1:37291/assets/index-DSPoTaHv.js:3492:31484) at vee (http://127.0.0.1:37291/assets/index-DSPoTaHv.js:3492:33915) at Gv.captureArtifactView (http://127.0.0.1:37291/assets/index-DSPoTaHv.js:3492:123005) at http://127.0.0.1:37291/assets/index-DSPoTaHv.js:3493:4582 at W (http://127.0.0.1:37291/assets/index-DSPoTaHv.js:3493:4773) |
| 15 | `op-58601c7a-cfca-45e2-a4e1-3a4760aba0b9` | world.capture-triviews | page.evaluate: Error: BABYLON_ARTIFACT_ENTITY_NOT_RENDERABLE: palm-a at bee (http://127.0.0.1:35781/assets/index-8su2d7dR.js:3492:31484) at vee (http://127.0.0.1:35781/assets/index-8su2d7dR.js:3492:33915) at Gv.captureArtifactView (http://127.0.0.1:35781/assets/index-8su2d7dR.js:3492:123005) at http://127.0.0.1:35781/assets/index-8su2d7dR.js:3493:4582 at W (http://127.0.0.1:35781/assets/index-8su2d7dR.js:3493:4773) |

## 九尾狐麦田

- Job：`gen_4a4f2b81c6d9ab90`；Run：`gpt6-five-case-eval-20260905-r3`。
- sourceHash：`sha256:c8a121714ef46685e14526f0cd88b9a81c802ce93b90b7f36fcb9982a2c342cf`。
- Archive：`sha256:57a3ceedffe1f033811d86b6094df9b94bf19a441a099b1bf1656aedaa404ac5`，7845638 bytes。
- 完整事件：`sha256:c6ff53bb6ead2a7719b2428bb505a732ea1b902b175196a80c51d38f5b3ca239`。
- Host报告：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-nine-tailed-fox-hash-verified/host-artifact-verification.json`。
- Payload：`.codex-tmp/gpt6-five-case-eval/host-verified/gpt6-eval-nine-tailed-fox-hash-verified/payload`。
- 工具计数：`creator_describe_environment=1`、`creator_get_authoring_schema=1`、`assets_search=5`、`assets_describe=1`、`world_validate=6`、`operations_get=21`、`world_preview=4`、`world_playtest=3`、`world_capture_triviews=1`、`world_submit=1`。

该任务内每轮失败记录（operation去重，保留短测未通过）：

| 轮次 | Operation | 类型 | 原因 |
| ---: | --- | --- | --- |
| 1 | `op-f6857d0c-0a2c-4eed-94d2-c5341a07d99b` | world.validate | CREATOR_IMPORT_NOT_ADMITTED: @babylonjs/core |
| 2 | `op-60249409-2378-4388-b613-a6aef4e58403` | world.validate | ../../../../../lwdp_generation/gen_4a4f2b81c6d9ab90/tasks/gpt6-eval-nine-tailed-fox/.creator-evidence/291543f50a3edf60/source/scene.ts (6:9): "defineBabylonNativeScene" is not exported by "scripts/creator/authoring.ts", imported by "../../../../../lwdp_generation/gen_4a4f2b81c6d9ab90/tasks/gpt6-eval-nine-tailed-fox/.creator-evidence/291543f50a3edf60/source/scene.ts". file: /fsx/pipeline/lwdp_generation/gen_4a4f2b81c6d9ab90/tasks/gpt6-eval-nine-tailed-fox/.creator-evidence/291543f50a3edf60/source/scene.ts:6:9 4: import { Color3 } from '@babylonjs/core/Maths/math.color.js'; 5: import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'; 6: import { defineBabylonNativeScene, registerEntity } from '@worldkit/creator'; ^ 7: 8: const mat = (name: string, color: Color3, rough = 0.9) => {  |
| 4 | `op-c3b7cf12-93bf-4fdf-b187-0455a43d2a85` | world.preview | CREATOR_RUNTIME_FAILED: Error: WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED: Native Scene Module build() failed. |
| 9 | `op-4a5a5ade-b90e-4ecf-be89-11f6bd1477d8` | world.playtest | 工具报告failed；请求20s/实际20s，目标2/6，格数12，最远27.43521301807176m。 |
| 10 | `op-4457147f-8911-4852-b83c-7b31d5b5c034` | world.playtest | PLAYER_STUCK_NEAR_TARGET: altar-center |

## 取消与账户并发

原宫殿请求 `gen_bdad645aceef06e1` 在未观察到CLI事件时受控取消。LWDP确认cancelled后，Host额外确认精确Ray submission为STOPPED，再等待本地admission终结。随后使用新Run及新requestId，保持原图、原prompt与V3不变，仅将本任务account_concurrency从1提高至4（pod仍1）。旧请求没有被修改或重复POST；取消与Ray终态记录均保留在JSON列明的路径。

Fox首次Host核验的预期hash参数少了`sha256:`前缀；该参数错误报告保留。使用实际submit receipt中的完整hash重验后通过，原包没有修改。
