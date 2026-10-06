local FX = _G.FX
local Preview = FX.Class("COnlineRewardUIPreviewCompClass", "COnlineRewardUIBaseCompClass")

function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = { RewardId = "online_5min" }
    self.State = { Status = "Claimable" }
end

function Preview:OnUIAction(action, payload)
    if action == "ClaimReward" and self.State.Status == "Claimable" then
        print("模拟领取", payload.RewardId)
        self.State.Status = "Claimed"
        self:RefreshUI()
    end
end

return Preview
