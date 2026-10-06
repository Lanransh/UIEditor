import { useEffect, useState } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { allNodes } from '../shared/uiDocument';
import { validateJSON } from '../shared/runtime';
import { rewardExample } from './scriptExample';

export function ScriptPanel({ editor }: { editor: DocumentEditor }) {
  const [tab, setTab] = useState<'source' | 'config' | 'references' | 'state' | 'logs'>('source');
  const [draft, setDraft] = useState(JSON.stringify(editor.document.scripts.state, null, 2));
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [scroll, setScroll] = useState(0);
  const runtime = editor.runtime;
  useEffect(() => { if (runtime.ready) setDraft(JSON.stringify(editor.document.scripts.state, null, 2)); }, [runtime.ready]);
  useEffect(() => { setDraft(JSON.stringify(editor.document.scripts.state, null, 2)); setError(''); }, [editor.document.id, editor.document.scripts.state]);
  useEffect(() => { if (runtime.logs.some(log => log.kind === 'error')) setTab('logs'); }, [runtime.logs]);
  function applyState() {
    try {
      const state = validateJSON(JSON.parse(draft));
      setError('');
      if (runtime.active) void runtime.applyState(draft).catch(cause => setError(String(cause)));
      else editor.execute('修改初始模拟状态', document => ({ ...document, scripts: { ...document.scripts, state } }));
    } catch (cause) { setError(String(cause)); }
  }
  const text = tab === 'source' || tab === 'config' ? editor.document.scripts[tab] : draft;
  return <section className="script-panel" aria-label="界面脚本">
    <nav className="script-tabs">{(['source', 'config', 'references', 'state', 'logs'] as const).map((item, index) => <button key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setScroll(0); }}>{['界面脚本', '配置脚本', '节点引用', '模拟状态', '运行日志'][index]}</button>)}</nav>
    {error && <div className="error" role="alert">{error}</div>}
    {(tab === 'source' || tab === 'config' || tab === 'state') && <>
      <div className="script-code"><pre aria-hidden="true" style={{ transform: `translateY(-${scroll}px)` }}>{text.split('\n').map((line, index) => index + 1).join('\n')}</pre><textarea key={tab} aria-label={tab === 'source' ? '界面基类脚本' : tab === 'config' ? '配置脚本' : '模拟状态 JSON'} spellCheck={false} value={text} readOnly={tab !== 'state' && editor.busy} onScroll={event => setScroll(event.currentTarget.scrollTop)} onChange={event => {
        const value = event.target.value;
        if (tab === 'state') setDraft(value);
        else if (tab === 'source' || tab === 'config') editor.execute('修改脚本', document => ({ ...document, scripts: { ...document.scripts, [tab]: value } }));
      }} /></div>
      {tab === 'state' && <button disabled={runtime.active && !runtime.ready} onClick={applyState}>{runtime.active ? '应用到运行会话' : '保存初始状态'}</button>}
    </>}
    {tab === 'references' && <div className="script-references">
      <p>选择节点，填写英文引用名。脚本使用引用名，不依赖节点名称或层级。</p>
      <input aria-label="节点引用名" placeholder="ClaimButton" value={reference} disabled={editor.busy} onChange={event => setReference(event.target.value)} />
      <button disabled={editor.busy || !/^[A-Za-z][A-Za-z0-9_]*$/.test(reference)} onClick={() => { editor.execute('绑定脚本引用', document => ({ ...document, scripts: { ...document.scripts, references: { ...document.scripts.references, [reference]: editor.selected.id } } })); setReference(''); }}>绑定到 {editor.selected.name}</button>
      {Object.entries(editor.document.scripts.references).map(([name, id]) => <div key={name}><code>{name}</code><span>{allNodes(editor.document.root).find(node => node.id === id)?.name ?? '引用已失效'}</span><button disabled={editor.busy} onClick={() => editor.execute('删除脚本引用', document => { const references = { ...document.scripts.references }; delete references[name]; return { ...document, scripts: { ...document.scripts, references } }; })}>移除</button></div>)}
    </div>}
    {tab === 'logs' && <div className="script-logs" role="log">{runtime.logs.length ? runtime.logs.map((log, index) => <pre key={index} className={log.kind}>[{log.kind === 'error' ? '错误' : log.kind === 'action' ? '动作' : '输出'}] {log.message}</pre>) : <p>运行后显示脚本输出、业务动作和错误。</p>}</div>}
    <div className="script-help"><span>UI:OnMount() · UI:Render(state) · self.UI:Get/Set/On/SetEnabled</span><button disabled={editor.busy} onClick={() => { if (window.confirm('载入奖励示例将替换当前界面，可通过撤销恢复。')) editor.execute('载入奖励脚本示例', () => rewardExample()); }}>载入奖励示例</button></div>
  </section>;
}
