# UI 文本与翻译接口

UIEditor 编写的 View 会作为 Generated 展示类导入游戏，动态文本应在这里处理好，
避免游戏业务接入类再次覆盖或翻译。App 仅模拟英文回退与参数格式化，不加载真实译文。

## 文案归属

- 静态标题、按钮文字和说明保存在设计节点，由工具收集；不另加 TranslationTexts 表项，
  不在 Render 中重复覆盖静态文字。
- 动态完整句子或状态文案在所属 Luau 顶层定义一个 `local TranslationTexts`。
  每项只包含非空字符串字面量 Key、Source，Source 使用完整英文原文或参数模板。
  工具直接收集该表中的文案定义，表项保持只读。
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
local Text = FXLoader:RequireShared("Scripts/Game/Shared/Text")

local TranslationTexts = {
    Progress = {
        Key = "OnlineRewardView.Progress",
        Source = "{current:int} / {required:int} minutes",
    },
}

-- 在 Render 等实际显示位置求值，不在模块顶层缓存翻译后的字符串。
self.ProgressTxt.Text = Text.Tr(TranslationTexts.Progress, {
    current = state.Minutes,
    required = config.RequiredMinutes,
})
```

`Text.Tr(definition, arguments?)` 接收 Key/Source 定义和独立参数。App 使用 Source 展开参数；省略 arguments
时返回 Source。支持 `{name}`、数字索引 `{1}`、`:int`（四舍五入，无千位分隔）、
`:fixed`（两位小数）、`:num`（英文千位分隔与两位小数），以及 `:string`、`:translate`
的原值替换。参数缺失、非法定义或不支持的格式会报错；不模拟日期和其他原生格式。
缩写数量由调用方提供显示字符串，模板用 `{value}`；整数数量用 `{count:int}`。
参数含 itemDefinition 时，App 用该定义的 Source 得到 item，不修改调用方参数。

`Text.TrSource(source)` 独立按原文查询；App 直接返回原文，不登记文案，不展开参数。
仅在需要完整原文查询时使用，不能用它代替动态模板的定义和 Text.Tr。

只提供上述固定路径的 RequireShared，不代表 App 支持任意游戏模块或完整 FXLoader。
源码保存和导出保留 Text 调用与 TranslationTexts，游戏使用自己的真实 Text 模块。

## 节点与验证

在 OnReady 中仅将由脚本主动翻译的具体动态节点设为 AutoLocalize=false，避免游戏二次
翻译。保留静态节点、父容器和设计数据的本地化设置。不为此关闭整个界面的本地化。
翻译是一次求值；游戏的翻译器加载及语言切换需由游戏已有刷新机制重新驱动 Render，
连接随组件清理。App 不模拟真实语言切换事件。

验证参数变化、状态变化、英文完整句子及保存重开后源码一致性。App 运行通过不代表
文案已收集、Key 已做全项目唯一性校验、译文已发布或 Roblox 语言切换验证通过。
参数格式依据 [Roblox 动态文本](https://create.roblox.com/docs/production/localization/translate-dynamic-content)。
