# 本机运行目录

- `UIEditor-win32-x64/`：`npm run package` 生成的 Windows 应用，入口为 `UIEditor.exe`。
- `Runtime/recent-projects.json`：最近工程记录。
- `Runtime/userData/`、`sessionData/`、`logs/`、`crashDumps/`：Electron 运行数据。
- `Runtime/npm-cache/`、`ElectronDownloadCache/`：批处理构建使用的下载缓存。
- `Runtime/nodejs/`：可选的便携 Node.js；批处理优先使用其中的 Node 和 npm。
- `AgentWorkspace/UIEditor_Roblox/`：版本化的 AI 工作入口、MCP 接口说明和示例；实际界面保存到当前工程。

本说明和 AI 工作区说明、示例纳入 Git，其他运行产物不纳入 Git。重新打包只替换应用目录，保留 Runtime 和 AgentWorkspace。
用户工程保存在选择的外部父文件夹下，不存入此目录。
