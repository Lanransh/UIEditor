# Roblox 工程 UI 制作入口

<!-- UIEditor managed workspace: 打开工程时自动同步，请勿在这里写项目要求。 -->

开始任务前必须读取项目补充要求 `AGENTS.LOCAL.md`（@AGENTS.LOCAL.md）。
本文件、Docs/ 和 .agents/skills/ 由编辑器维护，不提交到项目 Git。
AGENTS.LOCAL.md 和 styles/ 由项目维护并提交；不修改编辑器维护的文件。

本工作区属于父目录 UIEditorWorkspace，交付物是工程中可继续编辑、保存和重开的 Roblox UI。
制作或修改 UI 时使用 [Roblox UI 制作技能](.agents/skills/roblox-ui-authoring/SKILL.md)；
编写 Luau 时同时读取 [编码规范](.agents/skills/roblox-luau-standards/SKILL.md)。

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

通过 ui-editor MCP 查看实际能力、制作、运行和保存；不直接改工程 JSON 或运行数据。
当前编辑器打开的工程必须与本工作区一致，不能误改其他工程。已有模板和项目定制文件不因
制作新界面而被覆盖。App 模拟不代表真实游戏校验、发奖或设备验证通过。
