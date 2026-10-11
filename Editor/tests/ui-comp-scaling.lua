-- Pure layout/lifecycle regression with a small fake engine; does not prove Studio rendering.
local function signal()
    local handlers = {}
    return {
        Connect = function(_, callback)
            local connection = { Connected = true, callback = callback }
            function connection:Disconnect() self.Connected = false end
            table.insert(handlers, connection)
            return connection
        end,
        Fire = function(_, ...)
            for _, connection in ipairs(handlers) do
                if connection.Connected then connection.callback(...) end
            end
        end,
    }
end
UDim2 = {}
function UDim2.new(xs, xo, ys, yo) return { X = { Scale = xs, Offset = xo }, Y = { Scale = ys, Offset = yo } } end
function UDim2.fromOffset(x, y) return UDim2.new(0, x, 0, y) end
local function scaleNode(value)
    return { ClassName = 'UIScale', Scale = value, Destroy = function(self) self.destroyed = true end }
end
Instance = { new = function(className)
    assert(className == 'UIScale')
    return scaleNode(1)
end }
local function frame()
    local node = { Position = UDim2.new(.5, -10, .5, 20), Size = UDim2.new(.5, 30, 0, 100),
        AnchorPoint = { X = .5, Y = .5 }, children = {} }
    function node:IsA(name) return name == 'GuiObject' end
    function node:FindFirstChildOfClass(name)
        for _, child in ipairs(self.children) do if child.ClassName == name then return child end end
    end
    return node
end
local panel, button, nested = frame(), frame(), frame()
button.Position = UDim2.new(.2, 15, .1, -5)
local existing = scaleNode(.8)
panel.children = { existing, nested }
local screen = { AbsoluteSize = { X = 1280, Y = 720 }, children = { panel, button },
    ChildAdded = signal(), ChildRemoved = signal(), resized = signal() }
function screen:GetChildren() return self.children end
function screen:GetPropertyChangedSignal(property) assert(property == 'AbsoluteSize'); return self.resized end
local Base = {}
function Base:Ctor(owner) self._connections = {} end
function Base:TrackConnection(connection) table.insert(self._connections, connection) end
function Base:Dtor() for _, connection in ipairs(self._connections) do connection:Disconnect() end end
_G.FX = { Class = function(name, parent)
    assert(name == 'CUIView' and parent == 'FCUICompClass')
    return setmetatable({ Super = Base }, { __index = Base })
end, Loader = { PlayerGui = function(_, name) assert(name == 'TestUI'); return screen end } }
local file = assert(io.open('src/shared/uiCompClass.ts', 'r'))
local source = file:read('*a'); file:close()
local UI = assert(load(assert(source:match('String.raw`(.*)`;')), 'CUIView'))()
local function new(adapt)
    local instance = setmetatable({ ScreenGuiName = 'TestUI', ScreenAdaptation = adapt }, { __index = UI })
    instance:Ctor({})
    return instance
end
local function close(actual, expected) assert(math.abs(actual - expected) < 1e-8, actual .. ' ~= ' .. expected) end
local originalPosition, originalSize = panel.Position, panel.Size
local ui = new()
assert(ui:GetRootNode() == screen and ui:GetCompName() == 'TestUIComp')
local created = ui._responsiveGroups[button].scale
for _, case in ipairs({
    {1280, 720, 1, 0, 0}, {640, 360, .5, 0, 0}, {1920, 1080, 1.5, 0, 0},
    {2560, 1440, 2, 0, 0}, {1024, 768, .8, 0, 96},
    {720, 1280, .5625, 0, 437.5}, {3440, 1440, 2, 440, 0},
}) do
    screen.AbsoluteSize = { X = case[1], Y = case[2] }; screen.resized:Fire()
    close(existing.Scale, .8 * case[3]); close(created.Scale, case[3])
    close(panel.Position.X.Offset, case[4] + 630 * case[3])
    close(panel.Position.Y.Offset, case[5] + 380 * case[3])
    close(panel.Size.X.Offset, 670); close(panel.Size.Y.Offset, 100)
    assert(panel.Size.X.Scale == 0 and panel.Position.X.Scale == 0)
    assert(nested:FindFirstChildOfClass('UIScale') == nil)
    assert(panel.AnchorPoint.X == .5)
end
local previous = panel.Position
screen.AbsoluteSize = { X = 0, Y = 0 }; screen.resized:Fire()
assert(panel.Position == previous)
screen.ChildRemoved:Fire(panel)
assert(panel.Position == originalPosition and panel.Size == originalSize and existing.Scale == .8)
screen.AbsoluteSize = { X = 640, Y = 360 }; screen.ChildAdded:Fire(panel)
close(existing.Scale, .4)
local late = frame(); local latePosition = late.Position
screen.ChildAdded:Fire(late); close(ui._responsiveGroups[late].scale.Scale, .5)
assert(#ui._connections == 3)
ui:Dtor()
assert(panel.Position == originalPosition and panel.Size == originalSize and existing.Scale == .8)
assert(created.destroyed and late.Position == latePosition)
for _, connection in ipairs(ui._connections) do assert(not connection.Connected) end
screen.AbsoluteSize = { X = 2560, Y = 1440 }; screen.resized:Fire()
assert(panel.Position == originalPosition and existing.Scale == .8)
local again = new(); close(existing.Scale, 1.6)
again:Dtor(); assert(existing.Scale == .8 and panel.Position == originalPosition)
print('Shared UI class: resolution fitting, centering, nested scale, late children and lifecycle passed')
-- MainUI opts out before construction; no scale or resize subscriptions are installed.
local hud = new(false)
assert(hud._responsiveGroups == nil and #hud._connections == 0)
assert(panel.Position == originalPosition and existing.Scale == .8)
hud:Dtor()
assert(panel.Position == originalPosition and existing.Scale == .8)
print('Custom MainUI adaptation opt-out passed')

-- 游戏框架把动画倍率写入控制器；页面仍保留全部原始查找路径。
local controllers = {}
Instance.new = function(className)
    if className == 'UIScale' then
        local scale = scaleNode(1)
        scale.changed = signal()
        function scale:GetPropertyChangedSignal(property) assert(property == 'Scale'); return self.changed end
        return scale
    end
    assert(className == 'Frame')
    local controller = { Destroy = function(self) self.destroyed = true end }
    table.insert(controllers, controller)
    return controller
end
function Base:SetOpenAnimation(controller)
    self.popup = controller
end
local animated = new()
assert(animated.OpenAnimation and animated.popup == controllers[1])
assert(animated.popup.Parent == nil and screen.children[1] == panel and screen.children[2] == button)
local function animate(view, factor)
    view._animationScale.Scale = factor
    view._animationScale.changed:Fire()
end
screen.AbsoluteSize = { X = 640, Y = 360 }; screen.resized:Fire()
animate(animated, .65)
close(existing.Scale, .8 * .5 * .65)
close(panel.Position.X.Offset, 320 + (315 - 320) * .65)
close(panel.Position.Y.Offset, 180 + (190 - 180) * .65)
close(animated._responsiveGroups[button].scale.Scale, .5 * .65)
close(button.Position.X.Offset, 320 + (1280 * .2 + 15 - 640) * .5 * .65)
close(button.Position.Y.Offset, 180 + (720 * .1 - 5 - 360) * .5 * .65)
local animatedLate = frame()
local animatedLatePosition = animatedLate.Position
screen.ChildAdded:Fire(animatedLate)
close(animated._responsiveGroups[animatedLate].scale.Scale, .5 * .65)
screen.AbsoluteSize = { X = 1024, Y = 768 }; screen.resized:Fire()
close(existing.Scale, .8 * .8 * .65)
close(panel.Position.Y.Offset, 384 + (96 + 380 * .8 - 384) * .65)
animate(animated, 1)
close(existing.Scale, .8 * .8)
local animatedController = animated.popup
animated:Dtor()
assert(animatedController.destroyed and panel.Position == originalPosition and existing.Scale == .8)
assert(animatedLate.Position == animatedLatePosition)
for _, connection in ipairs(animated._connections) do assert(not connection.Connected) end

-- 派生类开关在构造前生效；HUD 不配置任何弹窗，适配开关独立控制。
local disabled = setmetatable({ ScreenGuiName = 'TestUI', ScreenAdaptation = false,
    OpenAnimation = false }, { __index = UI })
disabled:Ctor({})
assert(disabled.popup == nil and disabled._responsiveGroups == nil and #controllers == 1)
disabled:Dtor()

local fittedHUD = setmetatable({ ScreenGuiName = 'TestUI', OpenAnimation = false }, { __index = UI })
fittedHUD:Ctor({})
assert(fittedHUD.popup == nil and fittedHUD._responsiveGroups ~= nil and #controllers == 1)
close(existing.Scale, .8 * .8)
fittedHUD:Dtor()

-- 自定义布局也能单独启用动画，结束和析构时保留原设计值。
local custom = new(false)
assert(custom.popup ~= nil)
animate(custom, .65)
close(panel.Position.X.Scale, .5)
close(panel.Position.X.Offset, -10 * .65)
close(existing.Scale, .8 * .65)
assert(panel.Size == originalSize)
animate(custom, 1)
close(panel.Position.X.Offset, -10)
custom:Dtor()
assert(panel.Position == originalPosition and existing.Scale == .8)
print('Whole-page animation multiplier, resize, inherited opt-out, custom layout and cleanup passed')
