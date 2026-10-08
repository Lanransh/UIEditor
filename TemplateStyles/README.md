# 风格库

按工程类型维护：`TemplateStyles/Roblox/<风格名>/`。当前只支持 Roblox。
风格只提供视觉规范、模板、资源和可选专项技能，不提供工程 AGENTS.md 或复制公共代码规范。

必需 Game-DESIGN.md 和至少一份 template-references/**/*.rbxui.json。
可选 assets/、references/、examples/、其他根 Markdown 和 .agents/skills/。
风格 skills 的 SKILL.md 必须声明 name；不能与工程类型的技能名称或目录冲突。
Game-DESIGN.md 链接到本风格制作时需要读取的专项技能。

创建时模板原样进入 AgentWorkspace/styles/templates/，其他风格文件进入 styles/；
专项技能从源 .agents/skills/ 安装到 styles/skills/。只在新建工程时复制，此后不自动更新；
平台入口和公共 skills 来自 ProjectTypes/Roblox。旧风格根 AGENTS.md 不分发。
源包引用沿用原布局，安装时调整 Markdown 相对链接：规范到模板使用 ../template-references/，到技能使用
.agents/skills/<名称>/SKILL.md。包内相对链接必须闭合，不允许本机路径、链接目录或遗漏资源。

库只在创建时复制，项目独立可移动；更新库不改已有工程。打包时随应用分发。
