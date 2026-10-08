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
    if name == 'CUIEditorUICompClass' then
        assert(parent == 'CUIView')
        return {}
    end
    assert(name == 'CUIView' and parent == 'FCUICompClass')
    return setmetatable({ Super = Base }, { __index = Base })
end, Loader = { PlayerGui = function(_, name) assert(name == 'TestUI'); return screen end } }
local file = assert(io.open('src/shared/uiCompClass.ts', 'r'))
local source = file:read('*a'); file:close()
local UI = assert(load(assert(source:match('String.raw`(.*)`;')), 'CUIEditorUICompClass'))()
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
