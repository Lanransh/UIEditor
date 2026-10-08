# Roblox 工程 UI 制作入口

本工作区属于父目录 UIEditorWorkspace，交付物是工程中可继续编辑、保存和重开的 Roblox UI。
制作或修改 UI 时使用 [Roblox UI 制作技能](.agents/skills/roblox-ui-authoring/SKILL.md)；
编写 Luau 时同时读取 [编码规范](.agents/skills/roblox-luau-standards/SKILL.md)。

工程类型决定节点、脚本、运行与导出合同。若本工作区存在 Game-DESIGN.md，先读取其中的
视觉规范及链接的风格专项技能，再选择匹配模板。风格只补充视觉制作方法，不改写平台接口。
没有风格规范时按用户需求与工程现有模板制作，不默认套用其他风格。

通过 ui-editor MCP 查看实际能力、制作、运行和保存；不直接改工程 JSON 或运行数据。
当前编辑器打开的工程必须与本工作区一致，不能误改其他工程。已有模板和项目定制文件不因
制作新界面而被覆盖。App 模拟不代表真实游戏校验、发奖或设备验证通过。
