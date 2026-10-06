# Roblox 静态 UI 编辑

## 当前能力

工程模式通过 `ProjectStrategy` 选择平台规则，当前实现 `RobloxProjectStrategy`。
通用工作台负责文件操作和编辑会话；策略及类型注册表提供节点默认值、属性定义、
层级校验和静态布局。注册表同时供属性面板、文档校验及画布使用。

画布逻辑尺寸固定为 1280×720；缩放、平移和适应窗口只改变显示。
空白处拖动、空格加拖动、中键拖动和普通滚轮用于平移；Ctrl 加滚轮用于缩放。
节点树和画布联动选择。新增、删除、复制、改名、父节点调整、兄弟顺序、移动、
尺寸及属性编辑均进入撤销历史，一次连续画布拖动只提交一条命令。
辅助节点在树上独立显示，通过父节点展示效果；辅助节点不能有子节点。

## 节点和属性

| 分类 | 节点 |
| --- | --- |
| 根 | ScreenGui |
| 容器 | Frame、ScrollingFrame、CanvasGroup |
| 文本 | TextLabel、TextButton、TextBox |
| 图片 | ImageLabel、ImageButton |
| 外观 | UICorner、UIStroke、UIGradient |
| 布局 | UIListLayout、UIGridLayout、UIPadding |
| 尺寸 | UIScale、UIAspectRatioConstraint、UISizeConstraint、UITextSizeConstraint |

每份文档只有一个 ScreenGui 根；其他可视节点可嵌套。每个可视节点下的同类型
辅助组件最多一个，UIListLayout 与 UIGridLayout 互斥；UITextSizeConstraint
只能放入文本节点。复制子树时所有 ID 重新生成。

常用属性包括 Position、Size、AnchorPoint、Rotation、Visible、ZIndex、LayoutOrder、
背景颜色及透明度、裁剪、文本、字体与对齐、图片资源 ID 与缩放方式，以及各辅助组件
的常用属性。支持属性的完整定义以注册表为准，未知属性拒绝保存和加载。

列表按 LayoutOrder 或名称排序，跳过不可见条目；网格支持换行、方向、单行/列数量
上限和间距。布局控制的子节点禁止直接编辑位置、旋转或通过画布拖动；网格也禁止
直接编辑尺寸。兄弟上下移改变文档顺序，LayoutOrder 不相同时按布局排序规则显示。

位置与尺寸使用 UDim2：`{ x: { scale, offset }, y: { scale, offset } }`。
UDim 为 `{ scale, offset }`，Vector2 为 `{ x, y }`，颜色使用 `#RRGGBB`。
UIGradient 首版使用 ColorStart/ColorEnd 和 TransparencyStart/TransparencyEnd
表达首尾关键点；这些是文档格式，后续导出需转换为 Roblox 的序列属性。

## 保存与加载

新建默认创建名为“未命名界面”的空 ScreenGui 文档。一个工程可保存多个界面。
默认保存位置为 `UIEditorWorkspace/interfaces/<自定义名称>.rbxui.json`，首次保存和
另存为使用原生文件对话框，允许选择其他位置。打开界面使用原生文件选择器，或在
项目资产卡片上右键选择“打开”；卡片名称来自文件名。工程外保存的文件可通过原生
选择器打开，但不列入项目资产。新建界面显示未保存卡片，保存到工程目录后成为文件资产。
工程的 project.json 仍只描述工程元数据。

文档保存 format=`roblox-ui`、version=1、稳定文档 ID、名称、固定 canvas 和 root。
节点保存稳定 ID、className、name、完整 properties 与有序 children。
不保存选中状态、视图变换、撤销历史或任何业务数据和脚本字段。

读取和写入均校验文档与节点字段、属性类型/取值、ID 唯一性、辅助节点关系以及尺寸
约束的上下界。最多 5000 个节点、64 层，文件最多 32 MiB；不支持版本拒绝加载。
主进程使用同目录临时文件加重命名保存；失败清理临时文件，保留旧文件及未保存状态。
实际读写路径来自原生对话框、本会话已打开/保存的文件或主进程列出的工程界面资产。
资产打开请求须匹配当前工程 `interfaces` 目录内的普通 UI 文件，拒绝目录、符号链接和
工程外路径；读取时仍完整校验界面文档。不接受渲染进程指定保存目标路径。

保存成功以文档内容记录基线，撤销回到该内容时恢复“已保存”。新空文档未落盘但无
修改时不提示丢失；发生编辑后，切换文档、返回 Hub 或关闭窗口提供保存/不保存/取消。
保存失败或取消保存时不继续离开。读取失败或取消选择保留当前文档与历史。
打开或新建成功时重置历史。Ctrl+S 保存，Ctrl+Shift+S 另存为。

## 图片与预览边界

Image 保存 Roblox 资源标识；节点的 previewImage 分别保存本地文件名和图片 Data URL。
预览图嵌入文档，移动工程不依赖原图片路径；支持 PNG/JPEG/WebP/GIF，单张最多 10 MiB。
图片只能通过主进程选择并读取，不自动上传或访问远程资源。缺失预览图显示占位提示。

按钮和输入框在画布上只用于选择，不执行交互。字体使用本机替代字体，TextScaled
使用静态估算，GroupColor3 和 ImageColor3 使用浏览器混合近似展示。UIStroke 首版
预览为边框，UIGradient 首版预览为背景双关键点渐变。ScrollingFrame 通过 CanvasSize
与 CanvasPosition 展示静态滚动区域，未实现运行时滚动输入。
这些差异不能作为 Roblox 的精确排版或颜色保证，后续需在 Studio 和设备上验证。

## 配置数据

后续处理，本轮不定义格式或实现。

## 运行时状态

后续处理，本轮不定义格式或实现。

## Luau 展示与交互

后续处理，本轮不定义接口或实现。

## Roblox 导出与 Rojo

后续处理，本轮不生成 Lua 或同步配置。

## AI 与 MCP

后续处理，本轮不接入。后续目标是允许 AI 查询支持能力、构造节点及填写 Luau，
在明确配置、状态与动作格式后实现交互；具体工具接口尚未定义。
