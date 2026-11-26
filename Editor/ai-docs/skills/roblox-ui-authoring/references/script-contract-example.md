# 脚本数据契约示例

RewardUI.Panel 下已有 TitleTxt、StatusTxt 和 ClaimBtn。下例配对展示随游戏导出的 View 契约与编辑器使用的模拟接入。制作时替换为实际节点、字段和动作。

## source

```lua
--[[
单条奖励接入契约

职责边界
  View 绑定按钮、渲染文字与点击许可。游戏接入提供奖励状态、校验资格并处理请求。

Config
  entryId: string，必填，稳定奖励条目 ID。
  title: string，必填，由配置提供的标题原文。

State（首次显示前提供完整状态）
  status: string，必填，Locked / Claimable / Claimed，无默认值。
  error: string，可选，默认 nil，业务返回的可展示错误原文。

展示、动作与结果
  文字优先显示 error，否则按 status 显示。仅 Claimable 允许发送 Claim。
  payload.entryId 为当前 Config.entryId。成功采用权威结果，失败更新 error 和实际 status。

接口与接入顺序（除注明外均无返回值）
  1. 在 Generated 外定义 CRewardView 的游戏子类，初始化完成后加载，在客户端玩家对象创建前 require，只挂载游戏子类。
  2. Ctor(owner: table) 先调用父构造，准备真实依赖和 Config/State。
     继承 GetUIConfig() -> Config、GetUIState() -> State；分别读取 self.Config、self.State。
  3. 实现 OnReady()，先父方法绑定节点，再 BindUIData()、Show()。
     需要订阅时覆写 BindUIData()，读取完整状态、RefreshUI() 并订阅一次，取代父类的单次刷新。
     TrackConnection(connection) 托管并返回原连接。后续写入完整 State，再调用 RefreshUI()。
  4. 必须实现 OnUIAction(action: string, payload: table)。检查 Claim 和 entryId，防重并发送请求；
     服务端校验并发奖，收到结果后刷新。父实现会报错，此处不调用 Super。
  5. 项目仅调用 Show()/Hide()。继承的 OnShow() 刷新当前状态，隐藏期间保留订阅。
     Render、按钮绑定、EmitUIAction 和 SetButtonEnabled 由 View 管理。
  6. 有未托管资源时覆写 Dtor()：释放资源、阻止过期回调，再调用父 Dtor()。

最小完整数据示例（在接入 Ctor 调用父构造之后准备）：
  self.Config = {
      entryId = "online_5",
      title = "5-minute online reward",
  }
  self.State = {
      status = "Claimable",
  }
]]
local FX = _G.FX
local FXLoader = FX.Loader
local Text = FXLoader:RequireShared("Scripts.Framework.Shared.Core.FXText")
local TranslationTexts = Text.Define("Reward", {
    Locked = "Locked",
    Claimable = "Ready to claim",
    Claimed = "Claimed",
})
local CRewardView = FX.Class("CRewardView", "CUIView")
CRewardView.BaseViewTranslationTexts = TranslationTexts

-- 绑定已有节点与按钮事件；刷新时不重复连接。
function CRewardView:OnReady()
    local root = FXLoader:PlayerGui("RewardUI")
    self.TitleTxt = FXLoader:Here(root, "Panel.TitleTxt")
    self.StatusTxt = FXLoader:Here(root, "Panel.StatusTxt")
    self.ClaimBtn = FXLoader:Here(root, "Panel.ClaimBtn")
    -- 点击时读取当前条目 ID，交给接入层处理。
    self:TrackConnection(self.ClaimBtn.Activated:Connect(function()
        local state = self:GetUIState()
        if state.status ~= "Claimable" then
            return
        end
        self:EmitUIAction("Claim", { entryId = self:GetUIConfig().entryId })
    end))
end

-- 打开时读取最新状态，不重新绑定事件。
function CRewardView:OnShow()
    self:RefreshUI()
end

-- 根据完整展示状态刷新；字段定义与数据样例见文件头 RewardState。
-- @param state table RewardState；status 必填，error 可选
function CRewardView:Render(state)
    self.TitleTxt.Text = Text.TrSource(self:GetUIConfig().title)
    local statusText = ""
    if state.error then
        statusText = Text.TrSource(state.error)
    elseif state.status == "Locked" then
        statusText = Text.Tr(TranslationTexts.Locked)
    elseif state.status == "Claimable" then
        statusText = Text.Tr(TranslationTexts.Claimable)
    elseif state.status == "Claimed" then
        statusText = Text.Tr(TranslationTexts.Claimed)
    else
        error("Unknown reward status: " .. tostring(state.status))
    end
    self.StatusTxt.Text = statusText
    self:SetButtonEnabled(self.ClaimBtn, state.status == "Claimable")
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
        title = "5-minute online reward",
    }
    self.State = {
        status = "Claimable",
    }
end

-- 父方法先绑定节点，然后执行初始刷新并显示。
function CRewardPreview:OnReady()
    CRewardPreview.Super.OnReady(self)
    self:BindUIData()
    self:Show()
end

-- 模拟立即成功；已领取的奖励不会再次处理。
-- @param action string 本页面仅支持 Claim
-- @param payload table { entryId: string }，须与当前配置一致
function CRewardPreview:OnUIAction(action, payload)
    assert(action == "Claim", "Unsupported reward action: " .. tostring(action))
    assert(payload.entryId == self.Config.entryId, "Unknown reward entry")
    if self.State.status ~= "Claimable" then
        return
    end
    self.State.status = "Claimed"
    self.State.error = nil
    self:RefreshUI()
end

return CRewardPreview
```

运行示例并点击 Claim，检查状态从 Claimable 变为 Claimed。再分别提供 Locked 和带 error 的状态，核对按钮与提示。

## 字典字段示例

列表契约写到叶子字段，并注明键如何对应配置 ID。

```lua
-- State.entries: table，必填；按 kind，再按条目 id 索引的字典，不是数组。
-- entries[kind]: table，每个配置分组必填；kind 为 online/signin/task。
-- entries[kind][id]: table，每个配置条目必填；id = Config.groups 中对应 items 的 id。
-- entries[kind][id].status: string，必填；Locked / Claimable / Claimed，无默认值。
-- entries[kind][id].current: number，task 必填；单位与 config.target 相同，无默认值。
-- 无条目分组使用 {}；缺少配置要求的分组或条目报错，不默认当作 Locked。
```
