# Roblox 一次性导入

## 使用流程

在 StudioGameToolkit 打开包含 `Game/default.project.json` 的目标工程，在项目设置填写 PlaceId；Studio 打开同一地图，使用更新后的 Toolkit 插件。UIEditor 的「文件 → 导入 Roblox」选择工程，提交当前编辑快照，不要求先保存。导入不写入文档历史，也不使用运行副本。

UIEditor 主进程连接固定本机桥接 `127.0.0.1:34871`。工程令牌只留在主进程，渲染进程只得到工程名称、ID 和 PlaceId。更新 Toolkit 后需重启后台；Toolkit 自动更新插件后需重新打开 Studio。

## 导入结果

- 静态模型一次性插入 `StarterGui.<实际根名>`；保留节点名称、层级、属性与稳定 ID。
- 生成类写入游戏 `Game/StarterPlayer/StarterPlayerScripts/Client/UI/Generated/`，同时与 UI 一起投递到 Studio，在同一撤销事务中导入；首次须先同步游戏 Client/UI 目录。
- 数据与动作接口由一个公共中间基类承担：

```text
Generated/
  CUIEditorUICompClass.lua                 # 继承 FCUICompClass
  COnlineRewardUIBaseCompClass.lua         # 继承公共基类
```

类文件按源码中的实际类名命名，不从可改的文档显示名猜测。界面交互类附加 ScreenGuiName 元数据供公共基类查找 PlayerGui；公共基类提供组件名、根节点、配置、状态、刷新、动作转发与原生按钮禁用。连接清理、Show/Hide 仍继承游戏 FCUICompClass。App 注册同名公共类模拟相同合同，不载入完整游戏框架。

新文档使用公共基类；旧直接继承 FCUICompClass 的交互类保留 App 兼容，导入时仅转换类声明的父类。迁移不修改已保存源码。

## 游戏业务继承

生成目录由编辑器管理。正式业务子类放在相邻的 `Client/UI`，不放入 Generated。编辑器接入脚本只用于模拟预览，不进入导入包或游戏目录。初始化顺序由业务入口显式管理；已有 Main.client.lua 和玩家组件列表不自动修改。

```lua
local FX = _G.FX
local FXLoader = FX.Loader
local Base = FXLoader:RequireFromParent(script, "Generated.COnlineRewardUIBaseCompClass")
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

`Main.client.lua` 在游戏框架初始化后 require 业务类，再由玩家对象 AddComponent。重生、真实数据订阅和协议处理仍由业务接入负责。每个界面仅导入交互基类，文件名使用实际类名，例如 `COnlineRewardUIBaseCompClass.lua`；接入源码保留在编辑器文档中。

## 校验与重复更新

导入拒绝同级重名、非法节点名、非整数 Offset、只有本地预览的图片和无效资源引用。Scale/Offset 保留，颜色/向量转换为 Rojo 类型；渐变转换为 ColorSequence/NumberSequence；静态模型补齐 BorderSizePixel=0、IgnoreGuiInset=true、ResetOnSpawn=false。预览 Data URL 不导入，不自动上传图片。

Toolkit 校验包结构、节点数量与深度、类继承关系和目标映射，再构建 UI 与类模块。交互模块直接平铺在 Generated 下，以模块元数据记录文档归属。脚本只更新同一文档的生成模块，保留其他界面和手工文件；重新导入会迁移旧界面子目录并移除旧模拟模块，旧目录中存在手工文件时拒绝迁移；不同界面不能使用重复类名；不覆盖游戏框架、业务类或入口。同名 UI 如果仍由游戏 Rojo 管理则阻止投递；StarterGui 必须保留未知实例。已有文档导入后保持根名稳定。

脚本先写入工程，UI 与生成类一起等待 Studio 回执；失败信息明确区分构建与投递。相同待完成包重发复用任务，旧回执不能完成新投递。连接变化后可刷新连接、重新投递；尚未领取的任务可取消等待，已生成脚本保留。只有 Studio 回执成功显示完成，用户仍需保存场景。

## 验证

- `npx tsx --test tests/roblox-import.test.ts tests/toolkit.test.ts tests/script-templates.test.ts tests/runtime.test.ts`：转换、通信、公共类模板和 App 运行。
- `npm run test:roblox-import`：隔离 Electron 对话框测试，不向实际后台或地图投递。
- Toolkit `pytest tests/roblox_sync tests/figma_roblox/test_studio_delivery.py -q`：真实 Rojo 构建、归属、回执、失败保留及共享插件回归。

这些检查不证明 Studio 实际显示、原生 Activated 行为或设备性能。实际导入与游戏业务接入需在目标地图验证。
