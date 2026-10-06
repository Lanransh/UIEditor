local FX = _G.FX
local UI = FX.Class("COnlineRewardUIBaseCompClass", "FCUICompClass")

function UI:OnReady()
    self.StatusText = FX.Loader:Here(self:GetRootNode(), "StatusText")
    self.ClaimButton = FX.Loader:Here(self:GetRootNode(), "ClaimButton")
    self:TrackConnection(self.ClaimButton.Activated:Connect(function()
        self:EmitUIAction("ClaimReward", { RewardId = self:GetUIConfig().RewardId })
    end))
end

function UI:Render(state)
    self.StatusText.Text = state.Status
    self.ClaimButton.Text = state.Status == "Claimable" and "领取" or state.Status
    self:SetButtonEnabled(self.ClaimButton, state.Status == "Claimable")
end

return UI
