local H=game:GetService('HttpService')
local f=game.Players.LocalPlayer.PlayerGui.UIEditorDisplayQA
local first,last=0,59
local out={}
for i=first,last do
 local g=f:FindFirstChild('case-'..i)
 if g then
  local rows={}
  for _,v in g:GetDescendants() do
   if v:IsA('GuiObject') then table.insert(rows,{id=v:GetAttribute('QAId'),className=v.ClassName,rect={x=v.AbsolutePosition.X,y=v.AbsolutePosition.Y,width=v.AbsoluteSize.X,height=v.AbsoluteSize.Y},visible=v.Visible,rotation=v.AbsoluteRotation}) end
  end
  table.insert(out,{id=g.Name,nodes=rows})
 end
end
return H:JSONEncode(out)
