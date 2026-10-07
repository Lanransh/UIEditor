import { robloxStrategy } from './roblox';
import { dim2 } from '../shared/uiDocument';

export function rewardExample() {
  const document = robloxStrategy.createDocument('OnlineReward');
  document.name = '在线奖励脚本示例';
  document.root.name = 'OnlineRewardUI';
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
local Preview = FX.Class("COnlineRewardUIPreviewCompClass", "COnlineRewardUIBaseCompClass")

-- 初始化在线奖励的模拟数据。
-- @param owner table 编辑器提供的组件宿主
function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = { Reward = { Id = "online_5min", Title = "5-minute reward", Amount = 500 } }
    self.State = { Status = "Claimable", RemainingSeconds = 0, Pending = false }
end

-- @return table 奖励展示配置
function Preview:GetUIConfig()
    return self.Config
end

-- @return table 本次运行的模拟状态
function Preview:GetUIState()
    return self.State
end

-- 数据就绪后刷新界面。
function Preview:BindUIData()
    self:RefreshUI()
end

-- 领取动作只修改模拟状态，不向游戏发奖。
-- @param action string 交互层动作名
-- @param payload table 包含稳定 RewardId 的动作参数
function Preview:OnUIAction(action, payload)
    if action == "ClaimReward" then
        print("模拟领取", payload.RewardId)
        self.State.Status = "Claimed"
        self:RefreshUI()
    end
end

return Preview`,
    source: `local FX = _G.FX
local UI = FX.Class("COnlineRewardUIBaseCompClass", "CUIEditorUICompClass")
local FXLoader = FX.Loader

-- 绑定静态设计节点，连接随组件销毁清理。
function UI:OnReady()
    local root = FXLoader:PlayerGui("OnlineRewardUI")
    self.RewardTitle = FXLoader:Here(root, "RewardTitle")
    self.StatusText = FXLoader:Here(root, "StatusText")
    self.ClaimButton = FXLoader:Here(root, "ClaimButton")
    self:TrackConnection(self.ClaimButton.Activated:Connect(function()
        self:EmitUIAction("ClaimReward", {
            RewardId = self:GetUIConfig().Reward.Id,
        })
    end))
end

-- 根据模拟状态更新文案和按钮，保持原始奖励数值。
-- @param state table 接入类提供的奖励状态
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
