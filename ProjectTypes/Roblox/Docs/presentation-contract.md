# 展示与业务接入

## 类与数据职责

- source 返回继承 CUIView 的界面交互类：绑定节点、连接按钮、Render(state)
  更新展示、EmitUIAction(name, payload) 转发动作。模板原类名应适配新界面。
- integration 返回继承交互类的模拟接入类：Ctor 先调父构造，再准备 Config/State。
  模拟动作只改模拟数据；编辑器接入类不导入游戏。
- 游戏接入类继承导出的交互类，保存在 Generated 之外，提供真实配置、订阅与请求。
  游戏初始化完成后加载并创建组件；OnReady 先调父方法，再 BindUIData、Show。
  数据变化后更新 State，再 RefreshUI；异步数据先提供明确加载状态。
- 导入提供界面节点、公共基类与交互类，不自动生成完整游戏业务或修改游戏入口。

## 数据与虚方法

编写交互脚本时必读 [脚本数据契约示例](script-contract-example.md)，按其中的 source 契约注释
与 integration 配套方式组织代码，并替换为当前页面的真实字段。

每个界面必须在 source 的文件头或 Render 附近保留可随脚本导出的接入契约注释，不能只在
聊天、integration 示例或外部文档中说明。`@param state table` 不足以说明数据格式。
契约至少包含：

- Config/State 的完整嵌套结构：字段类型、含义、单位、必填/可选、可选字段缺省行为、
  枚举取值，以及列表/字典的键与配置 ID 的对应关系。没有默认值的必填字段明确说明。
- 数据来源与准备时机：RefreshUI 调用 Render(GetUIState())，默认读取 self.State；
  GetUIConfig 默认读取 self.Config。首次刷新前准备完整数据，后续由接入层更新再刷新。
  说明 Render 接受完整状态还是增量、加载/空列表如何处理；不声称框架自动补齐业务字段。
- 与该 View 实际消费字段一致的最小完整 Config/State 示例及初始化、刷新调用。
  模拟数据必须遵循同一契约；可选字段不必全部填写，但说明缺省后的显示。
- 动作名称、payload 字段类型及业务 ID 含义，必需/可选覆写及返回结构。
  数据字段或动作变化时同步更新注释与模拟接入，不能要求接入者反推 Render 的实现。

简单数值直接作为数据提供；
如重生界面的 level、requiredLevel、canRebirth、pending，不为每个字段增加虚方法。
项目查询和动作通过界面专用方法接入，不把奖励、背包等业务接口放进公共基类。

区分必需与可选覆写。必需方法在展示基类中明确报错，模拟类和游戏类分别实现；可选方法
提供可用默认实现。例如 GetRewardDisplay(reward) 返回 icon/name，FormatAmount(amount)
可默认 tostring。当前公共 OnUIAction 默认不处理；需要业务动作的界面应声明自己的必需
处理约定，不能把无响应当作接入成功。Luau 没有这里所说的编译期抽象方法检查。

动作携带稳定业务 ID，不用名称、图标或列表位置作为身份。领取资格和发奖属于游戏业务；
按钮禁用和进度条满值都不代替真实校验。请求的 pending、成功和失败由业务状态驱动。

## 动态展示

- 文字、图片、进度按属性更新，未接管属性保留设计值。奖励查询缺失时赋明确占位并报告，
  不保留上一次图标。App 动态 Roblox ID 对应本地图片的预览能力仍有缺口，需说明差异。
- Fill 左侧锚定，高度填满容器；宽度使用 UDim2.fromScale(ratio, 1)。target > 0 时
  ratio=math.clamp(current/target,0,1)，否则空条与占位；原始数据不被截断。
- 固定内容可直接绑定；可变列表克隆模板，按稳定 ID 更新和移除。Clone 不复制事件连接。
  点击读取当前条目，刷新不重复连接事件、不重建整个列表。
- 局部组件绑定给定子树，不查全局 PlayerGui；只删除自身创建的节点。外部克隆根由创建者
  负责删除，先清理组件再删除节点。当前没有内置 RewardView.Attach 等统一组件 API。
- 事件使用 TrackConnection；重复打开不累积连接，销毁后旧回调不改新实例。
  隐藏不等于销毁；动画、布局和数据刷新不能同时控制同一属性。

## 适配与当前边界

普通页面统一使用公共展示层的屏幕适配，不各自编写一套。当前公共基类以 1280×720
为设计基准等比居中，监听可用尺寸变化；App 固定画布比例为 1。局部子组件沿用父容器布局，
不重复整屏缩放。
MainUI 在类上设置 `UI.ScreenAdaptation = false` 后自行适配，避免叠加缩放。

公共模块加载导出、实时倒计时、复杂动画与 3D 展示尚非完整内置能力。
只使用当前 get_capabilities 和运行接口支持的功能；游戏侧的扩展需另行验证。

## 命名与资源清理

通用基类 CUIView；页面 CWelfareView；模拟 CWelfarePreview；游戏业务 CWelfareUICompClass。
后两者分别继承页面 View，业务类位于 Generated 之外。旧公共类名仅为兼容旧文档。
子组件或克隆条目用 `local release = self:TrackCleanup(function() row:Destroy() end)` 登记；
移除条目时调用 release，重复调用无副作用，页面 Dtor 只清理尚未释放的资源。
清理函数只删除自己拥有的节点；单个清理失败不阻止其他清理。覆写 Dtor 必须调用父类。
