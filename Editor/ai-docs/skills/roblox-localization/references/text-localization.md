# UI 文本与翻译接口

节点属性及验收见[本地化技能](../SKILL.md)。UIEditor 的 View 使用固定模块 FXText；App 按英文 Source 展开参数，游戏使用实际译文。

## 声明与复用

```lua
local Text = _G.FX.Loader:RequireShared("Scripts.Framework.Shared.Core.FXText")
local TranslationTexts = Text.Define("OnlineReward", {
    Progress = "{current:int} / {required:int} minutes",
})
COnlineRewardView.BaseViewTranslationTexts = TranslationTexts

-- 在 Render 中求值
self.ProgressTxt.Text = Text.Tr(TranslationTexts.Progress, {
    current = state.Minutes,
    required = config.RequiredMinutes,
})
```

- Text.Define 返回只读定义，上例的 Key 为 OnlineReward.Progress。每个有新增文案的文件最多一处顶层声明，使用示例中的变量名与字面量形式。前缀与条目名用大写字母开头的 PascalCase，只含英文字母和数字。前缀按业务命名，Source 为非空白的完整英文。
- 静态收集器解析声明，支持注释、转义、长字符串与尾逗号；别名、变量、拼接、动态补字段和手写 Key/Source 表无法作为声明收集。未用定义也会被收集。同文件条目名和 Source 各自唯一，跨文件允许重复。原始表的重复键可能被运行时覆盖，须用支持 Text.Define 的外部收集器核对文件与行号。
- View 将原表挂到 BaseViewTranslationTexts，派生类直接用 Text.Tr(BaseView.BaseViewTranslationTexts.Progress, args)。只在有新增文案时声明自己的表。游戏语言切换后重新 Render，随组件清理订阅。
- 移动文件、改类名或修订 Source 时保留原 Key，改 Source 后复核译文。授权迁移 Key 时逐项记录新旧映射，保留 Source、参数类型和标签。

## 参数格式

Text.Tr(definition, arguments?) 省略参数表时 App 返回 Source。提供参数时支持 `{name}`、`{1}` 及下表格式。Text.TrSource(source) 用于按完整原文查询；App 原样返回，不展开参数。

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


- 数字格式传有限 number；十六进制范围为 `-2^63 <= value < 2^64`。日期传 Unix 秒，App 取整秒并按 UTC 展示，支持公历 1 至 9999 年。游戏按玩家语言显示。
- 字符串或已格式化数量用 `{value}`。Roblox 不支持 `{value:string}`；已有模板应修正 Source、保留 Key 并重新导出。倒计时用 `{minutes}:{seconds}`，调用方用 string.format("%02d", n) 补零。
- `:translate` 需要 string，游戏按该原文查询译文。同一模板不能混用 `:translate` 与数字格式；普通占位符可与数字格式组合。参数中的 itemDefinition 在 App 以其 Source 填充 item。
- 缺少参数、类型错误或格式无效会报错。验证格式时覆盖实际数值和状态变化。[Roblox 动态文本](https://create.roblox.com/docs/production/localization/translate-dynamic-content)
