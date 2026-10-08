import { useEffect, useRef } from 'react';
import type { DocumentEditor } from './useDocumentEditor';
import { rewardExample } from './scriptExample';
import { monaco } from './codeEditor';

export function ScriptPanel({ editor, mode }: { editor: DocumentEditor; mode: 'source' | 'integration' }) {
  const container = useRef<HTMLDivElement>(null);
  const code = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const current = useRef(editor);
  current.current = editor;
  const updating = useRef(false);
  const text = editor.document.scripts[mode];
  const label = mode === 'source' ? '交互脚本' : '接入脚本';
  useEffect(() => {
    const instance = monaco.editor.create(container.current!, {
      value: current.current.document.scripts[mode], language: 'luau', theme: 'ui-editor',
      ariaLabel: label, automaticLayout: true, fontSize: 12, lineHeight: 20,
      editContext: false,
      fontFamily: 'Consolas, monospace', minimap: { enabled: false },
      tabSize: 4, insertSpaces: true, autoIndent: 'full', scrollBeyondLastLine: false,
      quickSuggestions: false, suggestOnTriggerCharacters: false, wordBasedSuggestions: 'off',
      readOnly: current.current.busy, domReadOnly: current.current.busy,
    });
    code.current = instance;
    const subscription = instance.onDidChangeModelContent(() => {
      if (updating.current) return;
      const value = instance.getValue();
      current.current.execute(`修改${label}`, document => ({ ...document, scripts: { ...document.scripts, [mode]: value } }));
    });
    // Both keyboard and menu undo use the document history.
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => { if (!current.current.busy) current.current.history.undo(); });
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => { if (!current.current.busy) current.current.history.redo(); });
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => { if (!current.current.busy) current.current.history.redo(); });
    return () => { subscription.dispose(); instance.getModel()?.dispose(); instance.dispose(); code.current = null; };
  }, [mode, label, editor.document.id]);
  useEffect(() => {
    const instance = code.current;
    if (!instance) return;
    instance.updateOptions({ readOnly: editor.busy, domReadOnly: editor.busy });
    if (instance.getValue() !== text) {
      updating.current = true;
      const view = instance.saveViewState();
      instance.setValue(text);
      if (view) instance.restoreViewState(view);
      updating.current = false;
    }
  }, [text, editor.busy]);
  return <section className="script-panel" aria-label={`${label}面板`}>
    <div className="script-code" ref={container} />
    <div className="script-help"><span>{mode === 'source' ? '交互类继承 FCUICompClass；使用 OnReady 绑定节点与事件，Render 更新展示。' : '接入类继承交互类；在 Ctor 中定义临时 Config、State，在动作处理中维护状态并 RefreshUI。'}</span><button disabled={editor.busy} onClick={() => { if (window.confirm('载入奖励示例将替换当前界面，可通过撤销恢复。')) editor.execute('载入奖励脚本示例', () => rewardExample()); }}>载入奖励示例</button></div>
  </section>;
}

export function RuntimeOutput({ editor }: { editor: DocumentEditor }) {
  const logs = editor.runtime.logs;
  const output = useRef<HTMLDivElement>(null);
  useEffect(() => { if (output.current) output.current.scrollTop = output.current.scrollHeight; }, [logs]);
  return <section className="runtime-output" aria-label="运行输出"><div ref={output} className="script-logs" role="log" aria-label="运行日志">{logs.length ? logs.map((log, index) => <pre key={index} className={log.kind}>[{({ input: '输入', error: '错误', action: '动作', output: '输出', warning: '警告' })[log.kind]}] {log.message}</pre>) : <p>运行后显示打印、警告、动作和错误。</p>}</div></section>;
}
