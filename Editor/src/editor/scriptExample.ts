import { robloxStrategy } from './roblox';
import { dim2 } from '../shared/uiDocument';

export function rewardExample() {
  const document = robloxStrategy.createDocument('OnlineReward');
  document.name = '在线奖励脚本示例';
  const title = robloxStrategy.createNode('TextLabel');
  const status = robloxStrategy.createNode('TextLabel');
  const button = robloxStrategy.createNode('TextButton');
  title.name = 'RewardTitle'; status.name = 'StatusText'; button.name = 'ClaimButton';
  [title, status, button].forEach((node, index) => {
    node.properties.Position = dim2(440, 180 + index * 100);
    node.properties.Size = dim2(400, 70);
    document.root.children.push(node);
  });
  document.scripts = {
    integration: `local FX = _G.FX
local Preview = FX.Class("RewardPreview", "RewardInteraction")

function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = { Reward = { Id = "online_5min", Title = "5-minute reward", Amount = 500 } }
    self.State = { Status = "Claimable", RemainingSeconds = 0, Pending = false }
end

function Preview:GetUIConfig()
    return self.Config
end

function Preview:GetUIState()
    return self.State
end

function Preview:BindUIData()
    self:RefreshUI()
end

function Preview:OnUIAction(action, payload)
    if action == "ClaimReward" then
        print("模拟领取", payload.RewardId)
        self.State.Status = "Claimed"
        self:RefreshUI()
    end
end

return Preview`,
    source: `local FX = _G.FX
local UI = FX.Class("RewardInteraction", "FCUICompClass")

function UI:OnReady()
    local root = self:GetRootNode()
    self.RewardTitle = FX.Loader:Here(root, "RewardTitle")
    self.StatusText = FX.Loader:Here(root, "StatusText")
    self.ClaimButton = FX.Loader:Here(root, "ClaimButton")
    self:TrackConnection(self.ClaimButton.Activated:Connect(function()
        self:EmitUIAction("ClaimReward", {
            RewardId = self:GetUIConfig().Reward.Id,
        })
    end))
end

function UI:Render(state)
    local reward = self:GetUIConfig().Reward
    self.RewardTitle.Text = reward.Title .. " · " .. reward.Amount
    local text = "Ready"
    local color = "#42b883"
    if state.Status == "Locked" then
        text = string.format("%d seconds remaining", state.RemainingSeconds)
        color = "#889999"
    elseif state.Status == "Claimed" then
        text = "Claimed"
        color = "#667777"
    end
    self.StatusText.Text = text
    self.ClaimButton.Text = state.Pending and "Waiting..." or text
    self.ClaimButton.BackgroundColor3 = Color3.fromHex(color)
    self:SetButtonEnabled(self.ClaimButton, state.Status == "Claimable" and not state.Pending)
end

return UI`,
  };
  return document;
}
