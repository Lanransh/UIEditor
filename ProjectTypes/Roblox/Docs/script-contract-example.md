# 脚本数据契约示例

编写或修改交互脚本时，按此例的组织方式交付 source 与 integration。字段由实际页面决定，
不要把 RewardState 或福利字段当成所有界面的公共结构。先确定页面所需数据，再写契约、
Render 和模拟数据；三者必须一致。注释中的类型名用于阅读，不代表自动类型或运行时校验。

## source：契约必须在交互脚本里

此例使用已设计好的节点，不创建 UI。前提节点树：RewardUI（ScreenGui）下的 Panel 包含
TitleTxt（TextLabel）、StatusTxt（TextLabel）、ClaimBtn（TextButton）。实际制作时先查询
节点树，替换类名、路径和业务字段，保留所用风格的按钮展示方式。

```lua
--[[
单条奖励接入契约

Config（RewardConfig）：
  entryId: string，必填，稳定的奖励条目业务 ID，无默认值；不是物品 ID。
  title: string，必填，标题，无默认值。
State（RewardState，Render 的完整输入，不是增量）：
  status: string，必填，无默认值；只允许 Locked / Claimable / Claimed，
          分别表示未满足条件 / 可领取 / 已领取，由接入层提供。
  pending: boolean，可选，省略按 false 处理；请求期间禁用领取。
  error: string，可选，省略为 nil；失败提示原文，非 pending 时优先显示。

最小完整数据示例（在接入 Ctor 调用父构造之后准备）：
  self.Config = { entryId = "online_5", title = "在线 5 分钟奖励" }
  self.State = { status = "Claimable", pending = false }

数据来源与刷新：
  GetUIConfig() 默认读取 self.Config；GetUIState() 默认读取 self.State。
  RefreshUI() 调用 Render(GetUIState())，不合并补丁、不填充业务字段。
  接入 OnReady 先调用父 OnReady 绑定节点，再 BindUIData()、Show()。
  后续更新 self.State 后调用 self:RefreshUI()；Render 只读数据、更新显示。
  本例没有列表或加载态；首次刷新前须备齐数据，异步未就绪时不调用 Show。

动作与覆写：
  必需实现 OnUIAction(action, payload)，无返回值。
  action = "Claim"；payload = { entryId: string }，与 Config.entryId 相同。
  真实接入负责资格校验和请求：请求前 pending=true、error=nil 并刷新；
  成功后 pending=false、status="Claimed"；失败后 pending=false、error=提示，
  并按业务结果保留或更新 status。每次状态更新后刷新。
  无其他必需或可选的页面专用覆写。模拟接入只修改模拟状态，不实际发奖。
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

-- 由模拟或游戏接入覆写，不在展示层执行业务。
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

- 接入者只读 source，就能写出完整 Config/State、知道何时刷新及如何处理动作。
- Render 和它调用的方法读取的所有业务字段均有说明；可选字段的实际行为符合注释。
- 示例 ID、字典键、动作参数相互对应；模拟类遵循同一契约。
- 修改字段或行为时，同时更新 source 契约、数据样例和 integration；不只改函数参数注释。
