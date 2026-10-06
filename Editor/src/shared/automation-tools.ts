import { toolNames } from './automation';
const properties = {
  sessionId: { type: 'string' }, revision: { type: 'integer' }, id: { type: 'string' }, parentId: { type: 'string' },
  name: { type: 'string' }, className: { type: 'string' }, match: { enum: ['exact', 'contains'] }, recursive: { type: 'boolean' },
  depth: { type: 'integer', minimum: 0, maximum: 64 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 },
  view: { enum: ['design', 'runtime'] }, detail: { enum: ['summary', 'full'] }, language: { type: 'string' }, source: { type: 'string' },
  integration: { type: 'string' }, kind: { enum: ['source', 'integration'] },
  dryRun: { type: 'boolean' }, label: { type: 'string' }, relativePath: { type: 'string' }, discardChanges: { type: 'boolean' },
  action: { enum: ['run', 'stop', 'reset'] }, cursor: { type: 'integer', minimum: 0 }, consoleCursor: { type: 'integer', minimum: 0 },
};
const fields: Record<string, string[]> = {
  'uie.editor.get_state': ['detail'], 'uie.editor.get_capabilities': [],
  'uie.nodes.get': ['id', 'depth', 'view'], 'uie.nodes.find': ['name', 'className', 'match', 'parentId', 'recursive', 'offset', 'limit', 'view'],
  'uie.code.execute': ['sessionId', 'revision', 'language', 'source', 'dryRun', 'label'],
  'uie.scripts.get': ['kind'], 'uie.scripts.set': ['sessionId', 'revision', 'source', 'integration', 'label'],
  'uie.document.list': [], 'uie.document.new': ['sessionId', 'revision', 'name', 'discardChanges'],
  'uie.document.open': ['sessionId', 'revision', 'relativePath', 'discardChanges'], 'uie.document.save': ['sessionId', 'revision', 'relativePath'],
  'uie.runtime.control': ['sessionId', 'revision', 'action'], 'uie.runtime.click': ['sessionId', 'revision', 'id'],
  'uie.debug.get_diagnostics': ['cursor', 'consoleCursor'], 'uie.debug.screenshot': [],
};
const descriptions = [
  'Read active project/session, revision and optionally full design document.',
  'Discover current project language/version, node definitions, parenting rules, editing and runtime APIs. Read before executing code.',
  'Read node by stable ID with properties and bounded subtree depth.',
  'Find nodes by name (exact by default), class and parent scope; filters intersect; paginated tree order.',
  'Execute sandboxed authoring code for the current project language. All changes commit as one undoable transaction; dryRun never changes history. No filesystem/network or undo/redo API.',
  'Read interaction (source) and preview integration (integration) code. Optional kind selects one; omitted returns both.',
  'Edit interaction source and/or preview integration source directly. Omitted script remains unchanged. Requires current session/revision and edit mode; changes remain undoable in the App.',
  'List interfaces in the active project.', 'Create interface; dirty document requires explicit discardChanges or save first.',
  'Open project-relative interface; dirty document requires explicit discardChanges or save first.',
  'Save current interface, or create a new project-relative interface without overwrite.',
  'Run, stop or reset preview. Run makes authoring read-only; stop returns to editing.',
  'Simulate button activation using stable ID; hidden/disabled buttons do not dispatch.',
  'Read bounded console/preview diagnostics since cursor; reports truncation.', 'Capture rendered UI canvas as PNG, without selection decorations.',
];
export const definitions = toolNames.map((name, index) => ({ name, description: descriptions[index], inputSchema: { type: 'object', properties: Object.fromEntries(fields[name].map(key => [key, properties[key as keyof typeof properties]])), additionalProperties: false, required: fields[name].filter(key => ['sessionId', 'revision'].includes(key) || (name === 'uie.code.execute' && ['language', 'source'].includes(key)) || (name === 'uie.nodes.get' && key === 'id') || (name === 'uie.runtime.click' && key === 'id') || (name === 'uie.runtime.control' && key === 'action') || (name === 'uie.document.open' && key === 'relativePath') || (name === 'uie.document.new' && key === 'name')) } }));

export function validateTool(name: string, args: unknown) {
  const tool = definitions.find(tool => tool.name === name);
  if (!tool) throw new Error('Unknown tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是对象。');
  const values = args as Record<string, unknown>;
  if (name === 'uie.scripts.set' && values.source === undefined && values.integration === undefined) throw new Error('必须提供 source（交互代码）或 integration（接入代码）。');
  for (const key of tool.inputSchema.required) if (values[key] === undefined) throw new Error(`缺少参数 ${key}`);
  for (const [key, value] of Object.entries(values)) {
    const definition = tool.inputSchema.properties[key] as { type?: string; enum?: unknown[]; minimum?: number; maximum?: number } | undefined;
    if (!definition) throw new Error(`不支持的参数 ${key}`);
    if (value === undefined) continue;
    if (definition.enum && !definition.enum.includes(value)) throw new Error(`参数 ${key} 无效。`);
    if (definition.type === 'integer') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || (definition.minimum !== undefined && value < definition.minimum) || (definition.maximum !== undefined && value > definition.maximum)) throw new Error(`整数参数 ${key} 无效。`);
    } else if (definition.type && typeof value !== definition.type) throw new Error(`参数 ${key} 类型无效。`);
  }
}
