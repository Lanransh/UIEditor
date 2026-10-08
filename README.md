# UI 编辑器

面向 Roblox UI 制作的独立 Windows 桌面应用。当前提供浅色 Hub、本地工程管理、Roblox UI 编辑、JSON 保存加载及 Luau 脚本运行模式。
Hub 的布局参考同级 BlockModelEditor：上次打开、最近工程、路径卡片与 Roblox 标识。

## 启动

- 首次运行：双击根目录 `BuildAndRun.bat`，安装锁定依赖、构建并启动。
- 后续运行：双击 `Run.bat`，直接启动现有构建。源码修改后需重新构建。
- 构建需要 Node.js 24 LTS（至少 24.13）、npm，以及构建 Luau 辅助程序所需的 CMake 3.20+、Git 和 C++17 编译器（MSVC 或 MinGW）；首次获取依赖需要联网。打包应用运行时不需要这些工具或网络。
- 构建脚本先检查 PATH 中的 CMake；缺失或低于 3.20 时，尝试 Windows 的 `Program Files/CMake/bin/cmake.exe` 和 Visual Studio 自带的 CMake。其他安装位置可通过 `UI_EDITOR_CMAKE` 指定完整路径；显式指定的版本不符合要求时直接报错。
- 批处理和打包默认使用与参考工程相同的 npm Electron 镜像；可通过 `ELECTRON_MIRROR` 环境变量覆盖。
- 可将 Windows 便携 Node.js 放到 `ToolRuntime/Runtime/nodejs/`，批处理优先使用其中的 `node.exe` 和 `npm.cmd`。
- 打包入口：`ToolRuntime/UIEditor-win32-x64/UIEditor.exe`。运行打包应用无需额外安装 Node.js；分发时需保留整个应用目录，不能只复制 exe。
- app.asar 只收集 `dist`、`dist-electron` 和 `package.json`，Luau、MCP、工程类型包与模板风格通过额外资源复制；运行依赖已由 Vite/esbuild 打入构建产物，不再复制或扫描 `node_modules`。打包过程显示阶段与耗时，首次下载、解压 Electron 仍需等待。

## 使用

1. 点击“创建工程”，先选择整套模板风格，再选择父文件夹。程序创建固定的 `UIEditorWorkspace/project.json`，不要求输入名称；所有新工程从 `ProjectTypes/Roblox/` 创建独立 `AgentWorkspace/`，包含公共入口与制作技能；选定风格再从 `TemplateStyles/Roblox/` 复制模板到 `AgentWorkspace/styles/templates/`，视觉规范、资源和专项 skills 进入 `styles/`。默认也可选择空白工程；有历史时保留仅克隆模板的兼容入口，与风格选择互斥。
2. 工程创建后进入工作台，通过“文件 → 新建界面”创建 ScreenGui 或在底部“模板参考”中打开独立副本。鼠标移到左侧节点行，点击右侧“+”展开类型列表，选择类型即添加子节点；右侧编辑名称、父节点和属性，中间为 1280×720 画布。
3. 点击“打开工程”选择已有的 `UIEditorWorkspace` 文件夹，或点击最近工程卡片。
4. 同一父目录已有有效工程时，会询问是否打开；已有无效目录时不覆盖内容。
5. 历史卡片的垃圾桶仅移出记录，不删除工程。工程移动后使用“打开工程”重新登记。

创建或打开工程会生成工作区 `Run.bat`，双击可直接打开该工程；移动工程或更换编辑器位置后，重新打开工程以更新启动路径。工作区 `.gitignore` 仅追加 `/Run.bat`，工程 `project.json`、UI 文件和项目图片资产均可提交。已有忽略规则保留，用户自建 Run.bat 不会被覆盖。

### 模板风格与项目 AI

工程公共入口和技能维护于 `ProjectTypes/Roblox/`；视觉风格维护于
`TemplateStyles/Roblox/<风格名>/`。打包版读取 resources 下同名目录。
风格必需 `Game-DESIGN.md` 及 `template-references/**/*.rbxui.json`，
可提供资源和专项 skills，不提供工程入口或重复公共代码规范。
规则见 [工程类型包](ProjectTypes/README.md) 和 [风格库说明](TemplateStyles/README.md)。
当前 **多彩棋格风格** 包含 7 个鲜明配色独立模板，标题可按主题选色，
保留 Stud 平铺纹理，不包含 TemplatePage 展示页或全画布展示背景。

修改维护源后重新构建打包并运行新版 App，新建工程即使用新版，无需手动同步。
旧 `ToolRuntime/TemplateStyles/` 不再读取且不自动清理；其中的定制画风需纳入维护源。
项目 styles 是独立副本：库修改不更新已有项目风格，项目修改不回写库；
打开工程自动同步公共 AGENTS.md、Docs 与 skills，缺失时创建 AGENTS.LOCAL.md。
公共内容由生成的 .gitignore 排除，AGENTS.LOCAL.md 和 styles 应提交；
打开工程不覆盖项目定制提示词。移动时带上整个 UIEditorWorkspace 即可。
缺文档、坏模板、资源链接不闭合、链接目录或权限错误会给出具体反馈；
复制失败清理本次创建内容，目标已有文件不会被覆盖。

在 Codex 中以项目 `UIEditorWorkspace/AgentWorkspace/` 为 AI 工作目录，
启用 `ui-editor` MCP 并在 App 中打开该项目，只需描述界面需求。
项目入口要求 AI 先读规范及实际模板结构，按用途自动选择窗口和组件，
沿用本风格的字体、字号、加粗、语义色与纹理，通过 MCP 制作、测试、
截图、保存和重开。不能用模拟领取/购买状态代替真实资格校验、支付或发奖。

使用“文件 → 保存”或 Ctrl+S 保存，默认文件为 `interfaces/自定义名称.rbxui.json`；通过“打开界面”重新编辑。节点支持复制、删除、调整层级、画布拖动和尺寸调整，Ctrl+Z 撤销。空白处拖动、空格或中键平移，Ctrl+滚轮缩放，“适应窗口”重新居中。布局组件控制的子节点不能直接拖动。图片属性可保存 Roblox 资源 ID，并选择本地预览图嵌入文件。

使用“文件 → 新建界面”创建 UI，底部“项目资产”显示当前未保存界面和工程 `interfaces` 目录内的 UI 文件卡片。右键卡片选择“打开”即可编辑对应界面，左侧显示其节点树；切换前会提示保存未保存修改。工程外文件仍通过“文件 → 打开界面”选择。

当前 Roblox 是固定工程模式，提供外部 AI 使用的 MCP，支持通过 Toolkit 导入 Roblox，尚未提供内置 AI 或状态外观编辑器。MCP 服务需要可用的 Node.js；普通 App 使用不需要。支持类型和预览差异见 [静态 UI 设计](Docs/design/roblox-ui.md)。界面文件采用 version=3，只保存交互和接入两份类脚本；加载 version=2 时将配置、状态和引用转换到脚本中，不支持 version=1。

中央工作区只有“界面 / 交互脚本 / 接入脚本”三个一级页签。交互脚本返回继承 CUIEditorUICompClass 的 FX 类，负责通用展示和事件；接入脚本返回继承交互类的测试类，在 Ctor 中定义临时 Config、State，在动作处理中维护状态并 RefreshUI。通过 FX.Loader:Here 获取节点，直接读写属性和连接 Activated 事件，不再使用二级配置、引用或模拟状态面板。“载入奖励示例”会替换当前界面，可撤销；示例运行后点击领取，由接入类模拟修改为 Claimed。需要测试其他状态时，停止后修改接入类中的初始状态，再重新运行。底部“输出”显示 print、warn、动作和源码错误，与“UI 资产 / 图片资产”共用底部面板。脚本支持 UDim、UDim2、Vector2、Color3 和当前 UI 属性使用的 Enum，具体子集见运行规范。

“停止”恢复原设计，“重置”恢复运行开始时的快照。运行修改不保存为节点属性，也不影响撤销历史。接口、生命周期和限制见 [交互脚本与接入运行时](Docs/design/ui-runtime.md)。

## 开发与验证

Hub 右上角“设置”提供 Codex MCP 配置以启用 `ui-editor`。AI 在当前打开的工程内通过节点查询和代码事务制作界面，用 `uie.scripts.get/set` 直接读写交互代码和接入代码，再运行、模拟点击、读取日志和截图。执行结果可在 App 内撤销重做，MCP 不提供 undo/redo。所有新工程从项目 `AgentWorkspace` 开始；工程类型提供平台技能，风格提供视觉规范和专项技能。旧工程重开不会自动改写。接口与边界见 [MCP 自动化](Docs/design/mcp-automation.md)。

```powershell
cd Editor
npm ci
node node_modules/electron/install.js
npm run build:runtime
npm run dev
```

`dev` 支持 React 界面热更新；修改 Electron 主进程或 preload 后重启开发命令。

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | TypeScript 静态检查 |
| `npm run build:runtime` | 使用固定版本官方 Luau 源码构建独立宿主，输出到 native-bin |
| `npm test` | 存储、布局、撤销重做及真实 Luau 运行测试；先构建运行宿主 |
| `npm run build` | 检查并生成界面和 Electron 代码 |
| `npm start` | 启动已构建代码 |
| `npm run test:smoke` | 构建并启动真实 Electron，验证 Hub、节点编辑、画布拖动、保存重开和关闭提示 |
| `npm run test:display` | 使用源码启动隔离显示样例，检查节点渲染与字号约束并保存截图；Studio 对比另行执行，见[显示测试记录](Editor/tests/roblox-display-report.md) |
| `npm run test:packaged` | 启动已打包 exe，检查 Hub、IPC、运行目录和沙箱配置 |
| `node tests/workspace-launcher-smoke.mjs` | build 后验证工作区启动文件生成、直接打开工程及已有实例接收启动请求 |
| `npm run test:mouse` | 构建并验证鼠标事件、固定适应画布、滚动条及稳定 MCP 鼠标接口；需要已有原生宿主 |
| `npm run test:runtime` | 构建并验证脚本、按钮动作、数据刷新、重置及错误恢复 |
| `npm run build:mcp` | 构建独立 stdio MCP 服务，普通 build 已包含 |
| `npm run test:mcp` | 构建并通过真实 stdio MCP 验证制作、查询、历史、运行与保存 |
| `npm run test:mcp:packaged` | 验证已打包程序的 MCP 完整链路，需先 package |
| `npm run test:assets` | 构建并验证图片库、共用属性面板、单一 Roblox ID、保存重开及资产 MCP |
| `npm run test:templates` | 构建并验证项目模板与文件夹隔离、缩略图、独立副本、重启持久化、UI库互移与保存路径 |
| `npm run test:styles` | 构建并验证风格库、整套独立复制、失败清理、风格选择和历史克隆互斥、重开提示词保护 |
| `npm run test:style-library` | 构建并验证 Hub 画风库入口、全部模板预览、小组件聚焦、缩放刷新、只读保护与错误重试 |
| `npm run test:styles:packaged` | 验证已打包应用的风格库位置和新建项目流程；可指定 UI_EDITOR_PACKAGED_EXECUTABLE |
| `node tests/runtime-smoke.mjs --packaged` | 验证已打包 exe 的离线 Luau 运行 |
| `npm run package` | 构建 Windows x64 应用到 ToolRuntime |

冒烟测试通过 Electron 主进程替代原生目录对话框的返回值，实际执行 UI、IPC 和文件读写；不验证操作系统目录选择器的鼠标交互。
以上命令均在 `Editor/` 下执行。截图与隔离测试工程保存在忽略的 `Editor/test-results/` 下。测试不写入实际最近工程记录。

## 目录

- `Editor/`：开发工程，包含 package.json、锁定依赖和构建配置。
- `Editor/src/`：React Hub、静态 UI 工作台、策略与共享接口类型。
- `Editor/electron/`：文件管理、原生目录选择、受限 IPC 和应用生命周期。
- `Editor/scripts/`、`Editor/tests/`：开发、打包脚本及自动化验证。
- `TemplateStyles/`：风格制作包的唯一维护源；打包版直接读取分发资源，新建项目复制，之后不自动更新项目 styles。
- `SharedAssets/image-assets/catalog.json`：可提交的永久图片及 Roblox ID；上传后提交清单，其他电脑拉取即可复用，不需要重新上传。
- `ToolRuntime/`：打包应用和运行数据，详见[运行目录说明](ToolRuntime/README.md)。
- `Docs/`：[设计文档](Docs/design/README.md)，记录当前行为、数据格式与职责边界。

节点编辑通过 `Editor/src/history/useEditorHistory.ts` 接入命令历史，约定见[撤销与重做接入](Docs/design/app-design.md#撤销与重做接入)。“编辑”菜单提供撤销/重做入口，按历史状态启用；加载界面清空历史。

工程数据存放在用户选择的目录。最近记录及 Electron 数据集中保存在 `ToolRuntime/Runtime/`，构建不会清除该目录；应用所在位置需可写。

通过文件菜单「导入 Roblox」选择 Toolkit 当前打开且配置了 PlaceId 的游戏工程，提交当前 UI 和交互脚本；接入脚本只用于编辑器模拟预览。Toolkit 用 Rojo 构建并投递模型；生成脚本写入 Client/UI/Generated，游戏业务类继承生成交互类。首次使用需更新并重启 Toolkit/Studio 插件，接入与验证命令见 [导入设计](Docs/design/roblox-import.md)。
