import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditorHistory } from '../../src/history/useEditorHistory';
import { useHistoryShortcuts } from '../../src/history/useHistoryShortcuts';

// Mounted only by the smoke test, never shipped as an application edit feature.
function HistoryFixture() {
  const history = useEditorHistory({ value: 0 });
  useHistoryShortcuts(history);
  return <section aria-label="历史测试">
    <output aria-label="历史状态">{JSON.stringify([history.state.value, history.canUndo, history.canRedo])}</output>
    <button onClick={() => history.execute({ label: '加一', execute: state => ({ value: state.value + 1 }), undo: state => ({ value: state.value - 1 }) })}>测试编辑</button>
    <button onClick={() => {
      const command = { label: '加一', execute: (state: { value: number }) => ({ value: state.value + 1 }), undo: (state: { value: number }) => ({ value: state.value - 1 }) };
      history.execute(command);
      history.execute(command);
    }}>测试连续编辑</button>
    <button onClick={history.undo}>测试撤销</button>
    <button onClick={history.redo}>测试重做</button>
    <button onClick={history.clear}>测试清空</button>
    <button onClick={() => history.reset({ value: 10 })}>测试加载</button>
    <input aria-label="测试文本" />
    <div contentEditable suppressContentEditableWarning aria-label="测试富文本">text</div>
  </section>;
}
function SessionFixture() {
  const [session, setSession] = useState(0);
  return <>
    <HistoryFixture key={session} />
    <button onClick={() => setSession(value => value + 1)}>测试切换工程</button>
    <button onClick={() => { root.unmount(); container.remove(); }}>结束历史测试</button>
  </>;
}
const container = document.createElement('div');
container.style.cssText = 'position:fixed;inset:50px;z-index:100;background:white';
document.body.append(container);
const root = createRoot(container);
root.render(<StrictMode><SessionFixture /></StrictMode>);
