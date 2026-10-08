# 工程类型制作包

当前仅维护 Roblox/。该目录提供编辑器维护的 AGENTS.md、Docs/ 与 .agents/skills/。
Docs 保存编码规范、接口、脚本契约与示例；skills 负责引导读取和执行，不重复维护正文。
开发读取本目录，打包读取 resources/ProjectTypes/Roblox。

创建或实际打开工程时同步上述三个位置，清理公共目录中已废弃的文件；相同内容不重写。
AGENTS.LOCAL.md 仅在缺失时创建，styles/ 不参与打开时的同步。最近工程列表只读检查不触发同步。
工程 .gitignore 忽略公共位置和 Run.bat；AGENTS.LOCAL.md 与 styles/ 应提交到项目 Git。
已被 Git 跟踪的旧公共文件需人工取消跟踪，编辑器不自动操作项目 Git 索引。

AGENTS.md 必须非空；公共包只分发 AGENTS.md、Docs/、.agents/skills/。
技能必须声明有效 name，相对链接在生成工作区内闭合，不硬链接可选的风格文件。
风格包独立校验，仅新建工程时安装到 AgentWorkspace/styles/；详见 TemplateStyles/README.md。
维护脚本接入契约时更新 Roblox/Docs/presentation-contract.md 与配套示例。
