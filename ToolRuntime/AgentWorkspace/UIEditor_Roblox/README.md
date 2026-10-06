# UIEditor Roblox AI 工作入口

打开 UIEditor，在 Hub 右上角点击“设置”启用 `ui-editor`，然后在 Codex 中重新连接 MCP。在 App 打开业务工程后，AI 在本目录阅读说明并调用 MCP。

本目录不创建固定业务工程。界面保存在当前工程 `interfaces/`；制作代码不是业务运行脚本。

建议先查能力，再查询节点、制作、运行、点击、检查输出与截图。`examples/create-interface.luau` 制作示例节点；另两份文件可通过 `uie.scripts.set` 分别写入 source（交互代码）和 integration（接入代码），一起构成可运行示例。MCP 不提供 undo/redo，用户可在 App 内撤销编辑结果。
