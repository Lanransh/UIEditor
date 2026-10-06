import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { conf, language } from 'monaco-editor/languages/definitions/lua/lua.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
monaco.languages.register({ id: 'luau' });
monaco.languages.setLanguageConfiguration('luau', {
  ...conf,
  indentationRules: {
    increaseIndentPattern: /\b(then|do|repeat|else)\s*$|\bfunction\b.*\)\s*$|[({]\s*$/,
    decreaseIndentPattern: /^\s*(end|else|elseif|until|[})])/,
  },
});
monaco.languages.setMonarchTokensProvider('luau', {
  ...language,
  keywords: [...language.keywords.filter(keyword => keyword !== 'goto'), 'continue', 'type', 'export', 'typeof', 'const'],
  tokenizer: {
    ...language.tokenizer,
    root: [
      [/\[([=]*)\[/, 'string', '@longString.$1'],
      [/`/, 'string', '@interpolation'],
      [/[A-Za-z_]\w*(?=\s*\()/, { cases: { '@keywords': 'keyword', '@default': 'function' } }],
      ...language.tokenizer.root,
    ],
    longString: [
      [/\]([=]*)\]/, { cases: { '$1==$S2': { token: 'string', next: '@pop' }, '@default': 'string' } }],
      [/[^\]]+/, 'string'], [/./, 'string'],
    ],
    interpolation: [
      [/\\./, 'string.escape'], [/`/, 'string', '@pop'],
      [/\{/, 'delimiter.bracket', '@interpolationExpression'], [/[^`\\{]+/, 'string'],
    ],
    interpolationExpression: [[/\{/, 'delimiter.bracket', '@push'], [/\}/, 'delimiter.bracket', '@pop'], { include: '@root' }],
  },
});
monaco.editor.defineTheme('ui-editor', {
  base: 'vs', inherit: true,
  rules: [{ token: 'function', foreground: '795E26' }],
  colors: { 'editor.background': '#FFFFFF', 'editorLineNumber.foreground': '#879493' },
});

export { monaco };
