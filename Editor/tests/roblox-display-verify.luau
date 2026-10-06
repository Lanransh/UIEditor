-- The generator prepends cases, templates and definitions. Run the generated file.
local folder=game.Players.LocalPlayer.PlayerGui.UIEditorDisplayQA
local differences={};local checked=0
local function convert(key,value,kind)
 if kind=='color' then return Color3.fromHex(value) end
 if kind=='vector' then return Vector2.new(value.x,value.y) end
 if kind=='udim' then return UDim.new(value.scale,value.offset) end
 if kind=='udim2' then return UDim2.new(value.x.scale,value.x.offset,value.y.scale,value.y.offset) end
 if kind=='enum' then return Enum[key=='Font' and 'Font' or key][value] end
 return value
end
local function find(node)
 if node.name=='Target' then return node end
 for _,child in node.children do local found=find(child);if found then return found end end
end
for _,c in cases do
 local source=find(c.root or templates[c.className]);local props=table.clone(source.properties)
 if definitions[c.className].properties[c.property] then props[c.property]=c.value end
 local obj=c.className=='ScreenGui' and folder[c.id] or folder[c.id]:FindFirstChild('Target',true)
 if c.className=='UITextSizeConstraint' then props.MinTextSize=math.min(props.MinTextSize,props.MaxTextSize) end
 for key,value in props do
  local actual;local expected
  if c.className=='UIGradient' and (key=='ColorStart' or key=='ColorEnd') then
   actual=obj.Color.Keypoints[key=='ColorStart' and 1 or 2].Value;expected=Color3.fromHex(value)
  elseif c.className=='UIGradient' and (key=='TransparencyStart' or key=='TransparencyEnd') then
   actual=obj.Transparency.Keypoints[key=='TransparencyStart' and 1 or 2].Value;expected=value
  elseif c.className=='ScreenGui' and key=='Enabled' then actual=obj:GetAttribute('RequestedEnabled');expected=value
  else actual=obj[key];expected=convert(key,value,definitions[c.className].properties[key].kind) end
  checked+=1
  local same=actual==expected
  if typeof(actual)=='number' then same=math.abs(actual-expected)<.0001 end
  if not same then table.insert(differences,{case=c.id,className=c.className,property=key,actual=tostring(actual),expected=tostring(expected)}) end
 end
end
return Http:JSONEncode({checked=checked,differences=differences})
