# 脚本数据契约示例

编写或修改交互脚本时，按此例的组织方式交付 source 与 integration。字段由实际页面决定，
不要把 RewardState 或福利字段当成所有界面的公共结构。先确定页面所需数据，再写契约、
Render 和模拟数据；三者必须一致。注释中的类型名用于阅读，不代表自动类型或运行时校验。
source 契约只描述游戏项目能取得的导出内容及接入责任，不出现 Preview/example、
模拟类或模拟专用字段。下文 integration 是编辑器内部制作示例，不属于导出的接入契约。

## source：契约必须在交互脚本里

此例使用已设计好的节点，不创建 UI。前提节点树：RewardUI（ScreenGui）下的 Panel 包含
TitleTxt（TextLabel）、StatusTxt（TextLabel）、ClaimBtn（TextButton）。实际制作时先查询
节点树，替换类名、路径和业务字段，保留所用风格的按钮展示方式。

```lua
--[[
单条奖励接入契约

职责边界：
  展示类：绑定节点和领取事件，更新标题、状态文字及按钮可点击性。
  游戏接入：提供真实配置与状态，处理请求、资格校验和权威结果。
  游戏接入不重绑领取事件，不覆写 Render 或再次设置上述节点属性。
  展示缺陷或契约不能满足需求时反馈 UIEditor，不在项目中补丁绕过。

Config（RewardConfig）：
  entryId: string，必填，稳定的奖励条目业务 ID，无默认值；不是物品 ID。
  title: string，必填，标题，无默认值。

State（RewardState，Render 的完整输入，不是增量）：
  status: string，必填，无默认值；只允许 Locked / Claimable / Claimed，
          分别表示未满足条件 / 可领取 / 已领取，由接入层提供。
  pending: boolean，可选，省略按 false 处理；请求期间禁用领取。
  error: string，可选，省略为 nil；失败提示原文，非 pending 时优先显示。

初始化与刷新：
  GetUIConfig() 默认读取 self.Config；GetUIState() 默认读取 self.State。
  RefreshUI() 调用 Render(GetUIState())，不合并补丁、不填充业务字段。
  接入 OnReady 先调用父 OnReady 绑定节点，再 BindUIData()、Show()。
  后续更新 self.State 后调用 self:RefreshUI()；Render 只读数据、更新显示。
  本例没有列表或加载态；首次刷新前须备齐数据，异步未就绪时不调用 Show。

展示与交互规则：
  状态文字优先级：pending > error > status。
  pending：显示“领取中”。
  error：显示失败提示；不自动改变领取资格。
  Locked：显示“尚未满足条件”，不允许点击，也不发送解释原因的动作。
  Claimable：显示“可领取”，仅非 pending 时允许点击并发送 Claim。
  Claimed：显示“已领取”，不允许点击。
  本例不动态改按钮颜色，也无其他输入事件。

动作：
  action = "Claim"。
  payload.entryId: string，必填，与 Config.entryId 相同的稳定奖励条目业务 ID。
  真实接入负责资格校验和请求：请求前 pending=true、error=nil 并刷新；
  成功后 pending=false、status="Claimed"；失败后 pending=false、error=提示，
  并按业务结果保留或更新 status。每次状态更新后刷新。

接口实现清单：
  必须实现的页面接口：
    OnUIAction(action: string, payload: table) -> 无返回值。
    由继承的 EmitUIAction 在点击时调用；仅支持上述 Claim 与 entryId。
    负责请求与结果处理，不调用父 OnUIAction（父实现会报未接入错误）。
  项目生命周期与数据接入：
    Ctor(owner: table) -> 无返回值。
    组件创建时调用；若在此准备依赖和数据，必须先调用父 Ctor(self, owner)。
    OnReady() -> 无返回值。
    本例接入类必须实现；宿主初始化时调用，先父 OnReady，再 BindUIData、Show。
    BindUIData() -> 无返回值。
    本例需要跟随真实奖励数据变化时覆写；由上述接入 OnReady 调用一次。
    覆写后负责读取首次状态、刷新和订阅；无需再调只刷新一次的父实现。
    Dtor() -> 无返回值。
    仅有未托管的订阅或请求等资源时覆写；组件销毁时先释放自身资源，再调父 Dtor。
    已由 TrackConnection/TrackCleanup 托管的资源交父类清理，不重复释放。
  可选页面专用覆写：无。
  继承无需重写：
    GetUIConfig() -> RewardConfig，供展示层读取 self.Config。
    GetUIState() -> RewardState，供 RefreshUI 读取 self.State。
    OnShow() -> 无返回值，本页面已在显示时刷新，项目不重复实现。
  项目仅调用，不重写：
    RefreshUI() -> 无返回值；项目更新完整状态后调用。
    Show() / Hide() -> 无返回值；由项目业务入口决定何时打开或关闭。
    TrackConnection(connection: RBXScriptConnection) -> RBXScriptConnection。
    项目建立订阅后调用以托管连接；返回传入的同一连接。
  展示层内部，不得覆盖：
    Render、EmitUIAction、SetButtonEnabled 及已有节点/事件绑定逻辑。

项目接入步骤：
  1. 在 Generated 外创建继承 CRewardView 的游戏类，初始化完成后加载，
     在客户端玩家对象创建前 require，并只挂载游戏子类。
  2. 准备真实奖励数据与请求依赖；先父构造，再提供完整 Config 和首次 State。
     status 来自权威奖励数据；尚未就绪不 Show，不伪造 Claimable 充当真实资格。
  3. OnReady 先让父类绑定节点，再调用项目 BindUIData，最后 Show。
     BindUIData 读取最新完整状态并刷新，只建立一次数据订阅并托管连接；
     Show 触发已继承的 OnShow 刷新，不需要项目再写 OnShow。
  4. 数据订阅收到更新后转换并写入完整 State，再 RefreshUI；
     请求进行中保留本次 pending，不因覆盖业务快照丢失防重状态。
  5. 收到 Claim 时核对 entryId，拦截重复请求，设置 pending=true、清 error 并刷新，
     再向项目真实服务端发送稳定奖励 ID；服务端校验资格并发奖。
     成功时采用权威结果更新 status；失败时按权威结果保留或更新 status，并设置 error。
     两条路径均清 pending 并刷新，不在客户端直接认定发奖成功。
  6. 业务入口调用 Hide 关闭；本例隐藏后保留订阅，再次 Show 由父行为显示最新状态。
     关闭不等于销毁，不在重开时重复订阅或绑定按钮。
  7. 销毁时释放未托管资源，取消请求或阻止已过期回调更新本实例；
     父 Dtor 清理已托管连接和展示资源。项目不删除继承层拥有的节点。
  本例未指定真实服务或协议名，需按项目现有接口接入，不存在内置奖励服务 API。

最小完整数据示例（在接入 Ctor 调用父构造之后准备）：
  self.Config = {
      entryId = "online_5",
      title = "在线 5 分钟奖励",
  }
  self.State = {
      status = "Claimable",
      pending = false,
  }
]]
local FX = _G.FX
local FXLoader = FX.Loader
local CRewardView = FX.Class("CRewardView", "CUIView")

-- 绑定已有节点与按钮事件；刷新时不重复连接。
function CRewardView:OnReady()
    local root = FXLoader:PlayerGui("RewardUI")
    self.TitleTxt = FXLoader:Here(root, "Panel.TitleTxt")
    self.StatusTxt = FXLoader:Here(root, "Panel.StatusTxt")
    self.ClaimBtn = FXLoader:Here(root, "Panel.ClaimBtn")
    -- 点击时读取当前条目 ID，交给接入层处理。
    self:TrackConnection(self.ClaimBtn.Activated:Connect(function()
        self:EmitUIAction("Claim", { entryId = self:GetUIConfig().entryId })
    end))
end

-- 打开时读取最新状态，不重新绑定事件。
function CRewardView:OnShow()
    self:RefreshUI()
end

-- 根据完整展示状态刷新；字段定义与数据样例见文件头 RewardState。
-- @param state table RewardState；status 必填，pending/error 可选
function CRewardView:Render(state)
    self.TitleTxt.Text = self:GetUIConfig().title
    local statusText = ""
    if state.pending then
        statusText = "领取中"
    elseif state.error then
        statusText = state.error
    elseif state.status == "Locked" then
        statusText = "尚未满足条件"
    elseif state.status == "Claimable" then
        statusText = "可领取"
    elseif state.status == "Claimed" then
        statusText = "已领取"
    else
        error("Unknown reward status: " .. tostring(state.status))
    end
    self.StatusTxt.Text = statusText
    self:SetButtonEnabled(self.ClaimBtn, state.status == "Claimable" and not state.pending)
end

-- 由游戏接入覆写，不在展示层执行业务。
-- @param action string 本页面仅发送 Claim
-- @param payload table { entryId: string }，稳定条目 ID
function CRewardView:OnUIAction(action, payload)
    error("Reward integration must implement OnUIAction")
end

return CRewardView
```

## integration：用同一份契约提供模拟数据

```lua
local FX = _G.FX
local CRewardPreview = FX.Class("CRewardPreview", "CRewardView")

-- 父构造完成后准备符合 View 契约的模拟数据。
-- @param owner table 编辑器组件宿主
function CRewardPreview:Ctor(owner)
    CRewardPreview.Super.Ctor(self, owner)
    self.Config = {
        entryId = "online_5",
        title = "在线 5 分钟奖励",
    }
    self.State = {
        status = "Claimable",
        pending = false,
    }
end

-- 父方法先绑定节点，然后执行初始刷新并显示。
function CRewardPreview:OnReady()
    CRewardPreview.Super.OnReady(self)
    self:BindUIData()
    self:Show()
end

-- 模拟立即成功；重复领取与请求中状态不会再次处理。
-- @param action string 本页面仅支持 Claim
-- @param payload table { entryId: string }，须与当前配置一致
function CRewardPreview:OnUIAction(action, payload)
    assert(action == "Claim", "Unsupported reward action: " .. tostring(action))
    assert(payload.entryId == self.Config.entryId, "Unknown reward entry")
    if self.State.status ~= "Claimable" or self.State.pending then
        return
    end
    self.State.status = "Claimed"
    self.State.error = nil
    self:RefreshUI()
end

return CRewardPreview
```

本模拟立即成功，不模拟网络等待或失败。验证其他显示时，在模拟接入中分别提供 Locked、
Claimable、Claimed、pending=true、error="领取失败，请重试"，再刷新检查文字与按钮。
游戏接入继承 CRewardView，按文件头契约连接真实业务；不把 Preview 作为游戏接入导出。

## 嵌套状态怎样写清楚

若实际页面使用福利列表，不能只把参数改成 `@param state table entries`。应展开到叶子字段，
例如以下注释格式，并附与实际 Config 匹配的完整数据样例：

```lua
-- State.entries: table，必填；按 kind，再按条目 id 索引的字典，不是数组。
-- entries[kind]: table，每个配置分组必填；kind 为 online/signin/task。
-- entries[kind][id]: table，每个配置条目必填；id = Config.groups 中对应 items 的 id。
-- entries[kind][id].status: string，必填；Locked / Claimable / Claimed，无默认值。
-- entries[kind][id].current: number，task 必填；单位与 config.target 相同，无默认值。
-- entries[kind][id].pending: boolean，可选；省略按 false 处理。
-- 无条目分组使用 {}；缺少配置要求的分组或条目报错，不默认当作 Locked。
```

这是嵌套字段说明的片段，不是完整福利契约；实际使用的其他字段也必须写明。

## AI 交付前核对

- 契约分节、空行、字段换行和嵌套缩进清晰，最小样例不是压缩的一行 table。
- source 契约和接口注释不包含未导出的脚本、类名、模拟流程或模拟专用字段。
- 项目与展示层职责、状态优先级、点击许可及允许的覆写入口均明确，不依赖项目二次覆盖。
- 接口清单明确必需、条件覆写、继承、仅调用及禁止覆盖的分类，参数、返回值、时机和 Super 顺序齐全。
- 项目步骤逐项对应实际数据、动作、请求及清理，不把模拟实现当作真实业务接入。
- 接入者只读 source，就能写出完整 Config/State、知道何时刷新及如何处理动作。
- Render 和它调用的方法读取的所有业务字段均有说明；可选字段的实际行为符合注释。
- 示例 ID、字典键、动作参数相互对应；模拟类遵循同一契约。
- 修改字段或行为时，同时更新 source 契约、数据样例和 integration；不只改函数参数注释。
