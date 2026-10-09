-- Trusted host; user chunks receive only their class and sandboxed standard library.
local valueTypes = setmetatable({}, { __mode = "k" })
local function value(kind, fields)
    valueTypes[fields] = kind
    return table.freeze(fields)
end
local function number(input)
    assert(type(input) == "number" and input == input and math.abs(input) < math.huge, "Expected finite number")
    return input
end
local UDim, UDim2, Vector2, Color3, Enum = {}, {}, {}, {}, {}
function UDim.new(scale, offset) return value("UDim", { Scale = number(scale or 0), Offset = number(offset or 0) }) end
function UDim2.new(xs, xo, ys, yo)
    local x, y
    if valueTypes[xs] == "UDim" then
        assert(valueTypes[xo] == "UDim", "Expected two UDim values")
        x, y = xs, xo
    else x, y = UDim.new(xs, xo), UDim.new(ys, yo) end
    return value("UDim2", { X = x, Y = y, Width = x, Height = y })
end
function UDim2.fromScale(x, y) return UDim2.new(x, 0, y, 0) end
function UDim2.fromOffset(x, y) return UDim2.new(0, x, 0, y) end
function Vector2.new(x, y) return value("Vector2", { X = number(x or 0), Y = number(y or 0) }) end
function Color3.new(r, g, b) return value("Color3", { R = number(r or 0), G = number(g or 0), B = number(b or 0) }) end
function Color3.fromRGB(r, g, b) return Color3.new(number(r or 0) / 255, number(g or 0) / 255, number(b or 0) / 255) end
function Color3.fromHex(hex)
    assert(type(hex) == "string", "Expected hex color")
    hex = string.gsub(hex, "^#", "")
    assert(#hex == 6 and string.match(hex, "^%x+$"), "Expected six-digit hex color")
    return Color3.fromRGB(tonumber(string.sub(hex, 1, 2), 16), tonumber(string.sub(hex, 3, 4), 16), tonumber(string.sub(hex, 5, 6), 16))
end
local function encode(input)
    local kind = valueTypes[input]
    if kind == "UDim" then return { scale = input.Scale, offset = input.Offset }
    elseif kind == "UDim2" then return { x = encode(input.X), y = encode(input.Y) }
    elseif kind == "Vector2" then return { x = input.X, y = input.Y }
    elseif kind == "Color3" then
        local function byte(channel) return math.floor(math.clamp(channel, 0, 1) * 255 + 0.5) end
        return string.format("#%02x%02x%02x", byte(input.R), byte(input.G), byte(input.B))
    elseif kind == "EnumItem" then return input.Name end
    return input
end
local function decode(input, definition, property)
    if definition.kind == "udim" then return UDim.new(input.scale, input.offset)
    elseif definition.kind == "udim2" then return UDim2.new(input.x.scale, input.x.offset, input.y.scale, input.y.offset)
    elseif definition.kind == "vector" then return Vector2.new(input.x, input.y)
    elseif definition.kind == "color" then return Color3.fromHex(input)
    elseif definition.kind == "enum" then return Enum[property][input] end
    return input
end
local clone = function(value) return value end
clone = function(value)
    if type(value) ~= "table" or valueTypes[value] then return value end
    local result = {}
    for key, item in pairs(value) do result[key] = clone(item) end
    return result
end
local Base = {}
local Class, Preview
local nodes, instance, root
local classes = { FCUICompClass = Base }
local proxies, proxyIds = {}, setmetatable({}, { __mode = "k" })
local FX = {}
function FX.Class(name, base)
    assert(type(name) == "string" and not classes[name], "Class already registered: " .. tostring(name))
    if type(base) == "string" then base = assert(classes[base], "Base class not found: " .. base) end
    assert(type(base) == "table", "Expected base class")
    local cls = { __name = name, __base = base, Super = base }
    cls.__index = cls
    setmetatable(cls, { __index = base })
    function cls:Ctor(...) if base.Ctor then base.Ctor(self, ...) end end
    function cls:Dtor() if base.Dtor then base.Dtor(self) end end
    function cls.New(...)
        local obj = setmetatable({}, cls)
        obj:Ctor(...)
        return obj
    end
    function cls:GetClassName() return cls.__name end
    function cls:IsA(target)
        if type(target) == "string" then target = classes[target] end
        local current = getmetatable(self)
        while current do
            if current == target then return true end
            current = current.__base
        end
        return false
    end
    classes[name] = cls
    return cls
end
function FX.GetClass(name) return classes[name] end
local handlers, disabled = {}, {}
local logs = {}
local dirty, structureChanged = {}, true
local function mark(id)
    dirty[id] = dirty[id] or {}
    return dirty[id]
end
local nextId, nodeCount = 0, 0
local rendering = false
local function nodeFor(ref)
    local id = proxyIds[ref] or (nodes[ref] and ref) or (instance and instance._References and instance._References[ref])
    assert(id and nodes[id] and not nodes[id].destroyed, "Unknown or destroyed node reference: " .. tostring(ref))
    return nodes[id], id
end
local mouseEvents = { MouseEnter = true, MouseLeave = true, MouseMoved = true, MouseWheelForward = true, MouseWheelBackward = true, InputBegan = true, InputChanged = true, InputEnded = true }
local function fire(id, event, ...)
    for _, handler in ipairs(table.clone(handlers[id] or {})) do
        if handler.event == event and handler.connection.Connected then handler.callback(...) end
    end
end
local function equal(a, b)
    if type(a) ~= "table" or type(b) ~= "table" then return a == b end
    for k, v in pairs(a) do if not equal(v, b[k]) then return false end end
    for k in pairs(b) do if a[k] == nil then return false end end
    return true
end
local API = {}
function API:Get(ref, property)
    local node = nodeFor(ref)
    assert(node.properties[property] ~= nil, "Unsupported property: " .. property)
    return decode(clone(node.properties[property]), node.definitions[property], property)
end
function API:Set(ref, property, value)
    local node, id = nodeFor(ref)
    assert(node.properties[property] ~= nil, "Unsupported property: " .. property)
    if valueTypes[value] then
        local expected = ({ udim = "UDim", udim2 = "UDim2", vector = "Vector2", color = "Color3", enum = "EnumItem" })[node.definitions[property].kind]
        assert(valueTypes[value] == expected, "Wrong Roblox value type for " .. property)
        if expected == "EnumItem" then assert(value.EnumType == property, "Wrong enum type for " .. property) end
        value = encode(value)
    end
    local changed = not equal(node.properties[property], value)
    node.properties[property] = clone(value)
    if changed then
        local change = mark(id)
        change.properties = change.properties or {}
        change.properties[property] = true
        fire(id, "property:" .. property)
    end
end
function API:On(ref, event, callback)
    local node, id = nodeFor(ref)
    assert(mouseEvents[event] and node.properties.Visible ~= nil or event == "Activated" and (node.className == "TextButton" or node.className == "ImageButton") or string.sub(event, 1, 9) == "property:" and node.properties[string.sub(event, 10)] ~= nil, "Unsupported node event: " .. event)
    assert(type(callback) == "function", "Expected callback")
    local connection = { Connected = true }
    function connection:Disconnect() self.Connected = false end
    handlers[id] = handlers[id] or {}
    table.insert(handlers[id], { event = event, callback = callback, connection = connection })
    return connection
end
function API:SetEnabled(ref, enabled)
    local node, id = nodeFor(ref)
    assert(node.className == "TextButton" or node.className == "ImageButton", "SetEnabled requires a button")
    assert(type(enabled) == "boolean", "Expected boolean")
    disabled[id] = not enabled
end
local function child(parent, name)
    local node = nodeFor(parent)
    local found
    for _, id in ipairs(node.children) do
        if nodes[id].name == name then
            assert(not found, "Ambiguous child name: " .. name)
            found = proxies[id]
        end
    end
    return found
end
local makeProxy
local function reparent(id, parentId)
    local node = nodeFor(id)
    assert(id ~= root, "Cannot reparent the document root")
    if parentId then
        nodeFor(parentId)
        local ancestor = parentId
        while ancestor do
            assert(ancestor ~= id, "Cannot parent a node to itself or its descendant")
            ancestor = nodes[ancestor].parent
        end
    end
    if node.parent == parentId then return end
    structureChanged = true
    if node.parent then
        local siblings = nodes[node.parent].children
        table.remove(siblings, table.find(siblings, id))
    end
    node.parent = parentId
    if parentId then table.insert(nodes[parentId].children, id) end
end
local function cloneNode(id)
    local source = nodeFor(id)
    assert(nodeCount < 5000, "Runtime supports at most 5000 nodes")
    repeat nextId += 1 until not nodes["runtime-" .. nextId]
    local copiedId = "runtime-" .. nextId
    local copied = {
        name = source.name, className = source.className, properties = clone(source.properties),
        definitions = source.definitions, children = {},
        previewImage = clone(source.previewImage), imageAssetId = source.imageAssetId,
    }
    nodes[copiedId] = copied
    nodeCount += 1
    proxies[copiedId] = makeProxy(copiedId)
    for _, childId in ipairs(source.children) do
        local newChildId = cloneNode(childId)
        nodes[newChildId].parent = copiedId
        table.insert(copied.children, newChildId)
    end
    return copiedId
end
local function destroy(id)
    local node = nodes[id]
    if node.destroyed then return end
    assert(id ~= root, "Cannot destroy the document root")
    reparent(id, nil)
    for _, childId in ipairs(table.clone(node.children)) do destroy(childId) end
    for _, handler in ipairs(handlers[id] or {}) do handler.connection:Disconnect() end
    handlers[id], disabled[id] = nil, nil
    node.destroyed = true
    nodeCount -= 1
end
makeProxy = function(id)
    local proxy = setmetatable({}, {
        __index = function(_, key)
            local node = nodes[id]
            if key == "Name" then return node.name end
            if key == "ClassName" then return node.className end
            if key == "Parent" then return proxies[node.parent] end
            if key == "Clone" then return function() return proxies[cloneNode(id)] end end
            if key == "Destroy" then return function() destroy(id) end end
            if key == "GetChildren" then return function()
                local result = {}
                for _, childId in ipairs(node.children) do table.insert(result, proxies[childId]) end
                return result
            end end
            if key == "FindFirstChild" then return function(_, name) return child(id, name) end end
            if key == "WaitForChild" then return function(_, name) return assert(child(id, name), "Missing child: " .. name) end end
            if key == "IsA" then return function(_, name) return node.className == name end end
            if key == "GetPropertyChangedSignal" then return function(_, property)
                assert(node.properties[property] ~= nil, "Unsupported property")
                return table.freeze({ Connect = function(_, callback) return API:On(id, "property:" .. property, callback) end })
            end end
            if key == "Activated" or mouseEvents[key] then
                return table.freeze({ Connect = function(_, callback) return API:On(id, key, callback) end })
            end
            if node.properties[key] ~= nil then return API:Get(id, key) end
            return child(id, key)
        end,
        __newindex = function(_, key, input)
            local node = nodeFor(id)
            if key == "Name" then
                assert(type(input) == "string" and string.match(input, "%S"), "Expected non-empty node name")
                node.name = input
                mark(id).name = true
            elseif key == "Parent" then
                assert(input == nil or proxyIds[input], "Parent must be a UI node or nil")
                reparent(id, input and proxyIds[input])
            else API:Set(id, key, input) end
        end,
        __metatable = "UI node",
    })
    proxyIds[proxy] = id
    return proxy
end
local Loader = {}
-- 校验固定路径，避免空段或斜杠被静默解析为其他节点。
-- @param path string 点分隔路径
local function validatePath(path)
    assert(type(path) == "string" and #path > 0, "Expected non-empty node path")
    assert(not string.find(path, "/", 1, true), "UI node paths use '.'; '/' is not supported")
    assert(string.sub(path, 1, 1) ~= "." and string.sub(path, -1) ~= "."
        and not string.find(path, "..", 1, true), "Invalid UI node path: " .. path)
end

-- 从指定节点逐层查找，只接受点分隔路径。
-- @param parent Instance 查找根节点
-- @param path string 相对节点路径，不包含根节点名称
-- @return Instance 必需的目标节点，缺失或同级重名时抛错
function Loader:Here(parent, path)
    validatePath(path)
    for name in string.gmatch(path, "[^.]+") do
        parent = assert(child(parent, name), "Missing UI node: " .. path)
    end
    return parent
end
-- 从模拟 PlayerGui 查找当前界面，可继续查找其子节点。
-- @param path string 以当前 ScreenGui 名称开头的点分隔路径
-- @return Instance 目标界面或子节点；只包含当前文档，不模拟其他界面
function Loader:PlayerGui(path)
    validatePath(path)
    local name, relativePath = string.match(path, "^([^.]+)%.?(.*)$")
    assert(nodes[root].name == name, "Missing ScreenGui: " .. name)
    if relativePath == "" then
        return proxies[root]
    end
    return self:Here(proxies[root], relativePath)
end
FX.Loader = table.freeze(Loader)
function Base:Ctor(owner)
    self._owner = owner
    self._rootNode = proxies[root]
    self.UI = API
    self._connections = {}
end
function Base:GetOwner() return self._owner end
function Base:GetRootNode() return self._rootNode end
function Base:TrackConnection(connection)
    table.insert(self._connections, connection)
    return connection
end
function Base:Dtor()
    for _, connection in ipairs(self._connections) do connection:Disconnect() end
end
function Base:SetButtonEnabled(button, enabled) API:SetEnabled(button, enabled) end
function Base:Show()
    local node = self:GetRootNode()
    if node:IsA("ScreenGui") then node.Enabled = true else node.Visible = true end
    if self.OnShow then self:OnShow() end
end
function Base:Hide()
    local node = self:GetRootNode()
    if node:IsA("ScreenGui") then node.Enabled = false else node.Visible = false end
    if self.OnHide then self:OnHide() end
end
function Base:GetUIConfig() return self.Config end
function Base:GetUIState() return self.State end
function Base:BindUIData() self:RefreshUI() end
function Base:OnUIAction(action, payload) end
function Base:EmitUIAction(action, payload)
    assert(type(action) == "string" and #action > 0, "Expected action name")
    table.insert(logs, { kind = "action", message = action, payload = payload })
    self:OnUIAction(action, payload)
end
function Base:RefreshUI()
    assert(not rendering, "Recursive RefreshUI is not allowed")
    rendering = true
    local ok, err = pcall(function()
        if self.Render then self:Render(self:GetUIState()) end
    end)
    rendering = false
    if not ok then error(err, 0) end
end
table.freeze(API)
Base.__index = Base
Base.__name = "FCUICompClass"
table.freeze(Base)
local Shared = (function()
    local _G = { FX = FX }
    -- UIEDITOR_SHARED_BASE
end)()
-- 编辑器在固定 1280×720 画布上运行，设备适配比例为 1。
-- 引擎尺寸监听和原生按钮属性由宿主适配，不重复实现公共类合同。
function Shared:_AdaptToScreen(screen) end
Shared.SetButtonEnabled = Base.SetButtonEnabled
local emitUIAction = Shared.EmitUIAction
function Shared:EmitUIAction(action, payload)
    table.insert(logs, { kind = "action", message = action, payload = payload })
    emitUIAction(self, action, payload)
end
table.freeze(Shared)
table.freeze(FX.GetClass("CUIEditorUICompClass"))
local host = {}
function host.initialize(input)
    for property, choices in pairs(input.enums) do
        local items = {}
        for _, name in ipairs(choices) do items[name] = value("EnumItem", { Name = name, EnumType = property }) end
        Enum[property] = table.freeze(items)
    end
    for kind, names in pairs({ UserInputType = { "MouseButton1", "MouseButton2", "MouseButton3", "MouseMovement", "MouseWheel", "Touch" }, UserInputState = { "Begin", "Change", "End", "Cancel" } }) do
        local items = {}
        for _, name in ipairs(names) do items[name] = value("EnumItem", { Name = name, EnumType = kind }) end
        Enum[kind] = table.freeze(items)
    end
    table.freeze(Enum)
end
function host.prepare(input)
    nodes, root = input.nodes, input.root
    for id, node in pairs(nodes) do
        proxies[id] = makeProxy(id)
        nodeCount += 1
        for _, childId in ipairs(node.children) do nodes[childId].parent = id end
    end
end
function host.interaction(cls)
    assert(type(cls) == "table" and classes[cls.__name] == cls and (cls.__base == Base or cls.__base == Shared or cls.__base == FX.GetClass("CUIEditorUICompClass")), "Interaction script must return a class inheriting CUIView")
    Class = cls
    Class.ScreenGuiName = nodes[root].name
    table.freeze(Class)
end
function host.integration(cls)
    assert(type(cls) == "table" and classes[cls.__name] == cls and cls.__base == Class, "Integration script must return a class inheriting the interaction class")
    Preview = cls
    table.freeze(Preview)
end
function host.start()
    instance = Preview.New({})
    if instance.OnReady then instance:OnReady() end
    instance:BindUIData()
    instance:Show()
end
function host.command(input)
    if input.type == "show" then
        instance:Show()
    elseif input.type == "hide" then
        instance:Hide()
    elseif input.type == "set" then
        if input.property == "Name" then
            nodeFor(input.node).name = input.value
            mark(input.node).name = true
        else
            API:Set(input.node, input.property, input.value)
        end
    elseif input.type == "event" and not disabled[input.node] then
        fire(input.node, "Activated")
    elseif input.type == "mouse" then
        local event = input.event
        table.insert(logs, { kind = "input", message = input.node .. " " .. event })
        if string.sub(event, 1, 5) == "Input" then
            local button = ({ [0] = "MouseButton1", [1] = "MouseButton3", [2] = "MouseButton2" })[input.button]
            local state = input.cancelled and "Cancel" or event == "InputBegan" and "Begin" or event == "InputEnded" and "End" or "Change"
            fire(input.node, event, table.freeze({
                UserInputType = Enum.UserInputType[input.touch and "Touch" or input.wheel and "MouseWheel" or button or "MouseMovement"], UserInputState = Enum.UserInputState[state],
                Position = table.freeze({ X = input.x, Y = input.y, Z = input.wheel and -math.sign(input.dy) or 0 }),
                Delta = table.freeze({ X = input.wheel and 0 or input.dx, Y = input.wheel and 0 or input.dy, Z = input.wheel and -math.sign(input.dy) or 0 }),
            }))
        else fire(input.node, event, input.x, input.y) end
    end
end
function host.dispose()
    if instance then
        instance:Hide()
        if instance.OnDispose then instance:OnDispose() end
        instance:Dtor()
    end
    for _, list in pairs(handlers) do
        for _, handler in ipairs(list) do handler.connection:Disconnect() end
    end
    handlers = {}
end
function host.output()
    local ids, listeners, patch = {}, {}, {}
    local function snapshot(id)
        local node = nodes[id]
        local children = {}
        for _, childId in ipairs(node.children) do
            local child = snapshot(childId)
            if structureChanged then table.insert(children, child) end
        end
        if disabled[id] then table.insert(ids, id) end
        for _, handler in ipairs(handlers[id] or {}) do
            if handler.connection.Connected then
                listeners[id] = listeners[id] or {}
                if not table.find(listeners[id], handler.event) then table.insert(listeners[id], handler.event) end
            end
        end
        if not structureChanged then
            local changed = dirty[id]
            if changed then
                local update = {}
                if changed.name then update.name = node.name end
                if changed.properties then
                    update.properties = {}
                    for property in pairs(changed.properties) do update.properties[property] = node.properties[property] end
                end
                patch[id] = update
            end
            return nil
        end
        return {
            id = id, name = node.name, className = node.className,
            properties = node.properties, children = children,
            previewImage = node.previewImage, imageAssetId = node.imageAssetId,
        }
    end
    local tree = snapshot(root)
    local result = { disabled = ids, logs = logs, listeners = listeners }
    if structureChanged then result.root = tree else result.patch = patch end
    logs, dirty, structureChanged = {}, {}, false
    return result
end
-- Print is a host-owned closure, not stdout; messages remain framed JSON.
function host.print(...)
    local parts = {}
    for index = 1, select("#", ...) do parts[index] = tostring(select(index, ...)) end
    table.insert(logs, { kind = "output", message = table.concat(parts, "\t") })
end
function host.warn(...)
    host.print(...)
    logs[#logs].kind = "warning"
end
host.globals = table.freeze({
    _G = table.freeze({ FX = table.freeze(FX) }),
    UDim = table.freeze(UDim), UDim2 = table.freeze(UDim2), Vector2 = table.freeze(Vector2),
    Color3 = table.freeze(Color3), Enum = Enum,
    typeof = function(input) return valueTypes[input] or (proxyIds[input] and "Instance") or type(input) end,
})
return host
