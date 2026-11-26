# 交互与模拟接入

## 节点和类

在 OnReady 中调用 FX.Loader:PlayerGui("ExampleUI") 获取当前 ScreenGui，用 FX.Loader:Here(root, "Panel.HintTxt") 相对查找子节点，也可用 PlayerGui("ExampleUI.Panel.HintTxt")。空路径或空段报错。WaitForChild 在 App 中找不到节点会立即报错。
App 提供有限的 FX.Class、模拟节点及固定的 [FXText 模块](../../roblox-localization/references/text-localization.md)。显隐、适配、Render 和接入类的职责见[展示与业务接入](presentation-contract.md)。

## 控制与诊断

- `uie.runtime.control({sessionId,revision,action="run"|"stop"|"reset"})`：返回 result.ok 和运行身份。reset 从运行开始快照重新构造。
- `uie.runtime.click({sessionId,revision,id})`：模拟按钮 Activated。返回 dispatched；hidden/disabled 按钮不分发。
- `uie.debug.get_diagnostics({cursor?,consoleCursor?})`：分别读取运行日志和 App 控制台的增量输出，返回最新游标及截断标记。
- `uie.debug.screenshot()`：切换到界面页后返回画布 PNG、实际尺寸及 zoom，不包含节点选择装饰。

普通日志、警告、动作及脚本错误显示在 App 输出面板。错误保留可用源码行号；语法错误允许保存，但运行失败。没有暂停状态、定时任务或 Instance.new。

## 模板条目克隆

运行时支持 `template:Clone()`、`node.Name = name`、`node.Parent = container`、`node:GetChildren()` 和 `node:Destroy()`，采用 Roblox 常用写法。Clone 复制完整子树、支持属性和图片信息，返回未挂载的独立副本；名称和 Visible 继承模板，事件连接不复制。隐藏模板的副本须显式设为可见，并重新连接按钮事件。按配置生成条目时，用稳定业务 ID 关联配置、状态和动作参数；不要以显示文字作为身份。

`Parent = nil` 暂时移出预览，保留属性和连接，可重新挂载。Destroy 递归移除并断开连接，重复调用无效果，销毁后不可重新挂载。文档根节点不能销毁或重新挂载。运行节点只存在于本次会话，停止和重置后不保留，也不写入设计文档、保存文件或撤销历史。使用 `uie.nodes.get/find` 的运行视图取得副本 ID，再通过 `uie.runtime.click` 测试副本按钮。

App 使用真实 Luau 和模拟节点，覆盖公开支持的属性与接口；常用交互源码在导入后使用 Roblox 原生节点方法。App 预览通过后，仍须分别验证 Studio 与设备显示。

## 鼠标测试

运行画布自动适应窗口，滚轮不会缩放或平移编辑画布。鼠标接口需要当前 sessionId/revision：

- `uie.runtime.hover({sessionId,revision,id})`：悬停；id=null 移出。
- `uie.runtime.scroll({sessionId,revision,id,to:{y:300}})`：定位 ScrollingFrame；也可使用 delta:{y:120} 测试滚轮路径，不能同时传 to/delta。单位为逻辑内容像素，自动限制范围。
- `uie.runtime.drag({sessionId,revision,id,from:{x:0.1,y:0.5},to:{x:0.9,y:0.5},steps:8,holdMs:350})`：起止点使用节点局部归一化坐标。holdMs 是按下到首次移动的模拟毫秒数，默认 0，执行时无需等待。移动端在列表道具上用 0 模拟轻划，用 350 模拟长按拖动。steps 为 1–32，批处理中的 drag 支持同样的参数。

在道具节点下添加启用的 UIDragDetector。DragStart、DragContinue、DragEnd 提供逻辑画布位置 Vector2。PC 默认按 Offset 移动，滚轮滚动时抓取点跟随指针。移动端沿可滚方向轻划会滚动；横向、向列表边界外轻划或按住至少 350 ms 后移动可拖动道具。取消或禁用时以画布外坐标结束拖动。

网格中让格子参与 UIGridLayout，道具挂在格子下。下面的 SlotA 和 SlotB 允许内容溢出；通过 ScreenGui.Parent（PlayerGui）查询命中节点，按格子身份放置。命中查询反映当前回调内的布局。PlayerGui 支持 Name、ClassName、IsA，其 Parent 为 nil。

```luau
function UI:OnReady()
    local screen = FX.Loader:PlayerGui("DragExample")
    local a, b = screen.Bag.SlotA, screen.Bag.SlotB
    local item = a.Item
    local detector = item.UIDragDetector
    local origin, oldZ
    self:TrackConnection(detector.DragStart:Connect(function()
        origin, oldZ = item.Position, item.Parent.ZIndex
        item.Parent.ZIndex = math.max(a.ZIndex, b.ZIndex) + 1
    end))
    self:TrackConnection(detector.DragEnd:Connect(function(p)
        local source = item.Parent
        source.ZIndex = oldZ
        for _, hit in ipairs(screen.Parent:GetGuiObjectsAtPosition(p.X, p.Y)) do
            if hit == a or hit == b then
                item.Parent = hit
                break
            end
        end
        item.Position = origin
    end))
end
```

节点支持 MouseEnter/MouseLeave/MouseMoved、MouseWheelForward/Backward、InputBegan/InputChanged/InputEnded 和 GetPropertyChangedSignal(property)。Input 回调提供鼠标 UserInputType、UserInputState、Position/Delta（X/Y/Z），位置为 1280×720 逻辑画布像素；仅实现有限鼠标数据，不是完整引擎 InputObject。滚动容器的默认滚动无须脚本；监听 CanvasPosition 可响应滚动变化。不支持键盘、文本输入和焦点事件。

批量验证优先使用 runtime.batch 的 hover/scroll/drag/click 和 assert，检查属性及 hovered/pressed/disabled。compact=true 保留顶层会话、运行身份、帧序号、动作参数及日志；成功断言只回传检查字段，失败步骤返回完整错误。诊断与步骤日志可能重叠。nodes.get/find(view=runtime) 和 get_diagnostics 返回 interaction.hoveredId/pressedId。按 ID 操作只核对显隐及禁用；遮挡需截图检查。reset 后重新获取克隆 ID。
