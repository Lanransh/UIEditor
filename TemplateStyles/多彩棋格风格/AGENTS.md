# 当前项目的游戏 UI 制作助手

本项目使用项目内保存的多彩棋格风格，采用鲜明的多彩游戏配色。交付物是当前项目中可继续编辑、
可保存、可重开的 UIEditor Roblox 界面，不是 Figma 稿或整窗图片。
制作前必须读取 [Game-DESIGN.md](Game-DESIGN.md) 和
[制作与自检技能](.agents/skills/ui-editor-style-check/SKILL.md)。
通用提示词、设计规范、相关模板都在本项目；不依赖全局工作区或来源游戏工程。

## 参考与自动选择

- 根据用途、内容规模和操作语义自行选择窗口与组件，不要求用户每次指定参考。
  小型确认使用小窗口，常规功能使用中窗口，列表与详情多区使用大窗口；
  优先选能容纳内容的最小合适档位。具体映射以 Game-DESIGN 和实际模板为准。
- 必须实际读取 `../template-references/` 下相关 JSON 的节点结构和关键属性，
  不能只看文件名、旧截图或凭记忆声称沿用了模板。
  文件名、document.name、根节点和内部节点名可能不同，不相互替代。
- 沿用本风格的字体、字号、加粗、配色、描边、圆角、Stud 平铺、
  高光与压边；默认不是自由设计另一套视觉风格。
  不混用其他风格，不用通用蓝色窗口、签到示例替代项目模板。
- 带独立贴边高光、底部压边的按钮，无隐藏溢出内容需求时使用
  `ClipsDescendants=false`，避免 Roblox 缩小预览出现亮缝；
  不把 UICorner 当作子节点圆角裁剪，不一律关闭所有容器的裁剪。
- 标题不固定红色，模板默认红色；按界面主题选择规范中的红、橙、黄、绿、
  蓝、青、紫或粉色，同步调整压边色。按钮保持原有语义色。
  标题、按钮和进度文字使用白字描边，不替换为马卡龙浅色或降低整窗透明度。
  “棋格”是风格名，仍保留现有 Stud 平铺纹理，不另造棋盘格贴图。
- 优先完整复用匹配窗口；窗口已有标题和关闭组件时不重复叠加。
  独立组件只复制实际组件子树，不复制白色展示背景、说明文字及无关展示容器。
- 模板已移除全画布展示背景。制作时禁止添加 `BackgroundImg` 或改名后的同类
  全画布背景，不为预览补白色底板；窗口与组件自身的底板正常保留。
- 多个用途相近的同风格模板自行选择并说明依据。模板损坏、访问受限、
  关键需求不明或确实没有合适参考时说明问题；不得静默换主题或伪称已读取。

## MCP 工作流程

1. 确认用户任务指向当前项目。读取 `uie.editor.get_state` 和
   `uie.editor.get_capabilities`，确认会话、revision、语言及支持的节点属性。
   `get_state` 不提供项目绝对路径；工作目录为本 AgentWorkspace 时，
   工程是父目录 UIEditorWorkspace，不得猜测另一个最近工程。
   无法确认位置时只询问工程位置，不把选择模板的工作退给用户。
2. 制作前简要说明所选模板、保留结构和必要调整。通过只读文件工具读取
   本项目模板、嵌入预览资源及规范；不跟随符号链接。
   `uie.document.list/open` 只访问 interfaces，`uie.assets.search/get`
   查询图片资产，不是模板查询接口；不要编造模板 MCP 接口。
3. 通过 `uie.document.new` 新建项目UI，用 `uie.code.execute` 的制作 API
   重建所需模板子树与属性，并生成新节点 ID。
   允许必要的 Luau 制作代码、交互代码和模拟接入代码。
   用 TextLabel、TextButton、ImageButton 等实际支持的 Roblox 类型，
   不套用 Figma 纯设计/禁止代码/三类引擎节点限制。
4. 改已有界面时用 `uie.nodes.find/get` 找稳定 ID，保留任务外内容。
   写操作携带刚取得的 sessionId/revision；冲突后重新读取，不能盲重试。
   一次 code.execute 的改动整笔提交，用户可在 App 内撤销重做；
   MCP 和制作 VM 没有 undo/redo 接口。
5. 用 `uie.scripts.get/set` 管理 source 交互类与 integration 模拟接入类。
   新交互类继承 `CUIEditorUICompClass`，模拟接入继承新交互类；
   来源模板中的旧类名/空演示代码不是业务逻辑，不能原样绑定到新 UI。
   用 `FX.Loader:PlayerGui("实际根名")` 和 `Here(root, "点分隔路径")`
   定位节点，业务动作携带稳定业务 ID，不通过展示文字定位业务。
6. `uie.runtime.control` 运行/停止/重置，`uie.runtime.click` 验证点击、
   禁用、关闭和需求涉及的状态，读取 `uie.debug.get_diagnostics`。
   运行中不能修改设计；停止后修正。模拟值驱动进度，不创建多档静态重复模板。
7. 用 `uie.debug.screenshot` 检查布局、文本、标题、关闭组件、按钮语义色、
   纹理与层级，逐项对照已读模板属性。只有确实取得参考图时才称截图对比；
   字体或效果不能完全表达时使用支持的可编辑替代并说明差异。
8. 用 `uie.document.save` 保存到 interfaces 内的相对路径（不带 interfaces
   前缀），再 `uie.document.open` 重开核对文本、节点、图片及脚本。
   新路径独占创建，不直接覆盖他人文件。切换脏文档前先保存；
   只有用户明确允许丢弃时才传 discardChanges。

## 制作 API 提要

能力以当前 MCP 返回为准。制作 VM 无文件、网络、require、Electron 或 game；
只读模板发生在 VM 外，界面制作与保存必须通过 `ui-editor` MCP。

- `ui.nodes.create(className, {parentId, name, properties, previewImage})`
  返回节点快照，用其 id 作为子节点 parentId。
- `ui.nodes.setProperties(id, properties)` 更新指定属性；
  `rename/reparent/remove/duplicate` 只操作当前文档节点。
- `ui.nodes.setPreviewImage(id, {name, dataUrl})` 设置嵌入预览图；
  `Image` 仍单独保存真实 Roblox ID。不要传本机文件路径作为图片属性。
- 位置尺寸用 `UDim2.fromOffset` / `UDim2.fromScale` 或明确的 Scale/Offset；
  保留原模板 AnchorPoint、ZIndex 和子节点顺序；裁剪按 Game-DESIGN 的
  “裁剪与缩放亮缝”规则判断，不机械沿用模板的 ClipsDescendants。
- `ui.scripts.get/set` 可在同一制作事务中调整脚本。
  source 管动作和展示，integration 管临时配置和模拟状态，视觉节点保存于设计态。

Luau 用四空格缩进，运算符两侧留空格，展开分支与回调；函数注释说明意图、
准确的参数和返回值。不引入业务框架、来源工程绝对路径或无关演示脚本。

## 修改范围、安全与交付

模板原件、规范、资源和 skills 是项目独立副本。未经明确要求不改模板原件，
不回写全局库或其他工程，不直接写工程 JSON、project.json 或运行数据。
可调整业务文案、条目数、图标、必要尺寸、布局及需求交互；保留组件视觉语言。
所有基础视觉和普通文本可编辑，不整窗图片化，不逐个创建 Stud 凸点。

App 运行是模拟：UI 状态、支付按钮、领取按钮均不能作为真实资格校验、
支付或发奖依据。真实业务负责校验、动作结果和数据更新；
导入生成代码与业务代码分离，不覆盖业务文件。

完成时列出所选模板及实际节点、保留样式、必要差异、保存位置、
测试动作、截图检查和保存重开结果；未运行的检查、Studio 与设备验收
必须标为未验证，不能以模拟成功代替真实游戏安全或显示验证。
