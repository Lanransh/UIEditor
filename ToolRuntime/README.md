# 本机运行目录

- `UIEditor-win32-x64/`：`npm run package` 生成的 Windows 应用，入口为 `UIEditor.exe`。
- `Runtime/recent-projects.json`：最近工程记录。
- `Runtime/userData/`、`sessionData/`、`logs/`、`crashDumps/`：Electron 运行数据。
- `Runtime/npm-cache/`、`ElectronDownloadCache/`：批处理构建使用的下载缓存。
- `Runtime/nodejs/`：可选的便携 Node.js；批处理优先使用其中的 Node 和 npm。

本说明纳入 Git，运行产物不纳入 Git。重新打包只替换应用目录，保留 Runtime。
AI 入口随 ProjectTypes 工程类型包分发到各工程，不再维护 ToolRuntime 下的工作区。
用户工程保存在选择的外部父文件夹下，不存入此目录。
