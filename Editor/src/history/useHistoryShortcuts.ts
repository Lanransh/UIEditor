import { useEffect } from 'react';

export function useHistoryShortcuts({ undo, redo, canUndo, canRedo }: {
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        if (event.shiftKey ? !canRedo : !canUndo) return;
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (key === 'y' && !event.shiftKey) {
        if (!canRedo) return;
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, canUndo, canRedo]);
}
