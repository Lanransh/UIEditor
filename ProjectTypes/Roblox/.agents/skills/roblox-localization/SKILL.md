---
name: roblox-localization
description: UIEditor 文案翻译接入：Text.Define 声明、文件内去重、动态节点关闭自动翻译及文本验收。
---

# UI 文案翻译

## 1. 哪些要加

- 静态标题、按钮和说明留在设计节点，由工具收集；不重复加入 TranslationTexts。
- 动态句子、状态文案及脚本创建节点的固定文字使用 `Text.Define`；配置原文用 `Text.TrSource`。
- 纯数字、玩家输入、内部 ID 不登记翻译；example 不重复声明 View 已有文案。
- 本工作区负责编辑生成源 View，不能套用游戏侧“不修改 Generated”来跳过翻译处理。

## 2. 怎么定义和使用

- 先读现有 View 和声明。每文件最多一个顶层 `local TranslationTexts = Text.Define(...)`，
  没有新增文案不建空表。先加载 Text，只用字面量，前缀和条目用 PascalCase。
- 同文件 Key、Source 都不能重复，相同文案复用；跨文件允许重复，不建共享文案表。
- Source 用完整英文，动态值通过参数传入，不拼接、不拆句翻译，不手写 Key/Source 表。
- 在 Render 等实际展示位置调用 `Text.Tr(TranslationTexts.Message, arguments)`，
  不在模块顶层缓存译文。整数数量用 `{count:int}`，字符串或已格式化值用 `{value}`；
  数字格式说明符传 number，日期传 Unix 秒，倒计时在参数侧补零，禁止 `{name:string}`。
- 不擅自改已有 Key；改 Source 不改 Key，并说明已有译文需复核。
  完整接口、参数格式及预览边界见 [UI 文本与翻译接口](../../../Docs/text-localization.md)。

## 3. UIEditor 节点设置

- 脚本填充的动态文本节点，必须在设计属性中保存 `Text=""`、`AutoLocalize=false`，
  隐藏 Templates 原型同样处理；不能只在运行时关闭。样例放 example，由 View 写入。
- 动态文案由代码翻译，纯数据直接格式化显示，不依赖节点自动翻译。关闭开关不替代文案定义。
- 克隆继承原型设置，View 不重复设置。仅代码直接新建的文本节点，在写入文字前关闭自动翻译。
- 静态文案保留真实文字并开启自动翻译；纯数值和图标字符关闭。输入框用途提示不清空。
- 只关闭目标文本节点，不关闭图片、父容器或整页。先检查后代；若会阻断子文本自动翻译，
  先报告层级冲突，调整后再关闭，不能靠子节点 true 覆盖。修改模板原件仍须用户授权。

示例：进度节点 ProgressTxt 在编辑器中保存 `Text=""`、`AutoLocalize=false`，
View 的声明与 Render 片段如下（节点已由现有 View 获取）：

```lua
local FX = _G.FX
local Text = FX.Loader:RequireShared("Scripts.Game.Shared.Text")

local TranslationTexts = Text.Define("OnlineReward", {
    Progress = "{current:int} / {required:int} minutes",
})

-- 放在现有 Render 中；不重复设置节点的 AutoLocalize
self.ProgressTxt.Text = Text.Tr(TranslationTexts.Progress, {
    current = state.Minutes,
    required = config.RequiredMinutes,
})
```

## 4. 怎么检查

- 检查文件内 Key/Source 去重、完整英文及参数；不手改翻译产物或自动上传。
- 保存重开后读取 [文本验收脚本](scripts/audit-text.luau)，核对 View 及全部文本节点（含隐藏原型），
  按稳定 ID 编写 `local expectations = { ["节点ID"] = {dynamic=true, autoLocalize=false} }`。
  静态文案通常为 false/true，静态纯数值或图标为 false/false；按职责填写，不照抄当前属性。
- 将清单与脚本原文拼接，用 `uie.code.execute` 携带最新 sessionId/revision 执行；
  确认 success=true、changed=false、日志无失败。失败修复后保存重开重验，不删清单项绕过。
  超出任务范围的问题报告未通过及原因，不擅自批量修改。
- Run 检查首次显示、状态和参数变化、数据缺失及克隆复用，核对实际文字、布局及开关继承；
  检查导出保留节点开关与 View 源码。语言刷新由游戏机制驱动，连接随组件清理。
- 分别报告属性验收、运行态检查和未完成项；App 检查不代表文案收集、译文发布或真实语言验证通过。
