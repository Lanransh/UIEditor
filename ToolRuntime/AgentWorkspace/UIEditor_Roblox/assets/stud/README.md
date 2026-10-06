# Stud 风格资源

来源：[Roblox_Y1 / WelfareUI](https://www.figma.com/design/B7UgSPMFWQlTSGadG4Ucsx/Roblox_Y1?node-id=120-14)。从 Figma 原始 image fill 和设计上下文的 SVG 图标资源取得，2026-10-06。SVG 原文件一并保留；图标 PNG 从原 SVG 按两倍尺寸透明栅格化，避免节点截图混入父面板底色，不重绘图形。

| 文件 | 来源节点 | 用法 |
| --- | --- | --- |
| StudTile.png | 120:137 的原始 IMAGE fill | 96×96 透明方形凸纹；显示周期 27×27，Figma scalingFactor=0.28125 |
| Coin.png | 120:139 | 42×42 金币底图；G 保留可编辑文本 |
| CommonEgg.png | 120:153 | 36×44 普通蛋 |
| RareEgg.png | 120:178 | 70×86 稀有蛋底图 |
| Diamond.png | 120:186 | 钻石底图，包含原描边外扩边界 |
| DiamondFacet.png | 120:187 | 钻石切面叠层 |
| EggSpot.png | 159:17 | 稀有蛋白色斑点叠层 |

UIEditor 中选择本地预览图或通过制作 API 嵌入。Stud ImageLabel 设 ScaleType=Tile、TileSize=27×27 Offset，放在底色上层、内容下层；卡片透明度 0.72，主按钮和标题透明度 0。

Toolkit 已有同图资源 ID `rbxassetid://82793028306773`，本次界面采用该源码中的 ID，并保留本地原图。尚未在 Studio 检查加载权限；如工程无权使用，将 StudTile.png 上传到自己的资源账户并替换 Image。ScaleType=Enum.ScaleType.Tile、TileSize=UDim2.fromOffset(27,27)、BackgroundTransparency=1，原图可跨不同底色复用。其他奖励图标目前只有本地预览，不会自动变为 Roblox 资源。

原图与 Toolkit 资源哈希一致；运行脚本、效果参数、生命周期和避免重复效果的说明见 [Toolkit 移植](../../references/toolkit-stud-port.md)。

平铺属性映射见 [Roblox ImageLabel 官方文档](https://create.roblox.com/docs/reference/engine/classes/ImageLabel#TileSize)。
