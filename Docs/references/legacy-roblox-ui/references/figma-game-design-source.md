# TemplatePage UI 设计规范

本文档基于 Figma `TemplatePage` 中的 `SmallWindowUI`、`MediumWindowUI`、`LargeWindowUI`、`TitleBox`、`CloseBtn`、`OperationButtonExamplesUI`、`ProgressBarImg` 提取。后续制作真实游戏 UI 时，优先复用窗口、标题、关闭按钮等模板资源；进度条按具体界面长度重做，但必须参考 `ProgressBarImg` 的满值样式。

## 一、基础约束

- 默认 UI 根画布：`1280x720`
- 页面背景：`#FFFFFF`
- 布局方式：Fixed layout，不使用 Auto Layout
- 普通 UI 文本最小字号：`16`
- 按钮只允许内投影，不允许外阴影、外发光或模糊效果
- 文本节点保持可编辑，映射为 `Label`
- 按钮节点使用 `Frame + Text` 结构，映射为 `Button`
- 结构容器使用 `Box` 后缀；有可见视觉表现的节点使用 `Img` 后缀
- 进度条统一只制作满值状态，文字使用 `进度值 / 目标值`，不使用百分比文案

## 二、TemplatePage 复用规则

- `TemplatePage` 是窗口模板、标题模板、关闭按钮和操作按钮的唯一来源。
- 需要标题底板时，必须复用模板里的 `TitleBox` 资源，不要自己手绘标题底板。
- 需要关闭按钮时，必须复用模板里的 `CloseBtn` 资源，不要自己手绘关闭按钮。
- 允许替换 `TitleTxt` 文案，但不要改 `TitleBox` 的内部资源结构。
- `CloseBtn` 保持蓝色外按钮、红色核心、白色 `×` 的模板结构。
- 内容区内的确定、取消、购买、付费购买、装备、卸载按钮，优先参考 `OperationButtonExamplesUI` 对应按钮。
- 需要进度样式时，参考 `TemplatePage` 中与 `TitleBox`、`CloseBtn` 同级摆放的 `ProgressBarImg` 样式节点；`ProgressBarImg` 不作为固定长度组件复用，只作为颜色、描边、圆角、内压边和文字样式参考。

## 三、三档窗口尺寸

`参考值`：

| 模板 | `PopupPanelBox` | `TopBarBox` | `ContentBox` | 适用场景 |
| --- | --- | --- | --- | --- |
| `SmallWindowUI` | `650x380`，位置 `(315,170)` | `634x46`，位置 `(8,8)` | `630x318`，位置 `(10,52)` | 二次确认、简短说明、小奖励 |
| `MediumWindowUI` | `780x450`，位置 `(250,135)` | `762x50`，位置 `(9,9)` | `758x382`，位置 `(11,57)` | 设置、常规功能、中等列表 |
| `LargeWindowUI` | `820x520`，位置 `(230,100)` | `800x54`，位置 `(10,10)` | `796x446`，位置 `(12,62)` | 商店、任务、多模块系统界面 |

使用规则：

- 新窗口先判断接近哪一档，再复用对应结构。
- `TopBarBox` 与 `PopupPanelBox` 内边距保持 `8~10`。
- `ContentBox` 与 `PopupPanelBox` 左右内边距保持 `10~12`。
- `ContentBox` 从顶部下移到顶栏下方，`Small` 为 `y=52`，`Medium` 为 `y=57`，`Large` 为 `y=62`。
- 内容区内部推荐主间距：大模块 `16~24`，卡片/按钮间距 `12~20`，文本与控件间距 `8~12`。

## 四、窗口颜色与厚度

### `PopupPanelBox`

`参考值`：

- 填充：`#0C8EED`
- 描边：`#034A99`
- 描边粗细：`5`
- 圆角：`18`
- 顶部内高光：`INNER_SHADOW rgba(233,251,255,0.42)`，offset `(0,6)`，radius `0`
- 底部内压边：`INNER_SHADOW rgba(0,59,122,0.48)`，offset `(0,-8)`，radius `0`

规则：

- `PopupPanelBox` 负责窗口外框厚度和游戏化包裹感。
- 不要把主窗体改成纯白、灰色、透明玻璃或无描边样式。

### `TopBarBox`

`参考值`：

- 填充：`#18A8F5`
- 描边：`#0070C8`
- 描边粗细：`3`
- 圆角：`10`
- 顶部内高光：`INNER_SHADOW rgba(232,250,255,0.42)`，offset `(0,6)`，radius `0`
- 底部内压边：`INNER_SHADOW rgba(0,81,153,0.48)`，offset `(0,-8)`，radius `0`

规则：

- `TopBarBox` 只做顶部承托条，不承载复杂内容。
- 颜色应保持亮蓝体系，与 `PopupPanelBox` 有层次但不换色相。

### `ContentBox`

`参考值`：

- 填充：`#F4FAFF`
- 描边：`#8EBFEF`
- 描边粗细：`2`
- 圆角：`14`
- 顶部内高光：`INNER_SHADOW rgba(255,255,255,0.86)`，offset `(0,6)`，radius `0`
- 底部内压边：`INNER_SHADOW rgba(180,205,232,0.2)`，offset `(0,-6)`，radius `0`

规则：

- `ContentBox` 是真实内容承载区，保持极浅蓝和高可读性。
- 内容面板、列表、卡片可以使用更浅或更沉的蓝白色，但必须和 `#F4FAFF` 协调。
- 推荐内容区文本色：深蓝 `#0B3D78` / `#164D86`，次级说明 `#4F789E` / `#5B84AA`。

## 五、标题模板

`TitleBox` 必须复用模板资源。

`参考值`：

- 尺寸：`320x70`
- 圆角：`13`
- 填充：`#0B70D8`
- 描边：`#D7F4FF`
- 描边粗细：`5`
- 顶部内高光：`INNER_SHADOW rgba(255,255,255,0.5)`，offset `(0,5)`
- 底部内压边：`INNER_SHADOW rgba(0,63,134,0.5)`，offset `(0,-7)`

`TitleBox` 内部资源参考：

- `TitleGlowLeftImg` / `TitleGlowRightImg`：`#55CFFF`，opacity `0.22`，尺寸 `38x38`
- `TitleTopHighlightImg`：`#8BEAFF`，尺寸 `290x6`，圆角 `3`
- `TitleInnerPanelImg`：填充 `#0755AC`，描边 `#48D6FF`，描边 `3`，尺寸 `288x42`，圆角 `8`
- `TitleBottomEdgeImg`：`#004B9C`，尺寸 `280x5`，圆角 `3`

`TitleTxt` 参考值：

- 字体：`Inter Bold` / `Inter Extra Bold`
- 字号：`22~23`
- 颜色：`#FFFFFF`
- 对齐：水平居中、垂直居中
- 文本阴影：`DROP_SHADOW rgba(0,53,111,0.55)`，offset `(0,2)`，radius `1.5`

位置参考：

- `SmallWindowUI`：`TitleBox (28,-26)`，`TitleTxt (86,-8)`
- `MediumWindowUI`：`TitleBox (30,-28)`，`TitleTxt (88,-10)`
- `LargeWindowUI`：`TitleBox (32,-30)`，`TitleTxt (90,-12)`

## 六、关闭按钮

`CloseBtn` 必须复用模板资源。

`参考值`：

- 尺寸：`78x78`
- 圆角：`8`
- 外按钮填充：`#25B7FF`
- 外按钮描边：`#0073CF`
- 外按钮描边粗细：`4`
- 外按钮顶部内高光：`INNER_SHADOW rgba(255,255,255,0.42)`，offset `(0,6)`
- 外按钮底部内压边：`INNER_SHADOW rgba(0,89,168,0.48)`，offset `(0,-8)`

内部资源参考：

- `CloseCoreImg`：`42x42`，位置 `(18,18)`，圆角 `6`
- `CloseCoreImg` 填充：`#F54B43`
- `CloseCoreImg` 描边：`#C92320`，粗细 `2`
- `CloseCoreImg` 顶部内高光：`rgba(255,255,255,0.45)`，offset `(0,4)`
- `CloseCoreImg` 底部内压边：`rgba(148,24,23,0.46)`，offset `(0,-5)`
- `CloseIconTxt`：字符 `×`，`Inter Extra Bold`，字号 `38`，白色 `#FFFFFF`
- `CloseIconTxt` 阴影：`DROP_SHADOW rgba(138,21,21,0.5)`，offset `(0,2)`，radius `1`

位置参考：

- `SmallWindowUI`：`CloseBtn (550,-27)`
- `MediumWindowUI`：`CloseBtn (680,-27)`
- `LargeWindowUI`：`CloseBtn (720,-27)`

规则：

- `CloseBtn` 放在窗口右上角，略微悬出 `PopupPanelBox`。
- 不要替换成文字“关闭”、线框 icon、纯圆按钮或灰色按钮。

## 七、OperationButtonExamplesUI 按钮规范

通用参考值：

- 按钮尺寸：`220x58`
- 圆角：`10`
- 描边粗细：`3`
- 文字字体：`Inter Bold`
- 文字字号：`20`
- 文字对齐：水平居中、垂直居中
- 按钮结构：外层 `*Btn` Frame + 内部 `*Txt` Text
- 按钮效果：只使用 `INNER_SHADOW`

| 按钮 | 用途 | 填充 | 描边 | 文字色 | 文字阴影 |
| --- | --- | --- | --- | --- | --- |
| `ConfirmBtn` | 确定、普通主操作 | `#25B7FF` | `#0073CF` | `#FFFFFF` | `rgba(0,53,111,0.55)` |
| `CancelBtn` | 取消、返回、放弃 | `#FFE9E6` | `#F26B62` | `#C9413A` | `rgba(255,255,255,0.7)` |
| `BuyBtn` | 金币购买、普通购买 | `#25B7FF` | `#0073CF` | `#FFFFFF` | `rgba(0,53,111,0.55)` |
| `PaidPurchaseBtn` | 付费购买、充值、礼包 | `#FFC43D` | `#D18A12` | `#FFFFFF` | `rgba(122,67,0,0.55)` |
| `EquipBtn` | 装备、启用、选择 | `#45D87A` | `#149B4A` | `#FFFFFF` | `rgba(7,80,44,0.55)` |
| `UnequipBtn` | 卸载、卸下、解除 | `#FF8A74` | `#C9413A` | `#FFFFFF` | `rgba(122,23,21,0.55)` |

按钮内投影参考：

- `ConfirmBtn` / `BuyBtn`：
  - 顶部内高光：`rgba(255,255,255,0.42)`，offset `(0,4)`，radius `4`
  - 底部内压边：`rgba(0,89,168,0.48)`，offset `(0,-7)`，radius `5`
- `CancelBtn`：
  - 顶部内高光：`rgba(255,255,255,0.42)`，offset `(0,4)`，radius `4`
  - 底部内压边：`rgba(201,65,58,0.24)`，offset `(0,-7)`，radius `5`
- `PaidPurchaseBtn`：
  - 顶部内高光：`rgba(255,255,255,0.42)`，offset `(0,4)`，radius `4`
  - 底部内压边：`rgba(184,116,15,0.48)`，offset `(0,-7)`，radius `5`
- `EquipBtn`：
  - 顶部内高光：`rgba(255,255,255,0.42)`，offset `(0,4)`，radius `4`
  - 底部内压边：`rgba(8,119,55,0.42)`，offset `(0,-7)`，radius `5`
- `UnequipBtn`：
  - 顶部内高光：`rgba(255,255,255,0.42)`，offset `(0,4)`，radius `4`
  - 底部内压边：`rgba(148,24,23,0.36)`，offset `(0,-7)`，radius `5`

按钮规则：

- `ConfirmBtn` 和 `BuyBtn` 使用同一亮蓝主按钮体系。
- `PaidPurchaseBtn` 的金橙色只用于强付费语义。
- `CancelBtn` 是浅红，不要比主按钮更抢眼。
- `UnequipBtn` 是负向操作，但不要混用 `CloseBtn` 的强红关闭语义。
- 简单按钮不要额外加 Rectangle 底板。

## 八、内容区布局与颜色建议

`推荐值`：

- 内容模块之间保持 `16~24` 间距。
- 列表项、卡片、按钮之间保持 `12~20` 间距。
- 标题与正文说明保持 `6~10` 间距。
- 内容区内部面板圆角推荐 `12~18`。
- 内容区内部面板描边推荐 `2~3`。
- 内容区内部面板底色推荐：
  - 主承载：`#FFFFFF` / `#F8FCFF`
  - 次级面板：`#F7FCFF` / `#E8F4FF`
  - 聚焦详情：`#E6F3FF` / `#D5E9FA`

布局规则：

- 小窗口内容聚焦单一任务。
- 中窗口适合左右或上下两区。
- 大窗口适合左列表、右详情、底部操作的三段结构。
- 内容区不要堆无信息价值的装饰节点。

## 九、进度条规范

`ProgressBarImg` 是进度样式参考节点，不是固定长度组件。

`参考值`：

- 尺寸：`520x54`
- 根节点：`ProgressBarImg`，自身为可见底图
- 底图填充：`#2B6EDB`
- 底图描边：`#12438F`
- 描边粗细：`3`
- 圆角：`27`
- 底部内压边：`INNER_SHADOW rgba(7,49,111,0.42)`，offset `(0,-7)`，radius `0`

内部资源参考：

- `ProgressFillImg`：满值填充，`#23CFC0`，圆角 `27`
- `ProgressFillImg` 底部内压边：`INNER_SHADOW rgba(7,139,121,0.48)`，offset `(0,-7)`，radius `4`
- `ProgressTxt`：`Inter Extra Bold`，字号 `22`，白色 `#FFFFFF`，水平居中、垂直居中

规则：

- 所有进度条、进度环、能量条、经验条、加载条在 Figma 中只制作满值状态。
- 不同界面的进度长度可按实际布局重做，不强制复用 `520x54`。
- 满值填充默认使用青绿色，避免与蓝色主按钮、金色付费按钮和绿色装备按钮混淆。
- 进度条不制作顶部高光条，不使用顶部高光效果；只保留底图和填充的底部内压边。
- 进度条文字统一使用 `进度值 / 目标值`，不要使用 `100%`、`25%`、`50%`、`75%` 等百分比文案。
- 进度变化、宽度裁切、数值变化和状态切换由游戏引擎运行时实现。

## 十、字体与字号

`参考值`：

- `TitleTxt`：`Inter Bold` / `Inter Extra Bold`，`22~23`
- `OperationButtonExamplesUI` 按钮文字：`Inter Bold`，`20`
- `CloseIconTxt`：`Inter Extra Bold`，`38`
- `ProgressTxt`：`Inter Extra Bold`，`22`

`推荐值`：

- 一级区块标题：`24~28`
- 二级区块标题：`20~22`
- 正文说明：`16~18`
- 标签 / 次级说明：`16`
- 按钮文字：`18~22`
- 核心数字 / 奖励数值：`28~36`
- 最小字体：`16`

规则：

- 标题和按钮文字优先使用粗体。
- 正文不要使用纯黑，优先使用深蓝灰。
- 普通正文不使用阴影、发光或模糊。

## 十一、新增界面执行顺序

1. 判断界面属于 `SmallWindowUI`、`MediumWindowUI` 还是 `LargeWindowUI`。
2. 复用对应窗口结构。
3. 复用模板 `TitleBox`，替换 `TitleTxt` 文案。
4. 复用模板 `CloseBtn`。
5. 内容区按钮按语义参考 `OperationButtonExamplesUI`。
6. 需要进度条时，参考 `ProgressBarImg` 的满值样式，并按当前界面实际宽度重做。
7. 在 `ContentBox` 内按功能组织卡片、列表、详情和操作区。
8. 完成后运行 `figma-ui-self-check`。

## 十二、禁止项

- 禁止重新手绘 `TitleBox` 或 `CloseBtn`。
- 禁止把按钮做成外阴影按钮。
- 禁止把窗口改成无描边、纯扁平、玻璃拟态或后台工具风。
- 禁止给普通正文使用发光、模糊或降低可读性的文字效果。
- 禁止给普通 UI 文本设置小于 `16` 的字号。
- 禁止在 `TemplatePage` 中制作 25%、50%、75% 等多档进度状态。
