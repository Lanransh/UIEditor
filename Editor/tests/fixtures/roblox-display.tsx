import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentCanvas } from '../../src/editor/Canvas';
import { robloxStrategy as strategy } from '../../src/editor/roblox';
import type { DocumentEditor } from '../../src/editor/useDocumentEditor';
import { displayCases } from './roblox-display-cases';
import '../../src/styles.css';

declare global { interface Window { displayQA: { cases: typeof displayCases; show: (index: number) => void } } }
function Fixture() {
  const [index, show] = useState(0);
  window.displayQA = { cases: displayCases, show };
  const document = displayCases[index].document;
  const editor = { strategy, document, selected: document.root, busy: false, select: () => {}, execute: () => {} } as unknown as DocumentEditor;
  return <DocumentCanvas editor={editor} />;
}
document.body.innerHTML = '<style>#qa-root > .canvas { width:1500px; flex-shrink:0 } .canvas-hint { display:none }</style><div id="qa-root" style="height:850px;width:1500px;display:flex"></div>';
createRoot(document.getElementById('qa-root')!).render(<Fixture />);
