-- Trusted host; user chunks receive only their class and sandboxed standard library.
local clone = function(value) return value end
clone = function(value)
    if type(value) ~= "table" then return value end
    local result = {}
    for key, item in pairs(value) do result[key] = clone(item) end
    return result
end
local Base = {}
local Class = setmetatable({}, table.freeze({ __index = Base }))
local nodes, refs, config, state, instance
local handlers, disabled = {}, {}
local operations, logs = {}, {}
local rendering = false
local function nodeFor(ref)
    local id = refs[ref]
    assert(id and nodes[id], "Unknown node reference: " .. tostring(ref))
    return nodes[id], id
end
local API = {}
function API:Get(ref, property)
    local node = nodeFor(ref)
    assert(node.properties[property] ~= nil, "Unsupported property: " .. property)
    return clone(node.properties[property])
end
function API:Set(ref, property, value)
    local node, id = nodeFor(ref)
    assert(node.properties[property] ~= nil, "Unsupported property: " .. property)
    node.properties[property] = clone(value)
    table.insert(operations, { node = id, property = property, value = clone(value) })
end
function API:On(ref, event, callback)
    local node, id = nodeFor(ref)
    assert(event == "Activated" and (node.className == "TextButton" or node.className == "ImageButton"), "Only button Activated is supported")
    assert(type(callback) == "function", "Expected callback")
    local connection = { Connected = true }
    function connection:Disconnect() self.Connected = false end
    handlers[id] = handlers[id] or {}
    table.insert(handlers[id], { callback = callback, connection = connection })
    return connection
end
function API:SetEnabled(ref, enabled)
    local node, id = nodeFor(ref)
    assert(node.className == "TextButton" or node.className == "ImageButton", "SetEnabled requires a button")
    assert(type(enabled) == "boolean", "Expected boolean")
    disabled[id] = not enabled
end
function Base:GetUIConfig() return config end
function Base:GetUIState() return state end
function Base:BindUIData() self:RefreshUI() end
function Base:OnUIAction(action, payload)
    assert(type(action) == "string" and #action > 0, "Expected action name")
    table.insert(logs, { kind = "action", message = action, payload = payload })
end
function Base:EmitUIAction(action, payload) self:OnUIAction(action, payload) end
function Base:RefreshUI()
    assert(not rendering, "Recursive RefreshUI is not allowed")
    rendering = true
    if self.Render then self:Render(self:GetUIState()) end
    rendering = false
end
table.freeze(API)
table.freeze(Base)
local host = {}
function host.prepare(input, settings)
    nodes, refs, state, config = input.nodes, input.references, input.state, settings
    local function freeze(value)
        if type(value) ~= "table" then return end
        for _, item in pairs(value) do freeze(item) end
        table.freeze(value)
    end
    freeze(state)
    return Class
end
function host.start()
    for name, method in pairs(Class) do
        assert(({ OnMount = true, Render = true, OnShow = true, OnHide = true, OnDispose = true })[name] and type(method) == "function", "Unsupported or reserved class method: " .. tostring(name))
    end
    table.freeze(Class)
    -- Preview subclass overrides the four business hooks, inheriting authored UI methods.
    local Preview = setmetatable({
        GetUIConfig = Base.GetUIConfig, GetUIState = Base.GetUIState,
        BindUIData = Base.BindUIData, OnUIAction = Base.OnUIAction,
    }, { __index = Class })
    instance = setmetatable({ UI = API }, { __index = Preview })
    if instance.OnMount then instance:OnMount() end
    instance:BindUIData()
    if instance.OnShow then instance:OnShow() end
end
function host.command(input)
    if input.type == "state" then
        state = input.state
        instance:RefreshUI()
    elseif input.type == "event" and not disabled[input.node] then
        for _, handler in ipairs(handlers[input.node] or {}) do
            if handler.connection.Connected then handler.callback() end
        end
    end
end
function host.dispose()
    if instance then
        if instance.OnHide then instance:OnHide() end
        if instance.OnDispose then instance:OnDispose() end
    end
    handlers = {}
end
function host.output()
    local ids = {}
    for id, value in pairs(disabled) do if value then table.insert(ids, id) end end
    local result = { operations = operations, disabled = ids, logs = logs }
    operations, logs = {}, {}
    return result
end
-- Print is a host-owned closure, not stdout; messages remain framed JSON.
function host.print(...)
    local parts = {}
    for index = 1, select("#", ...) do parts[index] = tostring(select(index, ...)) end
    table.insert(logs, { kind = "output", message = table.concat(parts, "\t") })
end
return host
