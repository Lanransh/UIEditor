# 工程类型制作包

当前仅维护 Roblox/。该目录提供新工程的 AgentWorkspace 入口与共享 skills，
不包含风格配色、模板或默认主题。空白、历史模板克隆和风格工程都安装此包。

AGENTS.md 必须非空；可使用 .agents/skills/、references/、assets/、examples/ 和根 Markdown。
技能必须声明有效 name。相对链接在生成工作区内闭合；不要硬链接可选的风格文件。
风格包独立校验，其文件及技能不能覆盖平台包。复制按字节保留，创建失败清理本次内容。

开发读取本目录，打包读取 resources/ProjectTypes/Roblox。已有工程不自动升级或改写。
维护代码接入约定时更新 roblox-ui-authoring 的 references/presentation-contract.md；
节点与接口说明以当前 MCP 能力及实现为依据，不把方案中的方法写成内置 API。
