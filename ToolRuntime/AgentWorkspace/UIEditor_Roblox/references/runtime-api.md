# 交互与模拟接入

文档 scripts.source 返回交互类，scripts.integration 返回继承交互类的模拟接入类。两份源码通过制作 API 写入；App 内运行，不是实际游戏接入。

交互类继承 FCUICompClass：OnReady 用 FX.Loader:Here(self:GetRootNode(), "父/子") 查节点，并用 TrackConnection 管理 Activated:Connect；Render(state) 更新支持属性；EmitUIAction(name,payload) 交给接入类。

接入类 Ctor 先调用 Super.Ctor，在自身 Config/State 定义模拟数据；OnUIAction 修改状态并 RefreshUI。App 支持有限 FX.Class，不包含完整游戏框架。停止统一清理连接。

- `uie.runtime.control({sessionId,revision,action="run"|"stop"|"reset"})`：返回 result.ok 和运行身份。reset 从运行开始快照重新构造。
- `uie.runtime.click({sessionId,revision,id})`：模拟按钮 Activated。返回 dispatched；hidden/disabled 按钮不分发。
- `uie.debug.get_diagnostics({cursor?,consoleCursor?})`：分别读取运行日志和 App 控制台的增量输出，返回最新游标及截断标记。
- `uie.debug.screenshot()`：切换到界面页后返回画布 PNG、实际尺寸及 zoom，不包含节点选择装饰。

普通日志、警告、动作及脚本错误显示在 App 输出面板。错误保留可用源码行号；语法错误允许保存，但运行失败。没有暂停状态、定时任务或动态运行节点创建。
