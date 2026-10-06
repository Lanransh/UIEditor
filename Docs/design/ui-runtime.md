# 界面脚本与运行时

## 当前能力与边界

每个界面保存 Luau 配置脚本、界面基类脚本与模拟接入脚本。运行时共同加载界面定义和这些脚本；模拟接入类继承界面类，提供配置、状态及动作处理，演示业务结果。没有真实协议或发奖，也尚未导出到 Roblox。

顶部“运行 / 停止 / 重置”控制会话。中央工作区包含“编辑界面 / 界面脚本 / 模拟接入脚本”三个页签，右侧始终保留属性面板。界面脚本页包含代码、配置脚本和节点引用；模拟接入页包含代码和模拟状态。底部“输出”页签与“资产目录”共用面板，显示打印、警告、动作和错误；默认显示资产目录，手动切换输出。切换底部或中央页签保留日志。运行自动切回画布，运行中可切换页签阅读源码。源码修改进入文档撤销历史；JSON 状态显式保存为初始状态，或在运行中应用。奖励示例会替换当前界面，可撤销；点击可领取按钮后模拟接入脚本更新为 Claimed。

## 文档与脚本

version=2 的 scripts 包含 config/source/integration 三份源码、references（引用名到节点 ID）和 state（初始模拟 JSON）。已有 version=2 文档缺少 integration 时补入默认模拟接入脚本；不支持 version=1。源码允许带语法错误保存，但运行前必须编译成功；每份最多 256 KiB 字符。数据最大嵌套 64 层，拒绝非有限数字与原型污染字段。

引用名是以英文字母开头的标识符。节点改名和移动不影响引用；删除节点后保留引用并显示“引用已失效”，运行时拒绝失效引用。复制节点不会自动更改已有脚本引用。

配置脚本必须返回可序列化表，例如 `return { Reward = { Id = "online_5min", Amount = 500 } }`。配置和状态递归只读；JSON null 对应 Luau 的 `JSONNull` 常量，数组使用 1 起始连续索引。Lua 空表默认表达对象，JSON 输入的空数组保留数组身份。

界面源码定义 `function UI:OnMount()`、`function UI:Render(state)`，以及可选的 OnShow/OnHide/OnDispose。只允许这五个类方法；初始化、RefreshUI 和业务钩子由宿主管理。局部交互数据可保存在实例字段中。没有第三个 Controller。

模拟接入源码通过 `function Preview:...` 定义 GetUIConfig/GetUIState/BindUIData/OnUIAction 四个入口，未定义的入口使用宿主默认实现，不能重写界面生命周期方法。实例的 self.Config 为只读配置，self.State 初始为只读模拟状态；模拟动作可以替换 self.State 后调用 self:RefreshUI()。EmitUIAction 先记录动作再调用模拟 OnUIAction。初始化按 OnMount → BindUIData（首次 RefreshUI）→ OnShow 执行。运行中应用 JSON 状态替换 self.State 后再次调用 Render。关闭会话按 OnHide → OnDispose 清理；清理失败也终止进程。

## 支持接口

| 方法 | 行为 |
| --- | --- |
| self:GetUIConfig() | 读取只读配置 |
| self:GetUIState() | 读取当前只读模拟状态 |
| self:RefreshUI() | 读取状态并调用 Render，拒绝递归刷新 |
| self:EmitUIAction(name, payload) | 记录动作名与可序列化参数 |
| self.UI:Get(ref, property) | 读取运行副本属性，复合值返回副本 |
| self.UI:Set(ref, property, value) | 设置注册表支持的属性 |
| self.UI:On(ref, "Activated", callback) | 只支持 TextButton/ImageButton；返回有 Disconnect() 的连接 |
| self.UI:SetEnabled(ref, boolean) | 启用或禁用按钮事件分发 |
| print(...) | 写入输出日志，不直接访问 stdout |
| warn(...) | 写入警告日志 |
| error(message) | 结束会话并显示错误及原始源码行号；保留出错前的日志（执行预算或内存耗尽时可能无法收集） |

脚本环境提供 UI 常用值类型的有限模拟：UDim.new；UDim2.new（四个数值或两个 UDim）、fromScale/fromOffset；Vector2.new；Color3.new/fromRGB/fromHex。支持 Scale/Offset、X/Y、Width/Height、R/G/B 字段和 typeof，值只读。Enum 提供当前属性注册表支持的类型与选项（如 Enum.Font.Gotham），支持 Name/EnumType 字段；EnumType 当前用类型名字符串表示。构造与字段依据 [Roblox 数据类型文档](https://create.roblox.com/docs/reference/engine/datatypes)。不提供完整引擎数据类型的方法、运算符或实例 API。

配置可包含这些值类型，传入 self.UI:Set 时转换成界面定义的 Scale/Offset、向量、十六进制颜色或枚举名，主进程继续校验属性。self.UI:Get 将相应属性还原为值类型。仍接受已有脚本使用的 JSON 形式属性值；错误的值类型或枚举类型会报错。值类型只存在于运行会话，不改变文档保存格式。

事件与刷新串行执行；一次命令的属性更新通过文档校验后整体提交。非法属性或脚本错误结束会话，不提交部分更新。不可见或禁用按钮不分发事件；连接在停止时统一失效。

首版通过条件判断设置文字、颜色和显隐，不提供状态编辑器、SetState、输入交互、滚动交互、动态节点、定时任务或复杂动画。

## 会话与安全

进入运行时创建文档快照，设计编辑只读，画布不显示选择框与拖动手柄。模拟 JSON 可独立编辑并应用，解析失败保留上一份状态。运行修改和日志不写入文档，也不进入撤销历史；重置使用运行开始时的快照和初始状态。

主进程通过受限 IPC 启动 ui-luau.exe，每次运行独立 VM。辅助程序使用官方 Luau 0.694 的固定提交及 nlohmann/json 3.11.3；JSON 行传递命令和结果。编译错误标记 config/interface/integration，运行错误保留原始源码行号。

VM 内存上限 64 MiB、每条命令执行预算 250 ms，主进程 2 秒看门狗兜底；消息最多 8 MiB，面板最多保留 500 条日志。用户环境没有 game、require、文件、网络、Node 或 Electron 接口；标准库沙箱只读。运行失败或进程意外退出恢复编辑状态，旧会话消息不能更新新会话。文档切换、工作台卸载、窗口关闭与渲染进程退出清理运行资源。

## 构建与验证

在 Editor 运行 `npm run build:runtime`：需要 CMake 3.20+、Git 和 C++17 编译器，首次获取固定源码需联网。Windows 可使用 MSVC 或 MinGW；通过附加 CMake 参数选择生成器与编译器。UI_EDITOR_CMAKE 可以指定 CMake 路径，UI_EDITOR_LUAU_SOURCE/UI_EDITOR_JSON_SOURCE 可以指定对应固定版本的本地源码。

输出位于忽略的 native-bin，包含 exe、宿主脚本及依赖许可证；打包复制到 resources/native-bin，普通用户不需要编译器或网络。BuildAndRun.bat 在辅助程序缺失时构建它；修改 native 源码后需主动再次执行 build:runtime。

`npm test` 包含真实 Luau 执行、超时、只读数据、原子更新和连接清理测试，先构建辅助程序。`npm run test:runtime` 检查 Electron 中的按钮、状态、重置、错误恢复及文档隔离。`node tests/runtime-smoke.mjs --packaged` 验证已打包程序的运行链路。上述检查不能证明 Roblox 的显示或设备性能。
