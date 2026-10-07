# UIEditor Roblox AI 工作入口

打开 UIEditor，在 Hub 右上角点击“设置”启用 `ui-editor`，然后在 Codex 中重新连接 MCP。在 App 打开业务工程后，AI 在本目录阅读说明并调用 MCP。

本目录不创建固定业务工程。界面保存在当前工程 `interfaces/`；制作代码不是业务运行脚本。

- [Game-DESIGN.md](Game-DESIGN.md)：移植后的窗口、字体、按钮、命名与 Stud 风格规范。
- [.agents/skills/roblox-stud-ui/SKILL.md](.agents/skills/roblox-stud-ui/SKILL.md)：从 Figma 参考制作可编辑 UIEditor 界面。
- [Stud 资源](assets/stud/README.md)：原始透明平铺图与奖励图标，说明 Roblox 使用方式。

## 按模板制作

AI 默认主动查看当前工程模板参考，自行选取用途匹配的模板，不需要用户指定或预先打开副本。具体要求见 [AGENTS.md](AGENTS.md#角色与参考优先)。当前 MCP 不能直接打开模板参考库；工程路径已确认时，AI 可只读查看工程 `template-references` 的界面快照，再通过 MCP 制作并保存新项目UI，不改写模板原件。无法确认工程位置时只需补充工程路径；访问受限时才需要协助打开副本。

可直接使用以下提示词，并补充界面需求：

> 请制作我要的界面，主动查看当前工程模板参考，按界面用途和内容规模自行选择合适模板，不需要我指定。先读取模板结构与属性，窗口、标题、关闭按钮、操作按钮、卡片、配色、描边、圆角、字体与纹理都沿用模板，只调整需求涉及的内容和必要布局；不要自行换一套风格，也不要用默认蓝色窗口或签到示例替代已有模板。保持节点和文本可编辑，完成后对照模板属性及可取得的参考图检查并修正差异，保存为当前工程中的新项目UI并重开验证，不覆盖模板原件。

建议先查能力，再查询节点、制作、运行、点击、检查输出与截图。`examples/create-interface.luau` 制作示例节点；另两份文件可通过 `uie.scripts.set` 分别写入 source（交互代码）和 integration（接入代码），一起构成可运行示例。MCP 不提供 undo/redo，用户可在 App 内撤销编辑结果。
