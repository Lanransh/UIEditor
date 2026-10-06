/// <reference types="vite/client" />

declare module 'monaco-editor/languages/definitions/lua/lua.js' {
  export const conf: import('monaco-editor').languages.LanguageConfiguration;
  export const language: import('monaco-editor').languages.IMonarchLanguage & { keywords: string[] };
}
