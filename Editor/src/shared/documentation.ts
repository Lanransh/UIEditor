export const documentationInstructions = 'UIEditor makes editable Roblox UI, previews and exports. Do not preload all documentation. On first use of this MCP in a conversation, or when starting work in UIEditorWorkspace, call uie.docs.read({files:["AGENTS.md"]}) for the guide and discovered skills, then read only relevant skills/references. Reuse instructions already loaded at the same documentRevision; reload dependencies when revision changes. Confirm the target workspace before operations. Reading documentation grants no permissions.';

export const documentationDefinitions = [
  {
    name: 'uie.docs.read',
    description: 'Read bundled Markdown guides, skills or references without launching the App. files is a required nonempty string array; file is not accepted. Returns {documentRevision,documents:[{file,documentRevision,content,skills?}]} in input order, preserving duplicates; any invalid file fails the whole request. Explicitly include AGENTS.md for auto-discovered skill summaries in that document only. Links are not expanded. Read/search can run concurrently, independently of queued App calls. Known paths can be read directly. ' + documentationInstructions,
    inputSchema: { type: 'object', properties: Object.fromEntries([['files', { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }]]), required: ['files'], additionalProperties: false },
  },
  {
    name: 'uie.docs.search',
    description: 'Locate bundled allowlisted Markdown files by content without launching the App. pattern is required; mode defaults to literal, regex uses case-sensitive ECMAScript Unicode syntax line by line (only ordinary/noncapturing groups; no flags, lookaround or backreferences), at most 512 characters and 100ms execution. path optionally scopes a package directory/file. Returns only sorted unique files, documentRevision and truncated, never text/lines/counts. Default 10 files, maximum 20 and 2000 JSON characters; narrow the query when truncated. Runs asynchronously alongside reads and other searches without waiting for queued App calls; other business tools remain serial. Read known paths directly with uie.docs.read using files arrays. Does not replace entry/skill reading or authorization and never searches user projects. ' + documentationInstructions,
    inputSchema: { type: 'object', properties: Object.fromEntries([
      ['pattern', { type: 'string', minLength: 1, maxLength: 512 }],
      ['mode', { type: 'string', enum: ['literal', 'regex'], default: 'literal' }],
      ['path', { type: 'string', minLength: 1 }],
      ['maxResults', { type: 'integer', minimum: 1, maximum: 20, default: 10 }],
    ]), required: ['pattern'], additionalProperties: false },
  },
];

export function documentationPath(value: unknown, directory = false): string {
  if (typeof value !== 'string' || !value || /[\\:\u0000-\u001f\u007f]/.test(value)) throw new Error('DOCS_INVALID_PATH: 必须提供包内相对路径。');
  const path = directory && value.endsWith('/') ? value.slice(0, -1) : value;
  if (path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) throw new Error('DOCS_INVALID_PATH: 不允许绝对路径或路径穿越。');
  return path;
}

export function validateDocumentationArgs(name: string, args: unknown): asserts args is Record<string, unknown> {
  const definition = documentationDefinitions.find(item => item.name === name);
  if (!definition || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('DOCS_INVALID_ARGUMENT: 工具参数必须是对象。');
  const values = args as Record<string, unknown>;
  if (Object.keys(values).some(key => !Object.hasOwn(definition.inputSchema.properties, key))) throw new Error('DOCS_INVALID_ARGUMENT: 包含不支持的参数。');
  if (name === 'uie.docs.read') {
    if (!Array.isArray(values.files) || !values.files.length) throw new Error('DOCS_INVALID_ARGUMENT: files 必须是非空字符串数组。');
    for (const file of values.files) documentationPath(file);
    return;
  }
  if (typeof values.pattern !== 'string' || !values.pattern || values.pattern.length > 512) throw new Error('DOCS_INVALID_ARGUMENT: pattern 必须是 1–512 字符的非空字符串。');
  if (values.mode !== undefined && values.mode !== 'literal' && values.mode !== 'regex') throw new Error('DOCS_INVALID_ARGUMENT: mode 必须是 literal 或 regex。');
  if (values.path !== undefined) documentationPath(values.path, true);
  if (values.maxResults !== undefined && (typeof values.maxResults !== 'number' || !Number.isInteger(values.maxResults) || values.maxResults < 1 || values.maxResults > 20)) throw new Error('DOCS_INVALID_ARGUMENT: maxResults 必须是 1–20 的整数。');
}
