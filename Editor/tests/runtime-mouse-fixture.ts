import { robloxStrategy as strategy } from '../src/editor/roblox';
import { dim2 } from '../src/shared/uiDocument';
export function mouseFixture() {
  const document = strategy.createDocument('Mouse'); document.root.name = 'Mouse';
  const button = strategy.createNode('TextButton'); button.name = 'Button'; button.properties.Position = dim2(80, 60);
  const scroll = strategy.createNode('ScrollingFrame'); scroll.name = 'List'; scroll.properties.Position = dim2(400, 60); scroll.properties.Size = dim2(300, 240); scroll.properties.CanvasSize = dim2(280, 1000);
  const child = strategy.createNode('TextLabel'); child.name = 'Content'; child.properties.Size = dim2(280, 80); scroll.children.push(child);
  document.root.children.push(button, scroll);
  document.scripts.source = `local FX = _G.FX
local UI = FX.Class("CMouseView", "CUIView")
function UI:OnReady()
    local root = FX.Loader:PlayerGui("Mouse")
    local b = root.Button
    self:TrackConnection(b.MouseEnter:Connect(function() b.Text = "hover" end))
    self:TrackConnection(b.MouseLeave:Connect(function() b.Text = "leave" end))
    self:TrackConnection(b.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 then b.Text = "down" end
    end))
    self:TrackConnection(b.InputChanged:Connect(function(input)
        b.Text = "drag"
        print("move", input.Position.X, input.Delta.X)
    end))
    self:TrackConnection(b.InputEnded:Connect(function(input)
        print("end", input.UserInputState.Name)
        b.Text = input.UserInputState == Enum.UserInputState.Cancel and "cancel" or "up"
    end))
    self:TrackConnection(b.Activated:Connect(function() b.Text = "click" end))
    self:TrackConnection(root.List:GetPropertyChangedSignal("CanvasPosition"):Connect(function() print("scroll", root.List.CanvasPosition.Y) end))
    self:TrackConnection(root.List.MouseWheelBackward:Connect(function() print("wheel") end))
end
return UI`;
  return { document, button, scroll, child };
}
