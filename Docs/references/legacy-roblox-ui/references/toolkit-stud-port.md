# Toolkit Stud 实现与移植

检查来源：StudioGameToolkit 的 plugins/roblox-ui-writeback/stud-effect.lua、stud-effect.client.lua、assets/stud-tile.png 和 tests/roblox_sync/stud-effect-smoke.lua。

原始运行脚本已原样保留为 [ToolkitUIStyle.client.lua](../examples/ToolkitUIStyle.client.lua)，它用于 Roblox LocalScript，不可放进 UIEditor 的受限 FX 交互/接入脚本。UIEditor 制作脚本用于预览同样效果。

## 已核对的一致项

Figma 原始 StudTile.png 与 Toolkit assets/stud-tile.png 的 SHA256 完全相同：`B94E19C4EDCF5BE30DB125AC7E957CC225C00AC233D7505EC5DE47468CCE54EE`。两者使用同一透明 96×96 图，平铺周期 27px；Toolkit 当前脚本内的 Image 为 `rbxassetid://82793028306773`，不是旧版 `116220570710499`。

该 ID 来自现有源码，本次未在 Roblox 网络或 Studio 检查其权限与加载。制作结果显式保留该 ID 和原图；其他奖励图标目前只有本地预览，需要各自真实资源 ID。

| UIEditor | Toolkit / Roblox |
| --- | --- |
| StudTextureImg / ImageLabel | 目标 GuiObject 下的 StudTextureImg / ImageLabel |
| ScaleType=Tile，TileSize=27×27 Offset | Enum.ScaleType.Tile，UDim2.fromOffset(27,27) |
| 父底板 BackgroundColor3 | 保留目标原底色，纹理不着底色 |
| UICorner、UIStroke | 圆角继承目标；3px 黑色描边挂在目标，不挂纹理层 |
| TopHighlightImg、BottomEdgeImg | StudBevel 的多关键点 ColorSequence / NumberSequence |
| 约 2px 顶部亮边、4px 底部暗边 | top=2/height、bottomStart=1-4/height、bottomSolid=1-3/height |
| 卡片 ImageTransparency=.72/.88 | 设置纹理层透明度；原 Toolkit 的 refresh 会将它重置为 0/1，移植卡片时须扩展样式参数或直接使用静态层 |

Toolkit 黑暗边使用目标底色与黑色 Lerp(.62)，顶部 alpha .42，底部 alpha .72~.8。UIEditor 当前 UIGradient 仅支持首尾两点，使用少量内部色带近似边缘，不假装已支持多关键点渐变。

## 后续接入选择

- 使用本次静态可编辑结构：创建原生底板、纹理层和文字层，按表映射属性；无需再安装 ToolkitUIStyle，否则重复纹理/描边。
- 使用 Toolkit 运行时样式：仅移植干净的底板和内容，安装 ToolkitUIStyle LocalScript，交由脚本创建效果层。保留 Rounded、Stroke、Stud、BottomShadow 四个布尔 Attributes；它们默认开启。

原 Toolkit 安装器保留四个开关、更新同名 LocalScript、迁移旧 StudEffect、清理 Toolkit 自有的旧效果层。不要用安装器覆盖本次未经 Toolkit 标记的静态 StudTextureImg，它会报告名称冲突；先选择一种负责样式的方式。

运行脚本监听 AbsoluteSize、BackgroundColor3、ZIndex、CornerRadius 与四个 Attributes；销毁时断开连接、清理生成层/描边、恢复原圆角。布局容器需选择实际背景子节点。移植时保留清理逻辑，不重复连接事件、不改游戏业务代码。

本次未制作通用导出器、未安装或修改 Toolkit、未向 Roblox 上传或保存场景。完成 App 样式后，Studio 仍需验证资源权限、文字字体、纹理层级、裁切和设备缩放。
