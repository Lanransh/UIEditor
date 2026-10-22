# Roblox 工程 UI 制作入口

<!-- UIEditor managed workspace: 打开工程时自动同步，请勿在这里写项目要求。 -->

开始任务前必须读取项目补充要求 `AGENTS.LOCAL.md`（@AGENTS.LOCAL.md）。
本文件、Docs/ 和 .agents/skills/ 由编辑器维护，不提交到项目 Git。
AGENTS.LOCAL.md 和 styles/ 由项目维护并提交；不修改编辑器维护的文件。

本工作区就是 UIEditorWorkspace，交付物是工程中可继续编辑、保存和重开的 Roblox UI。
制作或修改 UI 时使用 [Roblox UI 制作技能](.agents/skills/roblox-ui-authoring/SKILL.md)；
编写 Luau 时同时读取 [编码规范](.agents/skills/roblox-luau-standards/SKILL.md)。
涉及 UI 文本时同时使用 [本地化规范](.agents/skills/roblox-localization/SKILL.md)，
按其中规则声明文案、保存动态节点属性，并执行覆盖隐藏原型的文本属性验收及运行态检查。
未执行或未通过须明确报告，不能仅凭截图宣称通过。

工程类型决定节点、脚本、运行与导出合同。若本工作区存在 styles/Game-DESIGN.md，先读取其中的
视觉规范及链接的风格专项技能，再选择匹配模板。风格只补充视觉制作方法，不改写平台接口。
没有风格规范时按用户需求与工程现有模板制作，不默认套用其他风格。

只有用户明确提出修改模板，或明确同意修改模板后，才可以编辑、保存或覆盖模板原件。
制作新界面、参考模板或发现模板问题不构成修改授权；未获授权时只读取模板或使用副本。
已获授权后，通过 MCP document.open 的 target 与 mode=edit 打开模板原件，复用节点、脚本
编辑接口，并用不带 relativePath 的 document.save 保存回原模板；不要直接修改模板 JSON。
修改模板不自动更新已创建的项目 UI、其他工作区或全局画风库。

uie.editor.get_state 返回 workspacePath、agentWorkspacePath、gameDesignPath 和 gameDesignExists。
先核对路径属于本工作区；项目风格规范 styles/Game-DESIGN.md 可按用户要求使用文件工具直接
读取、修改或创建，无需 MCP 文档写接口。修改规范不自动修改模板，模板修改仍需上述授权。

通过 ui-editor MCP 查看实际能力、制作节点、运行和保存；不直接改工程 JSON 或运行数据。
保存后的 UI 位于独立目录 interfaces/XXUI/，包含 XXUI.json、XXUI.view.luau 和 XXUI.example.luau；模板和永久UI也使用独立同名目录。
view 是脚本交互代码，example 是模拟接入代码；可用文件工具直接读写这两份 Luau，
无需通过 MCP 修改源码。运行、保存或重开会读取磁盘代码；同一部分双侧修改冲突需先处理。
example 只用于 App 模拟，Roblox 导出格式不变，不导出模拟接入代码。
当前编辑器打开的工程必须与本工作区一致，不能误改其他工程。已有模板和项目定制文件不因
制作新界面而被覆盖。App 模拟不代表真实游戏校验、发奖或设备验证通过。

## UI 改名后的代码检查

修改界面名称并保存后，App 会联动改名独立目录、UI JSON、view 和 example 文件，保留 UI/节点 ID 和脚本原文。先重新读取 get_state 的 relativePath，使用新路径；不要另存一份来代替改名。
App 不自动替换 Luau 类名。用户需要代码名称跟随 UI 改名时，由 AI 先读取两份源码，确认实际 FX.Class 声明、局部变量、返回值和继承关系，再按语义修改 View 与模拟接入类及全部相互引用；不要对整个工作区做字符串全局替换。
标准新建类名可参考 scriptClassNames 约定，例如 OnlineRewardUI 对应 COnlineRewardView 和 COnlineRewardPreview；example 是文件职责命名，不强制将现有 Preview 类改为 Example。保留自定义父类、业务标识和任务外内容。
ScreenGui 节点名称与 UI 文档名称是不同字段，只有需求涉及它时才调整，并同步检查 FXLoader:PlayerGui、Here 路径及导出接入引用。完成后通过 Run、日志和动作验证两份源码的继承与运行，确认 Roblox 导出仅保留 View；App 测试不代表游戏业务和设备验证通过。
