# 交互与模拟接入

文档 scripts.source 返回交互类，scripts.integration 返回继承交互类的模拟接入类。两份源码通过制作 API 写入；App 内运行，不是实际游戏接入。

交互类继承 CUIView：OnReady 先用 `local root = FX.Loader:PlayerGui("ExampleUI")` 获取实际命名的 ScreenGui，再用 `FX.Loader:Here(root, "Panel.HintTxt")` 查子节点。也可直接调用 `FX.Loader:PlayerGui("ExampleUI.Panel.HintTxt")`。PlayerGui 仅模拟当前文档的界面；Here 从指定节点的子节点开始，PlayerGui 从界面名开始。只接受 `.` 分隔，斜杠、空路径和空段报错。生成代码不通过 GetRootNode 获取节点。TrackConnection 管理 Activated:Connect；Render(state) 更新支持属性；EmitUIAction(name,payload) 交给接入类。

接入类 Ctor 先调用 Super.Ctor，在自身 Config/State 定义模拟数据；OnUIAction 修改状态并 RefreshUI。App 支持有限 FX.Class，不包含完整游戏框架。停止统一清理连接。

- `uie.runtime.control({sessionId,revision,action="run"|"stop"|"reset"})`：返回 result.ok 和运行身份。reset 从运行开始快照重新构造。
- `uie.runtime.click({sessionId,revision,id})`：模拟按钮 Activated。返回 dispatched；hidden/disabled 按钮不分发。
- `uie.debug.get_diagnostics({cursor?,consoleCursor?})`：分别读取运行日志和 App 控制台的增量输出，返回最新游标及截断标记。
- `uie.debug.screenshot()`：切换到界面页后返回画布 PNG、实际尺寸及 zoom，不包含节点选择装饰。

普通日志、警告、动作及脚本错误显示在 App 输出面板。错误保留可用源码行号；语法错误允许保存，但运行失败。没有暂停状态、定时任务或 Instance.new。

## 模板条目克隆

运行时支持 `template:Clone()`、`node.Name = name`、`node.Parent = container`、`node:GetChildren()` 和 `node:Destroy()`，采用 Roblox 常用写法。Clone 复制完整子树、支持属性和图片信息，返回未挂载的独立副本；名称和 Visible 继承模板，事件连接不复制。隐藏模板的副本须显式设为可见，并重新连接按钮事件。按配置生成条目时，用稳定业务 ID 关联配置、状态和动作参数；不要以显示文字作为身份。

`Parent = nil` 暂时移出预览，保留属性和连接，可重新挂载。Destroy 递归移除并断开连接，重复调用无效果，销毁后不可重新挂载。文档根节点不能销毁或重新挂载。运行节点只存在于本次会话，停止和重置后不保留，也不写入设计文档、保存文件或撤销历史。使用 `uie.nodes.get/find` 的运行视图取得副本 ID，再通过 `uie.runtime.click` 测试副本按钮。

App 使用真实 Luau 和模拟节点，覆盖公开支持的属性与接口；常用交互源码在导入后使用 Roblox 原生节点方法。没有完整引擎服务；WaitForChild 缺失时立即报错，不等待。App 预览通过后，仍须分别验证 Studio 与设备显示。
