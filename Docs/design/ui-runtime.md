# 交互脚本与接入运行时

## 当前能力与边界

中央工作区只有“界面 / 交互脚本 / 接入脚本”三个一级页签。界面页编辑节点和布局；另外两页直接编辑 Luau 源码，没有二级代码、配置、节点引用或模拟状态页签。右侧保留属性面板，底部输出显示打印、警告、动作和错误。

交互类负责供游戏复用的展示、事件和通用交互；测试接入类继承交互类，在自身 Ctor 中定义临时配置、初始化并维护状态，在动作处理中模拟业务结果。配置和状态不再作为独立编辑数据保存。App 运行时支持这些类的预览，尚未实现 Roblox 导入导出，也没有真实协议或发奖。

顶部“运行 / 停止 / 重置”控制会话；运行自动切回界面，运行中可以切换脚本页阅读源码。脚本编辑进入文档撤销历史。奖励示例包含静态节点、交互类及测试接入类；载入会替换当前界面，可撤销。示例从 Claimable 开始，领取后接入类修改自身状态为 Claimed 并刷新界面；可以修改接入类构造函数中的状态测试 Locked 或 Claimed。

## 文档与类继承

version=3 的 scripts 只包含 source（交互源码）和 integration（接入源码）。两份脚本都返回自己的类，每份最多 256 KiB 字符。允许带语法错误保存，运行前必须编译成功。已有 version=2 文件加载时，将配置、模拟状态和节点引用转为两份类脚本中的代码，后续保存为 version=3；不支持 version=1。

类写法参照游戏仓库中的 FXClass 和 FCUICompClass：

```lua
local FX = _G.FX
local UI = FX.Class("UIInteraction", "FCUICompClass")

function UI:OnReady()
    self.Button = FX.Loader:Here(self:GetRootNode(), "Panel/Button")
    self:TrackConnection(self.Button.Activated:Connect(function()
        self:EmitUIAction("ClaimReward", { RewardId = self:GetUIConfig().Reward.Id })
    end))
end

function UI:Render(state)
    self.Button.Text = state.Status
end

return UI
```

接入源码使用 `FX.Class("UIPreview", "UIInteraction")`，返回 Preview 类。在 `Preview:Ctor(owner)` 中先调用 `Preview.Super.Ctor(self, owner)`，再赋值 `self.Config` 和 `self.State`。接入类可覆盖 GetUIConfig/GetUIState/BindUIData/OnUIAction 和生命周期，也可定义自有方法；覆盖生命周期时用 Super 显式调用父类。临时配置和状态可直接修改；修改后调用 RefreshUI 驱动展示。

App 提供 FX.Class、FX.GetClass、Super、New、IsA、GetClassName 的兼容实现，只注册预览所需的 FCUICompClass 基类；没有加载完整游戏框架。基类提供 Ctor、Dtor、GetOwner、GetRootNode、TrackConnection、Show、Hide，以及数据与动作接口。游戏参考类原有的网络、组件管理及动画服务不在 App 模拟范围内；数据与动作接口属于当前编辑器的交互合同，实际游戏接入仍需提供对应实现。

初始化顺序为接入类 Ctor → OnReady → BindUIData（默认首次 RefreshUI）→ Show/OnShow。停止执行 Hide/OnHide → 可选旧版 OnDispose → Dtor，并统一断开连接。新会话和重置重新构造接入实例，不共享上一轮状态。EmitUIAction 记录动作后调用实例的 OnUIAction；RefreshUI 读取 GetUIState 返回值并调用 Render，拒绝递归刷新。

## 节点与支持接口

脚本直接获取节点对象，不需要额外绑定引用名。FX.Loader:Here(root, "父节点/子节点") 按层级查找；FX.Loader:PlayerGui(name) 返回当前 ScreenGui。节点支持 Name/ClassName/Parent、FindFirstChild、WaitForChild、IsA、子节点字段、支持属性的读写，以及按钮 Activated:Connect。这里只模拟已有静态节点，不支持 Instance.new 或动态增删。节点路径不存在、同级重名导致歧义或属性不支持时明确报错；修改节点名称或层级后需同步脚本路径。

| 方法 | 行为 |
| --- | --- |
| self:GetUIConfig() / self:GetUIState() | 默认返回实例的 Config / State，接入类可覆盖 |
| self:RefreshUI() | 读取状态并调用 Render |
| self:EmitUIAction(name, payload) | 记录动作与可序列化参数并调用接入处理 |
| self:TrackConnection(connection) | 跟踪连接，Dtor 清理 |
| self:SetButtonEnabled(node, boolean) | 设置 App 模拟按钮是否分发点击 |
| print / warn / error | 输出普通信息、警告或终止会话的错误；错误保留原始源码行号 |

旧版迁移脚本继续支持 self.UI:Get/Set/On/SetEnabled，以内嵌的引用名到节点 ID 表解析节点，不再显示引用面板。

脚本环境提供 UI 常用值类型的有限模拟：UDim.new；UDim2.new（四个数值或两个 UDim）、fromScale/fromOffset；Vector2.new；Color3.new/fromRGB/fromHex。支持 Scale/Offset、X/Y、Width/Height、R/G/B 字段和 typeof，值只读。Enum 提供当前属性注册表支持的类型与选项（如 Enum.Font.Gotham），支持 Name/EnumType 字段；EnumType 当前用类型名字符串表示。构造与字段依据 [Roblox 数据类型文档](https://create.roblox.com/docs/reference/engine/datatypes)。不提供完整引擎数据类型的方法、运算符或实例 API。

接入类配置可包含这些值类型，赋给节点属性时转换成界面定义的 Scale/Offset、向量、十六进制颜色或枚举名，主进程继续校验属性。读取节点属性时还原相应值类型。仍接受已有脚本使用的 JSON 形式属性值；错误的值类型或枚举类型会报错。值类型只存在于运行会话，不改变文档保存格式。

事件与刷新串行执行；一次命令的属性更新通过文档校验后整体提交。非法属性或脚本错误结束会话，不提交部分更新。不可见或禁用按钮不分发事件；连接在停止时统一失效。

首版通过条件判断设置文字、颜色和显隐，不提供状态编辑器、SetState、输入交互、滚动交互、动态节点、定时任务或复杂动画。

## 会话与安全

进入运行时创建文档快照，设计编辑只读，画布不显示选择框与拖动手柄。运行中两份源码只读；调整临时配置或初始状态需停止后编辑接入脚本，再重新运行。运行修改和日志不写入文档，也不进入撤销历史；重置使用运行开始时的快照重新构造接入实例。

主进程通过受限 IPC 启动 ui-luau.exe，每次运行独立 VM。辅助程序使用官方 Luau 0.694 的固定提交及 nlohmann/json 3.11.3；JSON 行传递命令和结果。编译错误标记 interface/integration，运行错误保留原始源码行号。

VM 内存上限 64 MiB、每条命令执行预算 250 ms，主进程 2 秒看门狗兜底；消息最多 8 MiB，面板最多保留 500 条日志。用户环境仅提供受限的 _G.FX，没有 game、require、文件、网络、Node 或 Electron 接口；标准库和框架公共接口只读。运行失败或进程意外退出恢复编辑状态，旧会话消息不能更新新会话。文档切换、工作台卸载、窗口关闭与渲染进程退出清理运行资源。

## 构建与验证

在 Editor 运行 `npm run build:runtime`：需要 CMake 3.20+、Git 和 C++17 编译器，首次获取固定源码需联网。Windows 可使用 MSVC 或 MinGW；通过附加 CMake 参数选择生成器与编译器。UI_EDITOR_CMAKE 可以指定 CMake 路径，UI_EDITOR_LUAU_SOURCE/UI_EDITOR_JSON_SOURCE 可以指定对应固定版本的本地源码。

输出位于忽略的 native-bin，包含 exe、宿主脚本及依赖许可证；打包复制到 resources/native-bin，普通用户不需要编译器或网络。BuildAndRun.bat 在辅助程序缺失时构建它；修改 native 源码后需主动再次执行 build:runtime。

`npm test` 包含真实 Luau 执行、超时、类继承、数据维护、原子更新和连接清理测试，先构建辅助程序。`npm run test:runtime` 检查 Electron 中的三个一级页签、按钮、接入状态、重置、错误恢复及文档隔离。`node tests/runtime-smoke.mjs --packaged` 验证已打包程序的运行链路。上述检查不能证明 Roblox 的显示或设备性能。
