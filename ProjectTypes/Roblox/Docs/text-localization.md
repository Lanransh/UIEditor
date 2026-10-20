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

在 OnReady 中仅将由脚本主动翻译的具体动态节点设为 AutoLocalize=false，避免游戏二次
翻译。保留静态节点、父容器和设计数据的本地化设置。不为此关闭整个界面的本地化。
翻译是一次求值；游戏的翻译器加载及语言切换需由游戏已有刷新机制重新驱动 Render，
连接随组件清理。App 不模拟真实语言切换事件。

验证参数变化、状态变化、英文完整句子及保存重开后源码一致性。App 运行通过不代表
文案已收集、Key 已做全项目唯一性校验、译文已发布或 Roblox 语言切换验证通过。
分别报告定义修改、工具收集、译文生成、云端发布和真实语言验收；工具未适配或不可用时
明确报告未完成收集验证。不手工修改翻译产物或自动上传云端。
参数格式依据 [Roblox 动态文本](https://create.roblox.com/docs/production/localization/translate-dynamic-content)。
