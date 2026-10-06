import { useEffect, useRef, useState } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { rewardExample } from './scriptExample';

export function ScriptPanel({ editor, mode }: { editor: DocumentEditor; mode: 'source' | 'integration' }) {
  const [scroll, setScroll] = useState(0);
  const text = editor.document.scripts[mode];
  const label = mode === 'source' ? '交互脚本' : '接入脚本';
  return <section className="script-panel" aria-label={`${label}面板`}>
    <div className="script-code"><pre aria-hidden="true" style={{ transform: `translateY(-${scroll}px)` }}>{text.split('\n').map((line, index) => index + 1).join('\n')}</pre><textarea aria-label={label} spellCheck={false} value={text} readOnly={editor.busy} onScroll={event => setScroll(event.currentTarget.scrollTop)} onChange={event => {
      const value = event.target.value;
      editor.execute(`修改${label}`, document => ({ ...document, scripts: { ...document.scripts, [mode]: value } }));
    }} /></div>
    <div className="script-help"><span>{mode === 'source' ? '交互类继承 FCUICompClass；使用 OnReady 绑定节点与事件，Render 更新展示。' : '接入类继承交互类；在 Ctor 中定义临时 Config、State，在动作处理中维护状态并 RefreshUI。'}</span><button disabled={editor.busy} onClick={() => { if (window.confirm('载入奖励示例将替换当前界面，可通过撤销恢复。')) editor.execute('载入奖励脚本示例', () => rewardExample()); }}>载入奖励示例</button></div>
  </section>;
}

export function RuntimeOutput({ editor }: { editor: DocumentEditor }) {
  const logs = editor.runtime.logs;
  const output = useRef<HTMLDivElement>(null);
  useEffect(() => { if (output.current) output.current.scrollTop = output.current.scrollHeight; }, [logs]);
  return <section className="runtime-output" aria-label="运行输出"><div ref={output} className="script-logs" role="log" aria-label="运行日志">{logs.length ? logs.map((log, index) => <pre key={index} className={log.kind}>[{({ error: '错误', action: '动作', output: '输出', warning: '警告' })[log.kind]}] {log.message}</pre>) : <p>运行后显示打印、警告、动作和错误。</p>}</div></section>;
}
