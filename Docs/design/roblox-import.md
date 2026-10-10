# Roblox 一次性导入

## 使用流程

在 StudioGameToolkit 打开目标游戏的 GameKitWorkspace 工程，在项目设置填写 PlaceId；Studio 打开同一地图，使用更新后的 Toolkit 插件。UIEditor 的「文件 → 导入 Roblox」先检查当前界面图片。若有仅本地预览、缺少 Roblox ID 的图片，导入暂停并显示图片清单，列出图片名称与节点路径；可单张上传，也可全部按顺序上传。上传成功后，图片资产的 ID 保存到资产库，内联预览图的 ID 保存到对应节点并进入文档历史。失败、审核未完成或 ID 未保存的图片继续阻止导入。所有图片就绪后再发现并选择目标工程，用户点击导入后提交当前编辑快照，不要求先保存。导入操作本身不写入文档历史，也不使用运行副本。

UIEditor 主进程连接固定本机桥接 `127.0.0.1:34871`。工程令牌只留在主进程，渲染进程只得到工程名称、ID 和 PlaceId。更新 Toolkit 后需重启后台；Toolkit 自动更新插件后需重新打开 Studio。

UIEditor 启动进入 Hub 时立即发现 Toolkit 工程，不依赖打开工程、上传弹窗或导入弹窗。连接失败或没有已配置 PlaceId 的工程时，在上次尝试结束 5 秒后再次连接；发现有效工程后停止重试。后台发现与手动刷新共享正在执行的发现请求，避免并发连接；后续请求发现网络断开或工程连接失效时重新启用 5 秒重连，刷新令牌。退出编辑器清理定时器，即使正在连接也不再安排下一次尝试。连接只发现工程，不提交图片或界面。

## 导入结果

- 静态模型一次性插入 `StarterGui.<实际根名>`；保留节点名称、层级、属性与稳定 ID。
- 生成类写入游戏 `Scripts/StarterPlayerScripts/Client/UI/Generated/`，脚本由原生 Script Sync 同步；在 Studio 将 StarterPlayerScripts 绑定到本机 Scripts/StarterPlayerScripts，草稿由开发者提交。
- 数据与动作接口由一个公共中间基类承担：

```text
Generated/
  CUIView.luau                 # 继承 FCUICompClass
  COnlineRewardView.luau         # 继承公共基类
```

公共基类源码唯一维护在 `Editor/src/shared/uiCompClass.ts`；构建时嵌入编辑器运行宿主，导入时随 `scripts.shared` 提交给 Toolkit。UIEditor 生成完整交互源码（公共类 require、ScreenGuiName 元数据及旧父类兼容转换）；Toolkit 原样同步 `scripts.source/shared`，只负责目标工程、生成脚本落盘与原生节点投递。UIEditor 不读取目标工程结构。旧 UIEditor 未携带公共类时，Toolkit 提示更新客户端。

类文件按源码中的实际类名命名，不从可改的文档显示名猜测。界面交互类附加 ScreenGuiName 元数据供公共基类查找 PlayerGui；公共基类提供组件名、根节点、配置、状态、刷新、动作转发与原生按钮禁用。连接清理、Show/Hide 仍继承游戏 FCUICompClass。App 加载这份公共类，宿主仅适配固定画布、原生按钮禁用与动作日志，不载入完整游戏框架。

新文档使用公共基类；旧直接继承 FCUICompClass 或 CUIEditorUICompClass 的交互类保留 App 兼容，导入时仅转换类声明的父类。迁移不修改已保存源码。

公共模块现命名为 `CUIView.luau`；本仓库已验证导出包，新名称在外部 Toolkit 与 Studio 的实际导入仍需联调验证。

## 分辨率适配与自动翻译

普通页面默认 `ScreenAdaptation = true`；MainUI 可在类上设置 `ScreenAdaptation = false`，自行管理屏幕布局。公共类在 Ctor 中按开关启动适配，以 1280×720 为设计基准，取当前 ScreenGui 可用宽高比例的较小值，整体等比缩放并居中；大屏可放大，比例不同时留白。仅处理直属 GuiObject，不增加父级容器，保留节点查找路径；直属位置与尺寸中的 Scale/Offset 先按设计画布解析，子孙节点沿用内部布局。已有 UIScale 与设备比例相乘，避免重复缩放；尺寸变化和新增直属节点自动更新，移出节点与组件销毁时恢复设计值并清理监听。编辑器运行在固定 1280×720 画布，设备适配比例为 1。

UIEditor 生成的 ScreenGui 和全部 GuiObject 显式开启 AutoLocalize，布局与约束节点不写此属性；自动翻译由 Roblox 的游戏本地化表提供，App 不模拟翻译服务。

## 游戏业务继承

生成目录由编辑器管理。正式业务子类放在相邻的 `Client/UI`，不放入 Generated。编辑器接入脚本只用于模拟预览，不进入导入包或游戏目录。初始化顺序由业务入口显式管理；已有 Main.client.luau 和玩家组件列表不自动修改。

```lua
local FX = _G.FX
local FXLoader = FX.Loader
local Base = FXLoader:RequireFromParent(script, "Generated.COnlineRewardView")
local Business = FX.Class("COnlineRewardUICompClass", Base)

-- 数据和事件先就绪，再执行首次刷新。
function Business:OnReady()
    Business.Super.OnReady(self)
    self:BindUIData()
    self:Show()
end

-- 真实数据由游戏维护；动作回调应覆写 OnUIAction。
-- 业务 Ctor 需要先调用 Super.Ctor，再提供 Config 和 State。
return Business
```

`Main.client.luau` 在游戏框架初始化后 require 业务类，再由玩家对象 AddComponent。重生、真实数据订阅和协议处理仍由业务接入负责。每个界面仅导入交互基类，文件名使用实际类名，例如 `COnlineRewardView.luau`；接入源码保留在编辑器文档中。

## 校验与重复更新

导入拒绝同级重名、非法节点名、非整数 Offset、只有本地预览的图片和无效资源引用。UIEditor 导入对话框在提交前处理缺少 Roblox ID 的预览图；图片上传仍需用户显式发起，批量上传逐张等待成功并保存 ID。Scale/Offset 保留，颜色/向量转换为带类型的节点属性；渐变转换为 ColorSequence/NumberSequence；静态模型补齐 BorderSizePixel=0、IgnoreGuiInset=true、ResetOnSpawn=false。预览 Data URL 不导入 Roblox 包。

Toolkit 校验包结构、节点数量、深度和类继承关系；原生节点只投递到 StarterGui，脚本不嵌入节点包。生成类平铺在 Generated 下，`.uie-owners.json` 随 Git 保存文档归属；拒绝覆盖手工文件及其他文档类名。类改名只清理同文档拥有的生成文件，不自动迁移旧游戏目录或旧扩展名。

同名 ScreenGui 完整替换，旧对象保留用于撤销；非 ScreenGui 或多个匹配目标拒绝覆盖，其他 UI 保留。已导入文档保持根名稳定。同一界面在两个电脑同时导入仍会互相覆盖，源文件通过 Git 合并后由一人执行最终导入。

脚本先写入本机工程，UI 单独等待节点回执；节点成功时仍需检查并提交脚本草稿和保存地图。相同待完成包重发复用任务，旧回执不能完成新投递；尚未领取可取消，脚本保留。失败或取消不会撤销已写入脚本。

Toolkit 以文档 ID 识别导入归属，复制 JSON 后只改根名称会与原界面冲突。遇到根名称修改错误时，应另存为不同路径的独立文档，再导入；另存为当前路径不会重建身份。另存为身份规则见 [保存与加载](roblox-ui.md#保存与加载)。

## 验证

- `npx tsx --test tests/roblox-import.test.ts tests/toolkit.test.ts tests/script-templates.test.ts tests/runtime.test.ts`：转换、通信、公共类模板和 App 运行。
- `lua tests/ui-comp-scaling.luau`（在 Editor 目录，需要 Lua 5.4）：使用模拟引擎接口验证缩放、居中与清理，不代替 Studio 渲染。
- `npm run test:roblox-import`：隔离 Electron 对话框测试，不向实际后台或地图投递。
- Toolkit `pytest tests/roblox_sync tests/figma_roblox/test_studio_delivery.py -q`：原生节点构造、归属、回执、失败保留及共享插件回归。

这些检查不证明 Studio 实际显示、原生 Activated 行为或设备性能。实际导入与游戏业务接入需在目标地图验证。
