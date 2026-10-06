import { robloxStrategy } from './roblox';
import { dim2 } from '../shared/uiDocument';

export function rewardExample() {
  const document = robloxStrategy.createDocument('在线奖励脚本示例');
  const title = robloxStrategy.createNode('TextLabel');
  const status = robloxStrategy.createNode('TextLabel');
  const button = robloxStrategy.createNode('TextButton');
  title.name = '奖励名称'; status.name = '奖励状态'; button.name = '领取奖励';
  [title, status, button].forEach((node, index) => {
    node.properties.Position = dim2(440, 180 + index * 100);
    node.properties.Size = dim2(400, 70);
    document.root.children.push(node);
  });
  document.scripts = {
    integration: `function Preview:GetUIConfig() return self.Config end
function Preview:GetUIState() return self.State end
function Preview:BindUIData() self:RefreshUI() end
function Preview:OnUIAction(action, payload)
    if action == "ClaimReward" then
        print("模拟领取", payload.RewardId)
        self.State = { Status = "Claimed", RemainingSeconds = 0, Pending = false }
        self:RefreshUI()
    end
end`,
    config: 'return { Reward = { Id = "online_5min", Title = "5-minute reward", Amount = 500 } }',
    references: { RewardTitle: title.id, StatusText: status.id, ClaimButton: button.id },
    state: { Status: 'Locked', RemainingSeconds: 120, Pending: false },
    source: `-- 界面基类负责展示；游戏/预览子类提供配置、状态与业务动作。
function UI:OnMount()
    self.UI:On("ClaimButton", "Activated", function()
        self:EmitUIAction("ClaimReward", {
            RewardId = self:GetUIConfig().Reward.Id,
        })
    end)
end

function UI:Render(state)
    local reward = self:GetUIConfig().Reward
    self.UI:Set("RewardTitle", "Text", reward.Title .. " · " .. reward.Amount)
    local text = "Ready"
    local color = "#42b883"
    if state.Status == "Locked" then
        text = string.format("%d seconds remaining", state.RemainingSeconds)
        color = "#889999"
    elseif state.Status == "Claimed" then
        text = "Claimed"
        color = "#667777"
    end
    self.UI:Set("StatusText", "Text", text)
    self.UI:Set("ClaimButton", "Text", state.Pending and "Waiting..." or text)
    self.UI:Set("ClaimButton", "BackgroundColor3", color)
    self.UI:SetEnabled("ClaimButton", state.Status == "Claimable" and not state.Pending)
end`,
  };
  return document;
}
