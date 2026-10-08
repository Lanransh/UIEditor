---
name: roblox-ui-authoring
description: 在 UIEditor 的 Roblox 工程中制作、修改和验证可编辑 UI，编写展示类与模拟接入，并交付游戏业务接入契约；视觉规则使用项目选定的风格。
---

# Roblox UI 制作

## 平台与风格

先读工作区 AGENTS.md。工程有 Game-DESIGN.md 时读取它及其中的风格专项技能。
平台技能管理节点能力、代码和验证；风格技能管理视觉制作，不复制平台流程。

制作前读取 [制作接口](references/editor-api.md)；编写交互时读取
[运行接口](references/runtime-api.md)、[展示与业务接入](references/presentation-contract.md)
和 [Luau 编码规范](../roblox-luau-standards/SKILL.md)。接口以当前 MCP 返回的能力为准。

## 制作流程

1. 用 uie.editor.get_state/get_capabilities 确认当前会话与能力。工作区父目录就是本工程；
   用 uie.project.list 与返回的工程身份核对当前工程，不猜测最近工程。身份不匹配时先纠正。
2. 用 uie.document.list({library:"templates"}) 列出工程模板，按 nextOffset 翻页。
   用返回的 UUID 构造 target={library:"templates",documentId:...}，读取 nodes.get/find、
   scripts.get 和 debug.screenshot；这些只读查询不切换当前画布。模板为空时不假装已复用。
3. 按用途选择匹配模板，保留风格规定的视觉结构，仅调整需求内容。模板节点 ID 不用于修改
   当前界面；通过 document.new 与 code.execute 的制作 API 创建新设计节点及新 ID。
   修改已有界面先查询稳定节点 ID，保留任务外内容。布局单位明确为 Scale/Offset。
4. code.execute、scripts.set 等写操作携带最新 sessionId/revision；冲突后重读。
   事务整体进入 App 撤销历史，MCP 没有 undo/redo。制作 VM 不读文件，不编造 API。
5. 静态视觉保存在设计节点中；source 负责展示与交互，integration 提供模拟业务。
   按需求克隆动态条目，普通页面不重复编写通用屏幕适配；接入细节见业务接入参考。

## 验证与交付

- 用 runtime.control/click 验证需求涉及的状态、按钮、禁用、关闭、重置及动态条目身份。
  有 runtime.batch 时可合并顺序步骤，检查每步结果和实际属性，不只检查调用成功。
  批次失败不自动停止运行，先取证再显式 stop 修复；不盲重试会话冲突。
- 用 debug.get_diagnostics 检查错误；批次已返回诊断且无异常时不重复读取同一份。
- 截图检查设计态及确有视觉差异的关键运行态，结合风格专项检查验证布局、文字、
  图片和层级。属性断言不能替代截图；没有参考截图时只称属性核对。
- 停止后通过 document.save 保存到 interfaces 内相对路径，再 document.open 重开核对
  节点、图片、文字与脚本。切换脏文档前保存，不静默丢弃或覆盖其他文件。
- 交付说明模板来源、保存位置、视觉差异、实际检查，以及 Config/State、必需与可选
  覆写方法、动作参数和初始化顺序。Studio/设备和真实业务接入未验证时明确说明。
