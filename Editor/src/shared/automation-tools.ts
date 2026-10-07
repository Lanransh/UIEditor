import { toolNames } from './automation';
const uuid = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' };
const target = { type: 'object', properties: { projectId: uuid, library: { enum: ['project', 'templates', 'permanent'] }, documentId: uuid }, required: ['documentId'], additionalProperties: false };
const properties = {
  projectId: uuid, target, format: { enum: ['json', 'tree'] }, maxNodes: { type: 'integer', minimum: 1, maximum: 2000 },
  sessionId: { type: 'string' }, revision: { type: 'integer' }, id: { type: 'string' }, parentId: { type: 'string' },
  name: { type: 'string' }, className: { type: 'string' }, match: { enum: ['exact', 'contains'] }, recursive: { type: 'boolean' },
  depth: { type: 'integer', minimum: 0, maximum: 64 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 },
  view: { enum: ['design', 'runtime'] }, detail: { enum: ['summary', 'full'] }, language: { type: 'string' }, source: { type: 'string' },
  integration: { type: 'string' }, kind: { enum: ['source', 'integration'] },
  dryRun: { type: 'boolean' }, label: { type: 'string' }, relativePath: { type: 'string' }, discardChanges: { type: 'boolean' },
  action: { enum: ['run', 'stop', 'reset'] }, cursor: { type: 'integer', minimum: 0 }, consoleCursor: { type: 'integer', minimum: 0 },
  query: { type: 'string' }, library: { enum: ['permanent', 'project'] },
  tags: { type: 'string' }, robloxId: { type: 'string' },
};
const fields: Record<string, string[]> = {
  'uie.editor.get_state': ['detail'], 'uie.editor.get_capabilities': [],
  'uie.nodes.get': ['id', 'depth', 'view', 'target', 'format', 'maxNodes'], 'uie.nodes.find': ['name', 'className', 'match', 'parentId', 'recursive', 'offset', 'limit', 'view', 'target'],
  'uie.code.execute': ['sessionId', 'revision', 'language', 'source', 'dryRun', 'label'],
  'uie.scripts.get': ['kind', 'target'], 'uie.scripts.set': ['sessionId', 'revision', 'source', 'integration', 'label'],
  'uie.project.list': [], 'uie.document.list': ['projectId', 'library', 'offset', 'limit'], 'uie.document.new': ['sessionId', 'revision', 'name', 'discardChanges'],
  'uie.document.open': ['sessionId', 'revision', 'relativePath', 'discardChanges'], 'uie.document.save': ['sessionId', 'revision', 'relativePath'],
  'uie.runtime.control': ['sessionId', 'revision', 'action'], 'uie.runtime.click': ['sessionId', 'revision', 'id'],
  'uie.debug.get_diagnostics': ['cursor', 'consoleCursor'], 'uie.debug.screenshot': ['target'],
  'uie.assets.search': ['query', 'library', 'offset', 'limit', 'projectId'], 'uie.assets.get': ['id', 'library', 'projectId'],
  'uie.assets.configure': ['sessionId', 'revision', 'id', 'name', 'tags', 'robloxId'],
};
const descriptions = [
  'Read active project/session, revision and optionally full design document.',
  'Discover current project language/version, node definitions, parenting rules, editing and runtime APIs. Read before executing code.',
  'Read current or saved UI nodes. target selects document UUID and library; omitted projectId means current project. Omit id for root. format=tree returns compact text; depth/maxNodes bound output.',
  'Find nodes in current UI or saved target by name, class and parent scope; paginated tree order. Omitted target uses current canvas.',
  'Execute sandboxed authoring code for the current project language. All changes commit as one undoable transaction; dryRun never changes history. No filesystem/network or undo/redo API.',
  'Read interaction and preview integration code in current UI or saved target. Optional kind selects one; omitted returns both.',
  'Edit interaction source and/or preview integration source directly. Omitted script remains unchanged. Requires current session/revision and edit mode; changes remain undoable in the App.',
  'List saved interfaces by UUID in project/templates/permanent library; omitted projectId uses current project. Paginated, without document contents.', 'Create interface; dirty document requires explicit discardChanges or save first.',
  'Open project-relative interface; dirty document requires explicit discardChanges or save first.',
  'Save current interface, or create a new project-relative interface without overwrite.',
  'Run, stop or reset preview. Run makes authoring read-only; stop returns to editing.',
  'Simulate button activation using stable ID; hidden/disabled buttons do not dispatch.',
  'Read bounded console/preview diagnostics since cursor; reports truncation.', 'Capture current canvas, or saved target as a static PNG using isolated rendering without changing current UI or executing scripts.',
  'Search image assets; optional projectId selects source project, permanent library is global. Includes Roblox image ID. Apply using ui.assets.apply(nodeId,assetId) in code.execute.',
  'Get an image asset with preview and Roblox ID; optional projectId selects source project, permanent library is global.',
  'Save image asset metadata and its single Roblox ID. Omitted fields stay unchanged. Asset catalog changes are saved immediately and are not document undo operations.',
  'List current and recent projects by UUID without opening or switching projects; reports unavailable paths and duplicate UUIDs.',
];
export const definitions = toolNames.map((name, index) => ({ name, description: descriptions[index], inputSchema: { type: 'object', properties: Object.fromEntries(fields[name].map(key => [key, name === 'uie.document.list' && key === 'library' ? { enum: ['project', 'templates', 'permanent'] } : properties[key as keyof typeof properties]])), additionalProperties: false, required: fields[name].filter(key => ['sessionId', 'revision'].includes(key) || (name === 'uie.code.execute' && ['language', 'source'].includes(key)) || (['uie.runtime.click', 'uie.assets.get', 'uie.assets.configure'].includes(name) && key === 'id') || (name === 'uie.runtime.control' && key === 'action') || (name === 'uie.document.open' && key === 'relativePath') || (name === 'uie.document.new' && key === 'name')) } }));

export function validateTool(name: string, args: unknown) {
  const tool = definitions.find(tool => tool.name === name);
  if (!tool) throw new Error('Unknown tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是对象。');
  const values = args as Record<string, unknown>;
  if (['uie.assets.get', 'uie.assets.configure'].includes(name) && typeof values.id !== 'string') throw new Error('缺少参数 id');
  if (name === 'uie.scripts.set' && values.source === undefined && values.integration === undefined) throw new Error('必须提供 source（交互代码）或 integration（接入代码）。');
  if (values.target !== undefined && values.view === 'runtime') throw new Error('保存文件不支持运行副本。');
  if (values.library === 'permanent' && values.projectId !== undefined) throw new Error('永久库不接受 projectId。');
  for (const key of tool.inputSchema.required) if (values[key] === undefined) throw new Error(`缺少参数 ${key}`);
  for (const [key, value] of Object.entries(values)) {
    const definition = tool.inputSchema.properties[key] as { type?: string; enum?: unknown[]; minimum?: number; maximum?: number } | undefined;
    if (!definition) throw new Error(`不支持的参数 ${key}`);
    if (value === undefined) continue;
    if (key === 'target') { validateTarget(value); continue; }
    if (key === 'projectId') validateUUID(value);
    if (definition.enum && !definition.enum.includes(value)) throw new Error(`参数 ${key} 无效。`);
    if (definition.type === 'integer') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || (definition.minimum !== undefined && value < definition.minimum) || (definition.maximum !== undefined && value > definition.maximum)) throw new Error(`整数参数 ${key} 无效。`);
    } else if (definition.type && typeof value !== definition.type) throw new Error(`参数 ${key} 类型无效。`);
  }
}

export function validateUUID(value: unknown) {
  if (typeof value !== 'string' || !new RegExp(uuid.pattern).test(value)) throw new Error('UUID 无效。');
}
export function validateTarget(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('target 必须是对象。');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['projectId', 'library', 'documentId'].includes(key))) throw new Error('target 包含不支持的参数。');
  validateUUID(data.documentId);
  if (data.projectId !== undefined) validateUUID(data.projectId);
  if (data.library !== undefined && !['project', 'templates', 'permanent'].includes(String(data.library))) throw new Error('UI 资产库无效。');
  if (data.library === 'permanent' && data.projectId !== undefined) throw new Error('永久库不接受 projectId。');
}
