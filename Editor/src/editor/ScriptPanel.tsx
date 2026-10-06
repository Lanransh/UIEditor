import { useEffect, useRef, useState } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { allNodes } from '../shared/uiDocument';
import { validateJSON } from '../shared/runtime';
import { rewardExample } from './scriptExample';

export function ScriptPanel({ editor, mode }: { editor: DocumentEditor; mode: 'source' | 'integration' }) {
  const [tab, setTab] = useState<'source' | 'integration' | 'config' | 'references' | 'state'>(mode);
  const [draft, setDraft] = useState(JSON.stringify(editor.document.scripts.state, null, 2));
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [scroll, setScroll] = useState(0);
  const runtime = editor.runtime;
  useEffect(() => { if (runtime.ready) setDraft(JSON.stringify(editor.document.scripts.state, null, 2)); }, [runtime.ready]);
  useEffect(() => { setDraft(JSON.stringify(editor.document.scripts.state, null, 2)); setError(''); }, [editor.document.id, editor.document.scripts.state]);
  function applyState() {
    try {
      const state = validateJSON(JSON.parse(draft));
      setError('');
      if (runtime.active) void runtime.applyState(draft).catch(cause => setError(String(cause)));
      else editor.execute('修改初始模拟状态', document => ({ ...document, scripts: { ...document.scripts, state } }));
    } catch (cause) { setError(String(cause)); }
  }
  const text = tab === 'source' || tab === 'integration' || tab === 'config' ? editor.document.scripts[tab] : draft;
  return <section className="script-panel" aria-label={mode === 'source' ? '界面脚本面板' : '模拟接入脚本面板'}>
    <nav className="script-tabs">{([mode, ...(mode === 'source' ? ['config', 'references'] as const : ['state'] as const)]).map(item => <button key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setScroll(0); }}>{({ source: '代码', integration: '代码', config: '配置脚本', references: '节点引用', state: '模拟状态' })[item]}</button>)}</nav>
    {error && <div className="error" role="alert">{error}</div>}
    {(tab === 'source' || tab === 'integration' || tab === 'config' || tab === 'state') && <>
      <div className="script-code"><pre aria-hidden="true" style={{ transform: `translateY(-${scroll}px)` }}>{text.split('\n').map((line, index) => index + 1).join('\n')}</pre><textarea key={tab} aria-label={tab === 'source' ? '界面基类脚本' : tab === 'integration' ? '模拟接入脚本代码' : tab === 'config' ? '配置脚本' : '模拟状态 JSON'} spellCheck={false} value={text} readOnly={tab !== 'state' && editor.busy} onScroll={event => setScroll(event.currentTarget.scrollTop)} onChange={event => {
        const value = event.target.value;
        if (tab === 'state') setDraft(value);
        else if (tab === 'source' || tab === 'integration' || tab === 'config') editor.execute('修改脚本', document => ({ ...document, scripts: { ...document.scripts, [tab]: value } }));
      }} /></div>
      {tab === 'state' && <button disabled={runtime.active && !runtime.ready} onClick={applyState}>{runtime.active ? '应用到运行会话' : '保存初始状态'}</button>}
    </>}
    {tab === 'references' && <div className="script-references">
      <p>选择节点，填写英文引用名。脚本使用引用名，不依赖节点名称或层级。</p>
      <input aria-label="节点引用名" placeholder="ClaimButton" value={reference} disabled={editor.busy} onChange={event => setReference(event.target.value)} />
      <button disabled={editor.busy || !/^[A-Za-z][A-Za-z0-9_]*$/.test(reference)} onClick={() => { editor.execute('绑定脚本引用', document => ({ ...document, scripts: { ...document.scripts, references: { ...document.scripts.references, [reference]: editor.selected.id } } })); setReference(''); }}>绑定到 {editor.selected.name}</button>
      {Object.entries(editor.document.scripts.references).map(([name, id]) => <div key={name}><code>{name}</code><span>{allNodes(editor.document.root).find(node => node.id === id)?.name ?? '引用已失效'}</span><button disabled={editor.busy} onClick={() => editor.execute('删除脚本引用', document => { const references = { ...document.scripts.references }; delete references[name]; return { ...document, scripts: { ...document.scripts, references } }; })}>移除</button></div>)}
    </div>}
    <div className="script-help"><span>{mode === 'source' ? 'UI:OnMount() · UI:Render(state) · self.UI:Get/Set/On/SetEnabled' : 'Preview:GetUIConfig/GetUIState/BindUIData/OnUIAction · self.Config / self.State'}</span><span>支持 UDim / UDim2 / Vector2 / Color3 / Enum 的构造、字段与 UI 属性读写；print / warn / error 输出到下方。</span><button disabled={editor.busy} onClick={() => { if (window.confirm('载入奖励示例将替换当前界面，可通过撤销恢复。')) editor.execute('载入奖励脚本示例', () => rewardExample()); }}>载入奖励示例</button></div>
  </section>;
}

export function RuntimeOutput({ editor }: { editor: DocumentEditor }) {
  const logs = editor.runtime.logs;
  const output = useRef<HTMLDivElement>(null);
  useEffect(() => { if (output.current) output.current.scrollTop = output.current.scrollHeight; }, [logs]);
  return <section className="runtime-output" aria-label="运行输出"><div ref={output} className="script-logs" role="log" aria-label="运行日志">{logs.length ? logs.map((log, index) => <pre key={index} className={log.kind}>[{({ error: '错误', action: '动作', output: '输出', warning: '警告' })[log.kind]}] {log.message}</pre>) : <p>运行后显示打印、警告、动作和错误。</p>}</div></section>;
}
