import { useCallback, useState } from 'react';
import { CommandHistory, type EditorCommand } from './CommandHistory';

export function useEditorHistory<State>(initialState: State) {
  const [session] = useState(() => ({ state: initialState, history: new CommandHistory<State>() }));
  const [, render] = useState(0);
  const refresh = useCallback(() => render(revision => revision + 1), []);

  const execute = useCallback((command: EditorCommand<State>) => {
    const next = session.history.execute(command, session.state);
    if (next === session.state) return;
    session.state = next;
    refresh();
  }, [session, refresh]);

  const undo = useCallback(() => {
    if (!session.history.canUndo) return;
    session.state = session.history.undo(session.state);
    refresh();
  }, [session, refresh]);

  const redo = useCallback(() => {
    if (!session.history.canRedo) return;
    session.state = session.history.redo(session.state);
    refresh();
  }, [session, refresh]);

  const clear = useCallback(() => {
    session.history.clear();
    refresh();
  }, [session, refresh]);

  // Loading/replacing a document starts a new history, rather than recording an edit.
  const reset = useCallback((state: State) => {
    session.state = state;
    session.history.clear();
    refresh();
  }, [session, refresh]);

  return {
    state: session.state, execute, undo, redo, clear, reset,
    canUndo: session.history.canUndo, canRedo: session.history.canRedo,
    undoLabel: session.history.undoLabel, redoLabel: session.history.redoLabel,
  };
}
