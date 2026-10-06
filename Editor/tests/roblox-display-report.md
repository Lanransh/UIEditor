# Roblox 节点显示对比与修复

验证日期：2026-10-06。对象为本仓库静态 UI 编辑器与 Roblox Studio `Place1` 的原生 UI。
当前没有 Studio 导入插件，因此这次检查不涉及导入流程、游戏业务或按钮运行时交互。

## 结论

按用户要求，本次修复范围不含字体排版、自动字号精确匹配及复杂 CanvasGroup 混色。
覆盖注册表全部 19 种节点、157 个节点属性条目，生成 303 组默认值/单属性样例及
40 组组合效果样例，共 343 组、1693 个节点。数字包含不同节点共有的属性，
不代表支持 Roblox 的全部 API。

原生构建无属性赋值异常；首次 323 组的 4049 次属性读回检查发现一处取值归整：
`ScrollingFrame.CanvasPosition=(0.5,0.5)` 在 Studio 变成 `(0,0)`。
本次已修正画布滚动归整及边界限制。其他读回值相符仅证明赋值正确，不证明像素效果一致。

以各样例的固定 400×240 Host 为参照，排除 Studio 顶栏坐标原点差异，并允许
1.1px 的像素取整误差。343 组样例中未旋转节点的矩形对比为零差异；Rotation
样例不参加此矩形判定，因为 DOM 返回旋转后的包围盒，Studio 的 AbsoluteSize
返回布局尺寸。另对 11 组截图的 32 个平坦区域 RGB 采样点进行比较，覆盖旋转渐变、
底色和透明度、图片染色/平铺/渐变、滚动条及边界。最大单通道差值为 2/255，
通过 8/255 门限（允许 Studio JPEG 压缩差异）。不包含字体和图形边缘，
没有全图逐像素通过结论。

## 节点覆盖与显示结论

可视节点共有属性（10 项）：Position、Size、AnchorPoint、Rotation、Visible、ZIndex、
LayoutOrder、BackgroundColor3、BackgroundTransparency、ClipsDescendants。
位置/尺寸同时检查 Offset 和 Scale；枚举检查全部注册选项；布尔检查切换；
数字检查注册上下界及一个中间值。每个属性的具体样例可见生成的 `cases.json`。

| 节点 | 属性数 | 额外属性或效果 | 结论与限制 |
| --- | ---: | --- | --- |
| ScreenGui | 2 | Enabled、DisplayOrder | Enabled 切换隐藏画布；单文档无法用截图判断 DisplayOrder 的跨界面排序 |
| Frame | 10 | 通用属性 | 普通位置、尺寸、锚点矩形吻合；旋转仅检查赋值和浏览器变换，不计入矩形通过数 |
| ScrollingFrame | 13 | CanvasSize、CanvasPosition、ScrollBarThickness | 已修复归整、边界、交叉滚动条、默认纹理和子节点覆盖；静态展示，不模拟用户滚动 |
| CanvasGroup | 12 | GroupTransparency、GroupColor3 | 浏览器使用组合 opacity 和 multiply 近似；未做复杂透明重叠的像素一致性验收 |
| TextLabel | 19 | Text、TextColor3、TextSize、TextTransparency、Font、TextWrapped、TextScaled、TextXAlignment、TextYAlignment | 参数有对应展示；字体替代、换行及字号估算不能保证排版一致 |
| TextButton | 19 | 同 TextLabel | 文本显示检查同上；悬停/按下及 Activated 交互不属于静态画布 |
| TextBox | 20 | 同 TextLabel，另有 PlaceholderText | 单独检查空 Text 的占位文字；原生输入、焦点及占位色未作为一致性通过项 |
| ImageLabel | 14 | Image、ImageColor3、ImageTransparency、ScaleType | 用同源图片检查 Fit/Stretch/Crop/Tile、染色、透明度和渐变；已修复 Tile 和 Fit 留白染色 |
| ImageButton | 14 | 同 ImageLabel | 图片效果结论同上；按钮运行时交互未测试 |
| UICorner | 1 | CornerRadius | 默认圆角截图及 Offset/Scale 参数已检查；未证明所有父节点与裁剪组合一致 |
| UIStroke | 4 | Color、Thickness、Transparency、Enabled | 普通节点外侧边框、文本字形描边；字体差异仍影响字形轮廓 |
| UIGradient | 6 | ColorStart/End、TransparencyStart/End、Rotation、Enabled | 已修复底色/透明度调制、旋转中心线、文本及图片组合 |
| UIPadding | 4 | PaddingLeft/Right/Top/Bottom | 普通、Scale 内边距与 Scale 子节点的矩形样例吻合；未验收文本内容内边距 |
| UIScale | 1 | Scale | 单独及网格约束组合矩形样例吻合 |
| UIListLayout | 5 | FillDirection、SortOrder、HorizontalAlignment、VerticalAlignment、Padding | 注册方向、排序、对齐及 Scale 间距的样例矩形吻合 |
| UIGridLayout | 7 | 列表共有 4 项，CellSize、CellPadding、FillDirectionMaxCells | 基础及约束/缩放/跨格/排序组合样例矩形吻合 |
| UIAspectRatioConstraint | 2 | AspectRatio、DominantAxis | 已修复默认 FitWithinMaxSize；所有本轮单项矩形样例吻合 |
| UISizeConstraint | 2 | MinSize、MaxSize | 单独约束的矩形样例吻合；网格组合见下表 |
| UITextSizeConstraint | 2 | MinTextSize、MaxTextSize | 已修复未开启 TextScaled 时错误改变字号；开启时仍依赖字号估算 |

`comparison.json` 的 `unchangedInThisFixture` 只是与默认 DOM 相同的参数集合，不能
当成属性失效：例如修改已有文字的 PlaceholderText、默认已选枚举值、在没有布局的
节点上修改 LayoutOrder、在没有预览图的节点上修改 ScaleType，均可能没有可见变化。

## 已复现问题与修复

| 项目 | Studio 与编辑器差异 | 状态 / 证据 |
| --- | --- | --- |
| 宽高比约束 | 240×140 + 比例 1：Studio 140×140，原画布 240×240 | 已修复；case-285/286/289 复测吻合，新增单元回归 |
| 非缩放文字的字号约束 | TextScaled=false、TextSize=40、MaxTextSize=12：Studio 保留 40，原画布变成 12 | 已修复；case-307 DOM 字号 40px 断言通过 |
| 透明/有色背景上的渐变 | 原生颜色与底色调制，透明度仍参与合成；原画布独立背景渐变覆盖 | 已修复；case-303/336 颜色采样；case-239 复测旋转中心线 |
| 文本渐变 | Studio 调制文字颜色；原画布仍给面板填充渐变 | 已修复；case-304 两端截图，保留字体差异 |
| 文本描边 | Studio 给字形描边；原画布给整个面板画边框 | 已修复；case-305 截图及字形描边 DOM 断言 |
| 网格 + 缩放 + 最小尺寸 | 原画布尺寸及位置不符；还需处理约束向量、跨格及缩放居中 | 已修复；case-310、323–335；13 组原生数值单元回归 |
| 图片 Fit 染色 | 原画布连左右留白也染色 | 已修复；case-315 颜色采样，保留源透明通道 |
| 图片 Tile | Studio 默认 TileSize 为 1×1 Scale；原画布按原图像素重复 | 已修复；case-314 颜色采样及尺寸断言；当前格式未暴露 TileSize |
| 图片渐变 | 原画布未调制图片像素 | 已修复；case-337 颜色采样 |
| 滚动条 | 原画布垂直条停在顶部，最小长度不同；没有横向条 | 已修复；case-338–342 采样，覆盖交叉占位、默认纹理、最小长度、末端限制及子节点覆盖；不代表运行时交互验收 |

文本描边行为亦符合 [Roblox 官方外观修饰文档](https://create.roblox.com/docs/ui/appearance-modifiers#text-outline-or-border)。
字体差异、TextScaled 估算和 CanvasGroup 混色属于现有近似边界，不以矩形吻合掩盖。

## 重跑与证据

在 `Editor/` 中运行：

```powershell
npx tsx tests/roblox-display-generate.ts
npm run test:display
```

显示采集以源码启动 Vite 和隔离 Electron，会覆盖本轮输出，不修改真实最近工程记录。
先有一次 `npm run build` 以提供 Electron 主进程。测试直接挂载实际 DocumentCanvas，
不经过节点树和属性面板；操作流程回归由既有 `ui-smoke.mjs` 负责。

使用 Roblox MCP 在 Edit 模式执行 `test-results/roblox-display/setup.luau`，开始 Play。
只在空白或获准测试的工程中执行，它重建 `StarterGui.UIEditorDisplayQA`，不触碰其他
工程内容。运行时先启用需要测量的 ScreenGui，等待布局稳定；Studio 曾在未启用时
将 CanvasPosition 重置，需对 case-38 重新设为 `(80,60)`，再读取。

在 Client 模式执行生成的 `verify-properties.luau`，保存输出为 `studio-properties.json`。
分批执行 `tests/roblox-display-read.luau`，调整 first/last（每批不超过 60），将各批
数组合并为 `{ "cases": [...] }` 写入 `studio-results.json`。工具有返回长度限制，
一次读取全部节点会截断 JSON。最后运行：

```powershell
node tests/roblox-display-compare.mjs
```

此命令生成差异报告，即使发现差异也正常退出；它是诊断工具，不是“一致性全部通过”
门禁。新增源文件覆盖生成、真实组件渲染、原生属性验证及矩形诊断，可供后续修复复测。

通过 MCP 另行采集 `fix-studio-case-N.png` 后，可运行 `node tests/roblox-display-pixels.mjs`。
该命令对平坦颜色区域设置 8/255 门禁，并生成左右对比图。

本轮输出在忽略目录 `test-results/roblox-display/`：

- [完整参数样例](../test-results/roblox-display/cases.json)、[属性清单](../test-results/roblox-display/coverage.json)
- [编辑器渲染采集](../test-results/roblox-display/editor-results.json)、[Studio 矩形采集](../test-results/roblox-display/studio-results.json)
- [首次 Studio 属性读回](../test-results/roblox-display/studio-properties.json)、[矩形差异诊断](../test-results/roblox-display/comparison.json)
- [修复颜色采样](../test-results/roblox-display/pixel-comparison.json)、[修复对比图](../test-results/roblox-display/display-fixes.png)
- [Studio 19 类节点总览](../test-results/roblox-display/studio-nodes.png)、[Studio 图片效果总览](../test-results/roblox-display/studio-images.png)
- [编辑器透明渐变](../test-results/roblox-display/editor-case-303.png)、[修复复测 Studio 透明渐变](../test-results/roblox-display/fix-studio-case-303.png)
- [编辑器文本描边](../test-results/roblox-display/editor-case-305.png)、[修复复测 Studio 文本描边](../test-results/roblox-display/fix-studio-case-305.png)

截图为本机采集证据，不纳入 Git；重跑 Studio 截图需通过 MCP 另行采集。
图片测试嵌入本机 Studio 的 `GuiImagePlaceholder.png`，原生端使用对应
`rbxasset://textures/ui/GuiImagePlaceholder.png`，不验证用户上传资源的权限或可用性。

默认滚动条纹理来源记录在 `src/assets/roblox-scrollbars/README.md`。

本轮执行通过：全部 27 项单元测试（其中 14 项节点/文档/外观测试）、TypeScript 检查、
343 组渲染采集、矩形对比、32 个颜色采样点、字号/字形描边/Tile 断言、
应用构建、既有 Hub 与 Electron UI 冒烟测试（编辑、拖动、布局锁定、
撤销重做、图片、保存加载、失败保护与关闭提示）。构建保留 lucide-react 的 `use client` 提示。
已更新 `Run.bat` 使用的本地应用包，打包版启动、IPC、运行目录及沙盒检查通过。
未执行设备模拟、多分辨率、触屏、复杂多层效果全组合、真实资源加载、逐像素验收、
游戏业务接入和 Studio 导入测试；没有将这些项目记为通过。

Studio 已恢复 Edit 模式，`StarterGui.UIEditorDisplayQA` 保留 343 个样例和
`NodeOverview` 总览，下一次 Play 默认显示总览。工程未另存或发布。
