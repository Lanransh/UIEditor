---
name: roblox-ui-authoring
description: 在 UIEditor 的 Roblox 工程中制作、修改和验证可编辑 UI，编写展示类与模拟接入，并交付游戏业务接入契约；视觉规则使用项目选定的风格。
---

# Roblox UI 制作

## 平台与风格

先读工作区 AGENTS.md。工程有 styles/Game-DESIGN.md 时读取它及其中的风格专项技能。
平台技能管理节点能力、代码和验证；风格技能管理视觉制作，不复制平台流程。

制作前读取 [制作接口](../../../Docs/editor-api.md)；编写交互时读取
[运行接口](../../../Docs/runtime-api.md)、[展示与业务接入](../../../Docs/presentation-contract.md)
[脚本数据契约示例](../../../Docs/script-contract-example.md) 和
[Luau 编码规范](../roblox-luau-standards/SKILL.md)。接口以当前 MCP 返回的能力为准。
涉及 UI 文本时同时使用 [本地化规范](../roblox-localization/SKILL.md)，
按其中规则处理文案归属、动态节点属性及交付验收；参数格式与预览边界见
[UI 文本与翻译接口](../../../Docs/text-localization.md)。

## 制作流程

1. 用 uie.editor.get_state 和 get_capabilities({detail:"summary"}) 确认当前会话与 API；
   操作节点前按需用 get_capabilities({className:"Frame"}) 读取相关类型约束。工作区根目录就是本工程；
   用 uie.project.list 与返回的工程身份核对当前工程，不猜测最近工程。身份不匹配时先纠正。
2. 用 uie.document.list({library:"templates"}) 列出工程模板，按 nextOffset 翻页。
   用返回的 UUID 构造 target={library:"templates",documentId:...}，读取 nodes.get/find、
   scripts.get 和 debug.screenshot；这些只读查询不切换当前画布。模板为空时不假装已复用。
   只有用户明确要求或同意修改模板，才通过 document.open({target,mode:"edit",sessionId,revision})
   编辑原件；普通制作不覆盖模板。风格规范路径从 get_state.gameDesignPath 取得，使用文件工具读取。
3. 按用途选择匹配模板，保留风格规定的视觉结构，仅调整需求内容。模板节点 ID 不用于修改
   当前界面；通过 document.new 与 code.execute 的制作 API 创建新设计节点及新 ID。
   修改已有界面先读浅层树定位目标，再按 id/parentId 查询相关节点；JSON 查询优先 compact=true，
   按截断提示与 nextOffset 补查。scripts.get 按需指定 kind，已取得且未变更的结果不重复打印。
   保留稳定节点 ID 和任务外内容。布局单位明确为 Scale/Offset。
   本地图片先用 uie.assets.search 查询复用；缺少时通过 uie.assets.import 将绝对路径文件导入
   项目图片库（library="project"，不上传，Roblox ID 保持空白），再重读会话并在 code.execute
   中用 ui.assets.apply(nodeId,assetId) 绑定。节点不支持 previewImage 或 setPreviewImage，本地预览从图片库查找，图片数据不嵌入 UI。
   同一素材复用同一资产 ID；应用已有节点时保留位置、尺寸、层级及原有样式。
   游戏数据决定的动态图可先使用占位图；静态图缺少资源时也使用占位图（如重生图标）。
   保留可替换的图片节点，具体遵循业务接入参考的贴图与占位图约定。
4. 已保存界面的交互与模拟接入代码优先通过文件工具直接读写同目录
   `<名称>.view.luau` 与 `<名称>.example.luau`；不把源码放进 UI JSON。
   文件编辑后通过运行或重新打开读取更新；如 App 与文件两侧都有修改，处理冲突再继续。
   code.execute、scripts.set 等 MCP 写操作携带最新 sessionId/revision；冲突后重读。
   事务整体进入 App 撤销历史，MCP 没有 undo/redo。制作 VM 不读文件，不编造 API。
5. 静态视觉保存在设计节点中；source 负责展示与交互，integration 提供模拟业务。
   可变列表的原型集中放在界面内隐藏的 Templates 下，由 source 在运行时克隆到显示容器，
   按稳定业务 ID 更新与清理；具体遵循业务接入参考的 Templates 与运行时克隆约定。
   仅属性变化时直接更新已有节点；普通页面不重复编写通用屏幕适配。
   普通窗口通过 Show/Hide 开关，CUIView 默认接入整页动画，不重复调用 SetOpenAnimation 或编写 Tween。
   常驻 HUD/MainUI 在 source 交互类设置 OpenAnimation = false，并注释说明不启用整页缩放、模糊和相机效果。
   ScreenAdaptation 默认 true，控制 1280×720 等比居中适配；仅界面自行管理设备布局时设为 false 并注释原因。
   两个开关独立，在类上定义、实例创建前生效，不在 OnReady/Render 切换。Render 不提前隐藏窗口主体。
   具体职责与示例遵循展示与业务接入的「通用打开与关闭动画」合同；App 不验证游戏相机动画。
   在 source 中写入可随导出保留的 Config/State 与动作契约注释，具体要求见业务接入参考。

## 验证与交付

- 用 runtime.control/click 验证需求涉及的状态、按钮、禁用、关闭、重置及动态条目身份。
  克隆列表还需检查增删、排序与重复刷新，确认模板隐藏、点击 ID 正确、事件不重复。
  有 runtime.batch 时优先 compact=true 合并顺序步骤，检查每步结果和实际属性，不只检查调用成功。
  批次失败不自动停止运行，先取证再显式 stop 修复；不盲重试会话冲突。
- 用 debug.get_diagnostics 检查错误；批次已返回诊断且无异常时不重复读取同一份。
- 检查动态文本保存重开后为空，运行首次显示、数据变化与缺失时无假占位或旧值残留，空文本不使布局塌缩。
- 交付前必须执行本地化技能的「交付前文本验收」：按职责覆盖全部文本节点，运行其只读脚本，
  修复失败项并重验，再完成运行态检查；未执行或失败不得报告文本验收通过。
- 截图检查设计态及确有视觉差异的关键运行态，结合风格专项检查验证布局、文字、
  图片和层级。属性断言不能替代截图；没有参考截图时只称属性核对。
- 停止后通过 document.save 保存项目 UI；经授权编辑模板时不传路径，保存回当前模板原件。再 document.open 重开核对
  节点、图片、文字与脚本。切换脏文档前保存，不静默丢弃或覆盖其他文件。
- 交付列明占位图节点、用途及动态/静态替换方式。
- 交付说明模板来源、保存位置、视觉差异、实际检查，以及 Config/State、必需与可选
  覆写方法、动作参数和初始化顺序。Studio/设备和真实业务接入未验证时明确说明。

## UI 改名后的代码检查

修改界面名称并保存后，App 会联动改名独立目录、UI JSON、view 和 example 文件，保留 UI/节点 ID 和脚本原文。先重新读取 get_state 的 relativePath，使用新路径；不要另存一份来代替改名。
App 不自动替换 Luau 类名。用户需要代码名称跟随 UI 改名时，由 AI 先读取两份源码，确认实际 FX.Class 声明、局部变量、返回值和继承关系，再按语义修改 View 与模拟接入类及全部相互引用；不要对整个工作区做字符串全局替换。
标准新建类名可参考 scriptClassNames 约定，例如 OnlineRewardUI 对应 COnlineRewardView 和 COnlineRewardPreview；example 是文件职责命名，不强制将现有 Preview 类改为 Example。保留自定义父类、业务标识和任务外内容。
ScreenGui 节点名称与 UI 文档名称是不同字段，只有需求涉及它时才调整，并同步检查 FXLoader:PlayerGui、Here 路径及导出接入引用。完成后通过 Run、日志和动作验证两份源码的继承与运行，确认 Roblox 导出仅保留 View；App 测试不代表游戏业务和设备验证通过。
