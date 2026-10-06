import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { displayCases } from './fixtures/roblox-display-cases';
import { nodeDefinitions } from '../src/editor/roblox';
import { allNodes } from '../src/shared/uiDocument';

await mkdir('test-results/roblox-display', { recursive: true });
await writeFile('test-results/roblox-display/cases.json', JSON.stringify(displayCases, null, 2));
const data = displayCases.map(c => ({ id: c.id, className: c.className, property: c.property, value: c.value, root: c.property.startsWith('effect:') ? c.document.root : undefined }));
const templates = Object.fromEntries(displayCases.filter(c => c.property === '(default)').map(c => [c.className, c.document.root]));
const luau = `local Http=game:GetService('HttpService')
local cases=Http:JSONDecode([====[${JSON.stringify(data, (key, value) => key === 'previewImage' ? undefined : value)}]====])
local templates=Http:JSONDecode([====[${JSON.stringify(templates, (key, value) => key === 'previewImage' ? undefined : value)}]====])
local definitions=Http:JSONDecode([====[${JSON.stringify(nodeDefinitions)}]====])
local old=game.StarterGui:FindFirstChild('UIEditorDisplayQA')
if old then old:Destroy() end
local folder=Instance.new('Folder'); folder.Name='UIEditorDisplayQA'; folder.Parent=game.StarterGui
local errors={}
local function convert(key,value,kind)
 if kind=='color' then return Color3.fromHex(value) end
 if kind=='vector' then return Vector2.new(value.x,value.y) end
 if kind=='udim' then return UDim.new(value.scale,value.offset) end
 if kind=='udim2' then return UDim2.new(value.x.scale,value.x.offset,value.y.scale,value.y.offset) end
 if kind=='enum' then return Enum[key=='Font' and 'Font' or key][value] end
 return value
end
local nodeIndex=0
local function build(node,parent,c)
 local caseId=c.id
 local obj=Instance.new(node.className); obj.Name=node.name; obj:SetAttribute('QAId',caseId..':'..nodeIndex); obj:SetAttribute('QACase',caseId); nodeIndex+=1
 local props=table.clone(node.properties)
 if node.name=='Target' and definitions[node.className].properties[c.property] then props[c.property]=c.value end
 if node.className=='UITextSizeConstraint' then props.MinTextSize=math.min(props.MinTextSize,props.MaxTextSize) end
 if obj:IsA('GuiObject') then obj.BorderSizePixel=0 end
 if obj:IsA('ScreenGui') then obj.IgnoreGuiInset=true; obj.ResetOnSpawn=false end
 for key,value in pairs(props) do
  if node.className~='UIGradient' or (key~='ColorStart' and key~='ColorEnd' and key~='TransparencyStart' and key~='TransparencyEnd') then
   local ok,err=pcall(function() obj[key]=convert(key,value,definitions[node.className].properties[key].kind) end)
   if not ok then table.insert(errors,{caseId=caseId,property=key,error=tostring(err)}) end
  end
 end
 if node.className=='UIGradient' then
  obj.Color=ColorSequence.new(Color3.fromHex(props.ColorStart),Color3.fromHex(props.ColorEnd))
  obj.Transparency=NumberSequence.new({NumberSequenceKeypoint.new(0,props.TransparencyStart),NumberSequenceKeypoint.new(1,props.TransparencyEnd)})
 end
 obj.Parent=parent
 for _,child in ipairs(node.children) do build(child,obj,c) end
 return obj
end
for i,c in ipairs(cases) do
 nodeIndex=0
 local gui=build(c.root or templates[c.className],folder,c); gui.Name=c.id
 gui:SetAttribute('RequestedEnabled',gui.Enabled); gui.Enabled=i==1
end
folder:SetAttribute('AssignmentErrors',Http:JSONEncode(errors))
return Http:JSONEncode({cases=#cases,errors=errors})`;
await writeFile('test-results/roblox-display/setup.luau', luau);
const verify = await readFile(new URL('./roblox-display-verify.luau', import.meta.url), 'utf8');
await writeFile('test-results/roblox-display/verify-properties.luau', luau.slice(0, luau.indexOf('local old=')) + verify);
await writeFile('test-results/roblox-display/coverage.json', JSON.stringify(Object.fromEntries(Object.entries(nodeDefinitions).map(([name, definition]) => [name, Object.keys(definition.properties)])), null, 2));
console.log(JSON.stringify({ classes: Object.keys(nodeDefinitions).length, properties: Object.values(nodeDefinitions).reduce((n,d) => n + Object.keys(d.properties).length, 0), cases: displayCases.length, nodes: displayCases.reduce((n,c) => n + allNodes(c.document.root).length, 0) }));
