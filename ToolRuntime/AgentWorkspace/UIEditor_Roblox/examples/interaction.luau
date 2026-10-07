local FX = _G.FX
local FXLoader = FX.Loader
local UI = FX.Class("COnlineRewardUIBaseCompClass", "CUIEditorUICompClass")

-- 绑定设计节点；事件连接随组件销毁清理。
function UI:OnReady()
    local root = FXLoader:PlayerGui("OnlineRewardUI")
    self.StatusText = FXLoader:Here(root, "StatusText")
    self.ClaimButton = FXLoader:Here(root, "ClaimButton")
    self:TrackConnection(self.ClaimButton.Activated:Connect(function()
        self:EmitUIAction("ClaimReward", { RewardId = self:GetUIConfig().RewardId })
    end))
end

-- @param state table 模拟接入类提供的奖励状态
function UI:Render(state)
    self.StatusText.Text = state.Status
    self.ClaimButton.Text = state.Status == "Claimable" and "领取" or state.Status
    self:SetButtonEnabled(self.ClaimButton, state.Status == "Claimable")
end

return UI
