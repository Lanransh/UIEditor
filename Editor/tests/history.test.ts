import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandHistory, type EditorCommand } from '../src/history/CommandHistory';

type State = { values: string[] };
function append(value: string): EditorCommand<State> {
  return {
    label: `添加 ${value}`,
    execute: state => ({ values: [...state.values, value] }),
    undo: state => ({ values: state.values.slice(0, -1) }),
  };
}

test('空历史保持状态，多步撤销按逆序，重做按原序', () => {
  const history = new CommandHistory<State>();
  const initial = { values: [] };
  assert.equal(history.undo(initial), initial);
  assert.equal(history.redo(initial), initial);
  assert.equal(history.undoLabel, null);
  assert.equal(history.redoLabel, null);
  let state = history.execute(append('A'), initial);
  state = history.execute(append('B'), state);
  assert.deepEqual(initial, { values: [] });
  assert.equal(history.undoLabel, '添加 B');
  state = history.undo(state);
  assert.deepEqual(state.values, ['A']);
  assert.equal(history.redoLabel, '添加 B');
  state = history.undo(state);
  assert.deepEqual(state.values, []);
  assert.equal(history.canUndo, false);
  state = history.redo(state);
  assert.deepEqual(state.values, ['A']);
  state = history.redo(state);
  assert.deepEqual(state.values, ['A', 'B']);
  assert.equal(history.canRedo, false);
});

test('无变化命令不入栈，也不清除重做；新编辑清除重做分支', () => {
  const history = new CommandHistory<State>();
  const noOp: EditorCommand<State> = { label: '无变化', execute: state => state, undo: state => state };
  let state: State = { values: [] };
  assert.equal(history.execute(noOp, state), state);
  assert.equal(history.canUndo, false);
  state = history.execute(append('A'), state);
  state = history.undo(state);
  assert.equal(history.execute(noOp, state), state);
  assert.equal(history.canRedo, true);
  state = history.execute(append('B'), state);
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(state), state);
  assert.deepEqual(state.values, ['B']);
});

test('clear 清空双栈，独立历史互不影响', () => {
  const first = new CommandHistory<State>();
  const second = new CommandHistory<State>();
  let state = first.execute(append('A'), { values: [] });
  state = first.execute(append('B'), state);
  state = first.undo(state);
  first.clear();
  assert.equal(first.canUndo, false);
  assert.equal(first.canRedo, false);
  assert.equal(first.undoLabel, null);
  assert.equal(first.redoLabel, null);
  assert.equal(first.undo(state), state);
  assert.equal(second.canUndo, false);
});

test('命令抛错时保留历史，可修正后继续撤销和重做', () => {
  const history = new CommandHistory<State>();
  let failExecute = false;
  let failUndo = true;
  const command: EditorCommand<State> = {
    label: '可能失败',
    execute(state) {
      if (failExecute) throw new Error('execute failed');
      return { values: [...state.values, 'A'] };
    },
    undo(state) {
      if (failUndo) throw new Error('undo failed');
      return { values: state.values.slice(0, -1) };
    },
  };
  let state = history.execute(command, { values: [] });
  assert.throws(() => history.undo(state), /undo failed/);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);
  failUndo = false;
  state = history.undo(state);
  failExecute = true;
  assert.throws(() => history.execute(command, state), /execute failed/);
  assert.throws(() => history.redo(state), /execute failed/);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  failExecute = false;
  assert.deepEqual(history.redo(state).values, ['A']);
});
