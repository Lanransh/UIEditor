# UI 文本与翻译接口

UIEditor 编写的 View 会作为 Generated 展示类导入游戏，动态文本应在这里处理好，
避免游戏业务接入类再次覆盖或翻译。App 仅模拟英文回退与参数格式化，不加载真实译文。

## 文案归属

- 静态标题、按钮文字和说明保存在设计节点，由工具收集；不另加 TranslationTexts 表项，
  不在 Render 中重复覆盖静态文字。
- 动态完整句子或状态文案在所属 Luau 顶层用 `Text.Define` 声明一个
  `local TranslationTexts`，使用完整英文原文或参数模板。返回表及每项定义只读。
- 每个文件只定义自己需要的动态文案，不创建全局或集中共享表，不跨文件导出文案表。
  Key 在工具收集范围内唯一；同文不同文件使用各自模块前缀，同文件复用已有表项。
- 配置引用由工具处理，不复制配置原文到 TranslationTexts。
  业务 ID、节点路径和玩家输入不翻译；模拟接入不重复声明 View 已有文案。
- 游戏端不直接修改 Generated。业务接入先检查生成类，只为它尚未正确处理的动态文本
  最小补充翻译；已经处理的动态文本不重复翻译。

## 动态节点不保存占位文本

- 制作时先区分固定文案与运行时数据。由 View 根据 Config/State 或配置填写的文本节点，
  包括隐藏 Templates 中的原型，设计属性显式设为 `Text=""`，不保留控件默认文字，
  不用节点名、`Item Name`、`Product description`、`进度值 / 目标值` 或虚构业务内容占位。
  价格、倍率、进度、倒计时等样例（如 `+$18.2M`、`x7.5`、`0 / 12`、`92%`、`00:00`）
  也不写入设计节点，避免导出后被当成真实文案收集。
- 固定标题、导航、按钮和说明保留真实静态文案。输入框供玩家理解用途的 PlaceholderText
  是有效提示，不因这条规则清空。是否留空按内容归属判断，不按数字或文字格式批量删除。
- 样例数据放在 example 的模拟 Config/State 中，由 View 的初始化或 Render 写入；
  动态句子、状态按钮仍按本规范在 View 声明 TranslationTexts，纯数据不为填空而补文案定义。
  不把模拟样例复制回设计节点，也不为截图临时写入后保存。
- View 在首次显示前填充动态文本；复用或克隆条目时同步刷新。数据缺失时清空对应文字，
  或按产品需求显示已定义的真实空态/加载文案，不残留上一条数据或恢复假占位。
  动态文本区域保留合理尺寸与布局约束，避免空 Text 使布局塌缩。
- 验证保存并重开后的动态节点仍为空、静态文案仍在；Run 中检查首次显示、数据更新和缺失
  数据时的实际文字及布局。已有 UI 仅在本次需求范围内确认脚本接管后清理占位，不批量清空。

## 调用方式

```lua
local FX = _G.FX
local FXLoader = FX.Loader
local Text = FXLoader:RequireShared("Scripts.Game.Shared.Text")

local TranslationTexts = Text.Define("OnlineReward", {
    Progress = "{current:int} / {required:int} minutes",
})

-- 在 Render 等实际显示位置求值，不在模块顶层缓存翻译后的字符串。
self.ProgressTxt.Text = Text.Tr(TranslationTexts.Progress, {
    current = state.Minutes,
    required = config.RequiredMinutes,
})
```

## 定义与 Key 合同

`Text.Define(prefix, sources)` 只展开定义，不翻译、不修改输入，也不维护全局 Key 注册表。
上例返回 `TranslationTexts.Progress = { Key = "OnlineReward.Progress", Source = "..." }`。
前缀和条目名仅含英文字母和数字、以大写字母开头；前缀为简短稳定的 PascalCase
业务名，不带 S/C、CompClass 等实现细节，不从文件路径或类名推导。
原文必须是非空、非纯空白字符串。App 校验这些值并冻结返回结果，允许空原文表。

供工具静态收集的源码必须满足：

- 先加载 Text，每文件最多一个顶层固定形式
  `local TranslationTexts = Text.Define("Business", { Message = "English source" })`。
  前缀与原文使用字符串字面量，条目直接使用 PascalCase 标识符；
  不用字符串索引、句点条目名、拼接、插值、变量、其他函数或 require 结果。
- 允许注释、转义、长字符串和尾逗号；不使用调用别名，不在函数或分支内声明，
  不重新赋值或动态补字段。新增动态原文不再手写 Key/Source 文案表或旧 Key 别名。
- 工具只解析声明，不执行 Luau，不从 Text.Tr、Text.TrSource 或 Text.Mark 调用推断
  文案；未使用的定义也会收集，因此不预填无关项。
- 工具须检查原始表重复条目名、收集范围内的重复完整 Key 和非法声明，报告文件及
  行号并使收集失败，不静默漏收。运行时无法补检已被表覆盖的重复项。
  App 当前不实现该收集器；需由已适配 Text.Define 的外部工具验证。

新增前先在相关源码检索 `Text.Define`、候选前缀及条目；局部检索不能代替全范围校验。
同文件同语义复用已有项，同文不同义用不同项。新文件与已有前缀重名时为新前缀补充
实际业务语义，不为其让路而改已有 Key；不导入、导出文案表，接收完整定义不复制声明。

文件移动、类名或 UI 改名默认保持已有 Key，不批量迁移历史文案。发现已有完整 Key
冲突先说明定义来源和迁移影响，不擅自选保留方。只有用户明确授权才改 Key，
逐项保持 Source、参数名、类型和必要标签，并交付旧 Key → 新 Key 映射供工具显式迁移；
不按英文相同自动搬译文。仅改 Source 时保留 Key 并说明已有译文需复核；
同时改 Key 和 Source 时分别说明。

## 翻译与预览

`Text.Tr(definition, arguments?)` 接收 Key/Source 定义和独立参数。App 使用 Source 展开参数；省略 arguments
时返回 Source。支持 `{name}`、数字索引 `{1}` 和 Roblox 官方的全部 11 个格式说明符：

| 说明符 | 参数 | App 英文回退预览 |
| --- | --- | --- |
| `int` | number | 四舍五入的整数，无千位分隔 |
| `fixed` | number | 两位小数 |
| `num` | number | 英文千位分隔与两位小数 |
| `hex` / `HEX` | number | 小写 / 大写十六进制，负数使用 64 位补码 |
| `datetime` | number，Unix 秒 | UTC `YYYY-MM-DD HH:mm:ss` |
| `iso8601` | number，Unix 秒 | UTC `YYYY-MM-DDTHH:mm:ssZ` |
| `shorttime` | number，Unix 秒 | UTC 英文 12 小时制，如 `1:45 PM` |
| `shortdatetime` | number，Unix 秒 | UTC 英文短日期和时间，如 `10/10/2017 1:45 PM` |
| `shortdate` | number，Unix 秒 | UTC 英文短日期，如 `10/10/2017` |
| `translate` | string | 原值替换，不加载真实译文 |

游戏中的 `:translate` 按参数原文查询译文，不能用它代替普通字符串占位符。
数字说明符只接收有限 number，不自动转换数字字符串；`:translate` 只接收 string。
同条文案不能混用字符串类（`:translate`）与数字类说明符；未指定格式的 `{name}`
仍可与数字说明符组合，例如 `{name}: {count:int}`。
十六进制使用 Luau number 可表示的数值，范围为 `-2^63 <= value < 2^64`。
日期参数使用 Unix 秒，不传毫秒或已经格式化的日期字符串。App 取整秒，支持公历
1..9999 年，包括 epoch 前时间与闰日；预览固定英文与 UTC，不跟随开发机时区或语言。
游戏中的本地化数字、短日期和时间样式由 Roblox 的玩家语言决定，App 不模拟语言切换。
禁止使用 `{name:string}`：Roblox 不支持 `:string`，App 传参求值时也会报错。
参数缺失、类型错误、非法定义或不支持的格式会报错。
缩写数量由调用方提供显示字符串，模板用 `{value}`；整数数量用 `{count:int}`。
倒计时模板使用 `{minutes}:{seconds}` 或 `Next reward in {time}`；在参数侧用
`string.format("%02d", ...)` 或 `string.format("%02d:%02d", ...)` 补零，不使用 `:string`。
离线时长可用 `You were away for {hours}h {minutes}m`，minutes 由调用方提供补零后的字符串。
参数含 itemDefinition 时，App 用该定义的 Source 得到 item，不修改调用方参数。

`Text.TrSource(source)` 独立按原文查询；App 直接返回原文，不登记文案，不展开参数。
仅在需要完整原文查询时使用，不能用它代替动态模板的定义和 Text.Tr。

只提供上述固定模块的 RequireShared（兼容 `Scripts/Game/Shared/Text`），不代表 App
支持任意游戏模块或完整 FXLoader。
源码保存和导出保留 Text 调用与 TranslationTexts，游戏使用自己的真实 Text 模块。
已有 View 出现 `:string` 时，先修正源模板、验证参数变化后重新导出；导出不会自动改写
占位符。修改 Source 保留 Key，并复核已有译文中的同类格式。

## 节点与验证

按具体文本节点的翻译职责设置 AutoLocalize，不因文字是动态的就一律关闭：

- 纯数值、金额、进度、倍率和图标字符，以及由代码通过 Text.Tr / Text.TrSource 等完成
  翻译后赋值的节点，制作时在设计节点上保存 `AutoLocalize=false`；隐藏 Templates 中的
  同类原型也如此。保留需要显示的真实数值或图标，动态样例仍按前述规则留空。
- 固定文案，以及代码直接写入英文、仍依赖 Roblox 自动翻译的节点，保持开启。
  `Strength +50`、`Level 12` 等带正常文字的内容不能仅因含数字就当成纯数值关闭。
- 从已关闭的原型克隆出的节点继承该值，View 无需在 OnReady、Render 或每次刷新中
  重复设置。仅代码直接新建的同类节点，或无法修改原模板的节点，在创建后、写入文本前
  补设 `AutoLocalize=false`。修改模板原件仍须遵守已有模板授权规则。
- 只设置具体文本节点，不关闭父容器或整个 ScreenGui，以免影响其中仍需自动翻译的文案。
  `AutoLocalize=false` 会阻断后代自动翻译，子节点设为 true 也不能恢复。只关闭需要处理的
  那一个文本节点，不关闭其图片父节点、按钮、容器或整组子树；ImageLabel/ImageButton
  图片节点保持开启。这里的图标字符指 TextLabel 等文本节点中的字符，不指图片节点。
  关闭前检查该文本节点的后代；若仍有依赖自动翻译的文本，保持这个父文本节点开启，
  反馈层级冲突，由制作端调整文本层级后再设置，不能靠子节点设为 true 绕过。
  关闭节点自动翻译不替代代码文案定义；仍被代码调用的 TranslationTexts 和格式化模板
  必须保留，不因节点关闭或模板看起来只有数值就删除，也不手动删翻译 CSV 来绕过收集。

保存重开并检查导出模型保留这些节点的开关；克隆节点检查继承值。
翻译是一次求值；游戏的翻译器加载及语言切换需由游戏已有刷新机制重新驱动 Render，
连接随组件清理。App 不模拟真实语言切换事件。

验证参数变化、状态变化、英文完整句子及保存重开后源码一致性。App 运行通过不代表
文案已收集、Key 已做全项目唯一性校验、译文已发布或 Roblox 语言切换验证通过。
分别报告定义修改、工具收集、译文生成、云端发布和真实语言验收；工具未适配或不可用时
明确报告未完成收集验证。不手工修改翻译产物或自动上传云端。
参数格式依据 [Roblox 动态文本](https://create.roblox.com/docs/production/localization/translate-dynamic-content)。
