// Commands are synchronous and must not mutate the input state. Return the same
// reference for a no-op; capture any values needed by undo inside the command.
export interface EditorCommand<State> {
  readonly label: string;
  execute(state: State): State;
  undo(state: State): State;
}

export class CommandHistory<State> {
  private readonly undoStack: EditorCommand<State>[] = [];
  private readonly redoStack: EditorCommand<State>[] = [];

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label ?? null; }
  get redoLabel() { return this.redoStack.at(-1)?.label ?? null; }

  execute(command: EditorCommand<State>, state: State): State {
    const next = command.execute(state);
    if (next === state) return state;
    this.undoStack.push(command);
    this.redoStack.length = 0;
    return next;
  }

  undo(state: State): State {
    const command = this.undoStack.at(-1);
    if (!command) return state;
    const next = command.undo(state);
    this.undoStack.pop();
    this.redoStack.push(command);
    return next;
  }

  redo(state: State): State {
    const command = this.redoStack.at(-1);
    if (!command) return state;
    const next = command.execute(state);
    this.redoStack.pop();
    this.undoStack.push(command);
    return next;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
