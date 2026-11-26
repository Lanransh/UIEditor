---
name: roblox-ui-authoring
description: 在 UIEditor 的 Roblox 工程中制作、修改和验证可编辑 UI，编写展示类与模拟接入，并交付游戏业务接入契约；视觉规则使用项目选定的风格。
---

# Roblox UI 制作

1. **确认工程与风格。** 用 `uie.editor.get_state`、`uie.project.list` 核对目标工程及 workspacePath。读取工程的 AGENTS.LOCAL.md，以及 gameDesignPath 指向的风格规范和专项技能。
2. **选模板。** 用 `uie.document.list({library:"templates"})` 分页查看模板，通过 target 读取截图、节点和脚本。选用匹配的模板，新界面使用副本或新建设计。编辑模板原件须获用户明确授权。
3. **编辑设计。** 查 `get_capabilities({detail:"summary"})`，再按 className 查属性和父子约束。从浅层树定位目标，保留已有节点 ID 和任务外属性。将布局、样式和条目原型保存为设计节点。图片优先复用资产库，缺图保留可替换的图片节点。查询、写入、资产导入及保存参数见[制作 API](references/editor-api.md)。
4. **编写交互。** 按[展示与业务接入](references/presentation-contract.md)和[脚本契约示例](references/script-contract-example.md)编写 View 与模拟接入。已保存的界面优先直接编辑同目录的 `.view.luau` 和 `.example.luau`。脚本遵循[Luau 编码规范](../roblox-luau-standards/SKILL.md)，文字处理遵循[本地化规范](../roblox-localization/SKILL.md)。
5. **验证并保存。** 按[运行 API](references/runtime-api.md)测试实际状态、动作和禁用行为。动态列表测试增删、排序、重复刷新、点击 ID 和滚动位置。检查日志，并用截图核对设计态与关键运行态。批次失败后读取诊断并显式停止，再修复。停止运行后保存、重开，核对节点、图片和脚本，执行本地化技能的文本验收。
6. **交付。** 写明模板来源、保存位置、占位图及替换方式、视觉差异和实际验证范围。指出游戏接入所需的 Config/State、动作、覆写方法和初始化顺序。Studio、设备及真实业务的结果分别说明。

## UI 改名

保存后从 get_state.relativePath 取得新目录。若需求涉及类名，按两份源码中的 FX.Class、继承和返回值同步修改引用，例如 OnlineRewardUI 对应 COnlineRewardView 和 COnlineRewardPreview。保留自定义父类与业务 ID。ScreenGui 名称独立管理；改动它时同步更新 PlayerGui 路径和导出引用，再运行验证。
