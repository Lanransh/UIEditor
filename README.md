# UI 编辑器

面向 Roblox UI 制作的独立 Windows 桌面应用。当前提供浅色 Hub、本地工程创建与打开、最近工程记录和空工作台。
Hub 的布局参考同级 BlockModelEditor：上次打开、最近工程、路径卡片与 Roblox 标识。

## 启动

- 首次运行：双击根目录 `BuildAndRun.bat`，安装锁定依赖、构建并启动。
- 后续运行：双击 `Run.bat`，直接启动现有构建。源码修改后需重新构建。
- 构建需要 Node.js 24 LTS（至少 24.13）或更新的受支持版本及 npm；首次安装需要联网。
- 批处理和打包默认使用与参考工程相同的 npm Electron 镜像；可通过 `ELECTRON_MIRROR` 环境变量覆盖。
- 可将 Windows 便携 Node.js 放到 `ToolRuntime/Runtime/nodejs/`，批处理优先使用其中的 `node.exe` 和 `npm.cmd`。
- 打包入口：`ToolRuntime/UIEditor-win32-x64/UIEditor.exe`。运行打包应用无需额外安装 Node.js；分发时需保留整个应用目录，不能只复制 exe。

## 使用

1. 点击“创建工程”，选择父文件夹。程序创建固定的 `UIEditorWorkspace/project.json`，不要求输入名称。
2. 工程创建后进入空工作台，左侧显示工程目录，可通过顶部“文件 → 返回 Hub”返回。
3. 点击“打开工程”选择已有的 `UIEditorWorkspace` 文件夹，或点击最近工程卡片。
4. 同一父目录已有有效工程时，会询问是否打开；已有无效目录时不覆盖内容。
5. 历史卡片的垃圾桶仅移出记录，不删除工程。工程移动后使用“打开工程”重新登记。

当前 Roblox 是固定的工程模式。尚不包含节点编辑、AI、模拟预览、Roblox 导入导出或游戏业务逻辑。

## 开发与验证

```powershell
cd Editor
npm ci
node node_modules/electron/install.js
npm run dev
```

`dev` 支持 React 界面热更新；修改 Electron 主进程或 preload 后重启开发命令。

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | TypeScript 静态检查 |
| `npm test` | 工程存储、校验、历史与非覆盖行为测试 |
| `npm run build` | 检查并生成界面和 Electron 代码 |
| `npm start` | 启动已构建代码 |
| `npm run test:smoke` | 构建并启动真实 Electron，验证主要操作和重启恢复 |
| `npm run test:packaged` | 启动已打包 exe，检查 Hub、IPC、运行目录和沙箱配置 |
| `npm run package` | 构建 Windows x64 应用到 ToolRuntime |

冒烟测试通过 Electron 主进程替代原生目录对话框的返回值，实际执行 UI、IPC 和文件读写；不验证操作系统目录选择器的鼠标交互。
以上命令均在 `Editor/` 下执行。截图与隔离测试工程保存在忽略的 `Editor/test-results/` 下。测试不写入实际最近工程记录。

## 目录

- `Editor/`：开发工程，包含 package.json、锁定依赖和构建配置。
- `Editor/src/`：React Hub、空工作台和共享接口类型。
- `Editor/electron/`：文件管理、原生目录选择、受限 IPC 和应用生命周期。
- `Editor/scripts/`、`Editor/tests/`：开发、打包脚本及自动化验证。
- `ToolRuntime/`：打包应用和运行数据，详见[运行目录说明](ToolRuntime/README.md)。
- `Docs/`：[设计文档](Docs/design/README.md)，记录当前行为、数据格式与职责边界。

工程数据存放在用户选择的目录。最近记录及 Electron 数据集中保存在 `ToolRuntime/Runtime/`，构建不会清除该目录；应用所在位置需可写。
