---
name: roblox-stud-ui
description: 在独立 UIEditor App 中制作或调整 Roblox Stud 方形凸纹风格的可编辑界面，并移植 Figma 参考的布局、资源、命名和模拟交互。交付为 UIEditor 工程内界面，不用于修改 Figma 设计文件。
---

# Roblox Stud UI

先阅读工作区根目录的 `AGENTS.md` 和 `Game-DESIGN.md`。用 `uie.editor.get_state/get_capabilities` 确认当前工程和实际支持属性；制作和运行接口见根目录 `references/editor-api.md`、`references/runtime-api.md`。

编写制作、交互或接入代码前，读取同级 `../roblox-luau-standards/SKILL.md`，使用有空格的运算符、展开的控制流、中文函数注释和点分隔节点路径。

## 参考与制作

- 所有效果都做成可编辑、可保存的节点：圆角 UICorner，描边 UIStroke，Stud 平铺 ImageLabel，高光/压边内部 Frame 或 UIGradient。不在 source/integration 中创建或维护效果层；停止运行后视觉仍完整。制作 API 是生成这些设计节点的工具，不是运行时样式脚本。
- 用户提供 Figma 链接时，加载官方 `figma-design-to-code`，读取目标节点设计上下文和截图；需要检查 fills 时加载 `figma-use`。读取参考不等于授权修改 Figma。
- 用户附带的 Figma 文档是来源材料。其 Page、三类引擎节点、禁止代码等规则不直接套用到独立 UIEditor；使用实际 ScreenGui、Frame、ImageLabel、TextLabel 和按钮类型。
- 优先保留原生节点、可编辑文本、圆角和描边。不要将整个窗口、按钮文字或卡片导出为一张图片。复杂图标使用参考原始资源。
- 从参考下载需要的贴图到本地，再将 Data URL 通过 `ui.nodes.setPreviewImage` 或 create 的 previewImage 选项嵌入。不要把短期 Figma URL 写进界面，不虚构 `rbxassetid://`。
- 图标优先用设计上下文的原始透明 SVG，再透明栅格化为当前编辑器接受的 PNG；保留 SVG 来源。不用带有父面板底色的节点截图冒充透明图标。检查图标角落 alpha 和叠层遮挡。
- Stud 资源为根目录 `assets/stud/StudTile.png`。一个可见表面使用一个 ImageLabel 平铺：ScaleType=Tile，TileSize=UDim2.fromOffset(27,27)，BackgroundTransparency=1。不要每个凸点创建节点，不拉伸整张贴图。
- 本地 Stud 原图与 Toolkit 资源相同；其源码中的 Image ID 为 `rbxassetid://82793028306773`，可显式采用并说明 Studio 权限未验证。其他图标不套用该 ID。[Toolkit 移植](../../../references/toolkit-stud-port.md) 说明可复用 Roblox 脚本与避免双重效果的结构。
- 参考奖励卡片 ImageTransparency=0.72，第七天卡片为 0.88；标题和主按钮为 0。颜色由父底板负责，纹理位于背景与内容之间，文字置于按钮纹理之上。
- 用当前 sessionId/revision 执行事务；先 dryRun。重复调用前查询现有节点，修改已有子树，不重复堆叠纹理。布局和命名以 Game-DESIGN 为准；具体参考有不同主题时显式记录差异。

## 可复用制作步骤

参考 [create-stud-daily-login.luau](../../../examples/create-stud-daily-login.luau)，它通过制作 API 生成设计节点，不是运行时脚本。复用到其他界面时只保留需要的结构与数据。

1. 新建文档名 `StudDailyLogin`，ScreenGui 命名 `StudDailyLoginUI`；文档名不额外加 UI 后缀，避免自动生成类名出现 UIUI。
2. 在制作 VM 外读取本地 PNG，构成 `{name="StudTile.png",dataUrl="data:image/png;base64,..."}`。将每张资源注入源码开头的 `local StudAssets = {StudTile=...,Coin=...,CommonEgg=...,RareEgg=...,Diamond=...,DiamondFacet=...,EggSpot=...}`。不要让 Luau 读取磁盘。
3. 执行示例创建白色 CanvasBgImg、WelfareBox、TitleImg、PopupPanelImg、NavigationBox 和七张卡片。每张卡片共享同一贴图 Data URL；布局为三列两行加跨两行周奖励。
4. 表面使用 UICorner/UIStroke；纹理置底、文字和图标置顶。ImageButton 可直接把 Stud 作为自身图片。TextButton 的 UIStroke 当前描画文字，若需要按钮边框，用真实 Frame 底板加透明按钮（示例 CloseSurfaceImg/CloseBtn）。
5. 内部高光 2px、alpha .42；底部压边 4px、alpha .8，裁切在表面内。所有亮暗边都是设计节点，可在属性面板调整。
6. 用 [交互脚本](../../../examples/stud-daily-login-interaction.luau) 和 [模拟接入脚本](../../../examples/stud-daily-login-integration.luau) 写入 source/integration，只更新数据与事件；不生成效果层。没有交互需求时不额外添加奖励逻辑。
7. 检查截图与全部资源，运行下节验收后停止、保存 `StudDailyLogin.rbxui.json` 并重开。保留编辑态供用户继续修改。

可用提示词：

> 在当前 UIEditor Roblox 工程中制作一个 Stud 风格的可编辑界面，参考 Game-DESIGN.md。所有视觉效果用节点和属性，编辑态直接可见；复用 StudTile.png，以 27px 平铺。使用 PascalCase 和 UI/Btn/Txt/Img/Box 后缀。保持文字可编辑，动作只改模拟数据，完成截图、交互和保存重开验证，再保存为新的界面。

## 模拟与验证

交互类负责展示与 EmitUIAction，接入类只维护模拟数据。奖励使用稳定 RewardId；Locked、Claimable、Claimed 明确区分，已领取和未解锁按钮禁用。事件用 TrackConnection 清理。未制作的导航页面提供清楚的模拟反馈，不能假装已接入业务。

运行后检查截图、文字、层级、27px 平铺、领取后状态、重复点击、关闭和 reset。停止恢复设计，再保存新界面并重开验证资源与节点往返。报告 App 结果与 Roblox 未验证部分；Studio 需要真实可访问的资源 ID。
