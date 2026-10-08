import { pointSchema, validateMouseAction } from './runtime-mouse';
import { toolNames } from './automation';
import { runtimeBatchStepsSchema, validateRuntimeBatchSteps } from './runtime-batch';
const uuid = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' };
const target = { type: 'object', properties: { projectId: uuid, library: { enum: ['project', 'templates', 'permanent'] }, documentId: uuid }, required: ['documentId'], additionalProperties: false };
const properties = {
  to: pointSchema, from: pointSchema, delta: pointSchema,
  steps: runtimeBatchStepsSchema,
  projectId: uuid, target, mode: { enum: ['edit', 'copy'] }, format: { enum: ['json', 'tree'] }, maxNodes: { type: 'integer', minimum: 1, maximum: 2000 },
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
  'uie.runtime.hover': ['sessionId', 'revision', 'id'],
  'uie.runtime.scroll': ['sessionId', 'revision', 'id', 'to', 'delta'],
  'uie.runtime.drag': ['sessionId', 'revision', 'id', 'from', 'to', 'steps'],
  'uie.runtime.batch': ['sessionId', 'revision', 'steps'],
  'uie.editor.get_state': ['detail'], 'uie.editor.get_capabilities': [],
  'uie.nodes.get': ['id', 'depth', 'view', 'target', 'format', 'maxNodes'], 'uie.nodes.find': ['name', 'className', 'match', 'parentId', 'recursive', 'offset', 'limit', 'view', 'target'],
  'uie.code.execute': ['sessionId', 'revision', 'language', 'source', 'dryRun', 'label'],
  'uie.scripts.get': ['kind', 'target'], 'uie.scripts.set': ['sessionId', 'revision', 'source', 'integration', 'label'],
  'uie.project.list': [], 'uie.document.list': ['projectId', 'library', 'offset', 'limit'], 'uie.document.new': ['sessionId', 'revision', 'name', 'discardChanges'],
  'uie.document.open': ['sessionId', 'revision', 'relativePath', 'target', 'mode', 'discardChanges'], 'uie.document.save': ['sessionId', 'revision', 'relativePath'],
  'uie.runtime.control': ['sessionId', 'revision', 'action'], 'uie.runtime.click': ['sessionId', 'revision', 'id'],
  'uie.debug.get_diagnostics': ['cursor', 'consoleCursor'], 'uie.debug.screenshot': ['target'],
  'uie.assets.search': ['query', 'library', 'offset', 'limit', 'projectId'], 'uie.assets.get': ['id', 'library', 'projectId'],
  'uie.assets.configure': ['sessionId', 'revision', 'id', 'name', 'tags', 'robloxId'],
};
const descriptions = [
  'Read active project/session, revision, current file library/path/mode, absolute workspacePath/agentWorkspacePath/gameDesignPath and gameDesignExists, and optionally full design document. Read/edit Game-DESIGN.md using filesystem tools.',
  'Discover current project language/version, node definitions, parenting rules, editing and runtime APIs. Read before executing code.',
  'Read current or saved UI nodes. target selects document UUID and library; omitted projectId means current project. Omit id for root. format=tree returns compact text; depth/maxNodes bound output.',
  'Find nodes in current UI or saved target by name, class and parent scope; paginated tree order. Omitted target uses current canvas.',
  'Execute sandboxed authoring code for the current project language. All changes commit as one undoable transaction; dryRun never changes history. No filesystem/network or undo/redo API.',
  'Read interaction and preview integration code in current UI or saved target. Optional kind selects one; omitted returns both.',
  'Edit interaction source and/or preview integration source directly. Omitted script remains unchanged. Requires current session/revision and edit mode; changes remain undoable in the App.',
  'List saved interfaces by UUID in project/templates/permanent library; omitted projectId uses current project. Paginated, without document contents.', 'Create interface; dirty document requires explicit discardChanges or save first.',
  'Open current-project UI by relativePath or UUID target (exclusive). Templates require explicit mode=edit (original; only on user request or agreement) or copy. Dirty document requires discardChanges or save first.',
  'Save current bound project UI or template original; template edits require user request or agreement. relativePath creates a new project UI without overwrite. External template changes report conflict.',
  'Run, stop or reset preview. Run makes authoring read-only; stop returns to editing.',
  'Simulate button activation using stable ID; hidden/disabled buttons do not dispatch.',
  'Read bounded console/preview diagnostics since cursor; reports truncation.', 'Capture current canvas, or saved target as a static PNG using isolated rendering without changing current UI or executing scripts.',
  'Search image assets; optional projectId selects source project, permanent library is global. Includes Roblox image ID. Apply using ui.assets.apply(nodeId,assetId) in code.execute.',
  'Get an image asset with preview and Roblox ID; optional projectId selects source project, permanent library is global.',
  'Save image asset metadata and its single Roblox ID. Omitted fields stay unchanged. Asset catalog changes are saved immediately and are not document undo operations.',
  'List current and recent projects by UUID without opening or switching projects; reports unavailable paths and duplicate UUIDs.',
  'Validate preview in one sequential call: 1–32 run/reset/stop/click/hover/scroll/drag/assert steps, stable node IDs, optional click dispatched/reason expectations and property/disabled/hovered/pressed assertions. Stops on first failure and returns per-step results plus runtime diagnostics; no rollback or automatic stop. Save/reopen and visual screenshots remain separate.',
  'Hover a runtime node by ID, or leave with id=null. No screen coordinates.',
  'Scroll a ScrollingFrame by ID. Supply exactly one of to or delta in canvas pixels; to preserves unspecified axes. Returns clamped position and range.',
  'Drag a runtime node using normalized local from/to points (0–1), with 1–32 moves (default 8). Sends mouse begin/change/end without activating a button.',
];
export const definitions = toolNames.map((name, index) => ({ name, description: descriptions[index], inputSchema: { type: 'object', properties: Object.fromEntries(fields[name].map(key => [key, name === 'uie.runtime.hover' && key === 'id' ? { type: ['string', 'null'] } : name === 'uie.runtime.drag' && key === 'steps' ? { type: 'integer', minimum: 1, maximum: 32 } : name === 'uie.document.list' && key === 'library' ? { enum: ['project', 'templates', 'permanent'] } : properties[key as keyof typeof properties]])), additionalProperties: false, required: fields[name].filter(key => ['sessionId', 'revision'].includes(key) || (name === 'uie.runtime.batch' && key === 'steps') || (name === 'uie.runtime.drag' && ['from', 'to'].includes(key)) || (name === 'uie.code.execute' && ['language', 'source'].includes(key)) || (['uie.runtime.click', 'uie.runtime.hover', 'uie.runtime.scroll', 'uie.runtime.drag', 'uie.assets.get', 'uie.assets.configure'].includes(name) && key === 'id') || (name === 'uie.runtime.control' && key === 'action') || (name === 'uie.document.new' && key === 'name')) } }));

export function validateTool(name: string, args: unknown) {
  const tool = definitions.find(tool => tool.name === name);
  if (!tool) throw new Error('Unknown tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是对象。');
  const values = args as Record<string, unknown>;
  if (name === 'uie.document.open') {
    if ((values.target === undefined) === (values.relativePath === undefined)) throw new Error('必须提供 relativePath 或 target，且不能同时提供。');
    if (values.target !== undefined) {
      validateTarget(values.target);
      const target = values.target as { library?: string };
      if (target.library === 'permanent') throw new Error('只允许打开当前工程的项目 UI 或模板。');
      if (target.library === 'templates' && values.mode === undefined) throw new Error('打开模板必须明确 mode=edit 或 copy。');
    }
  }
  if (name === 'uie.runtime.batch') validateRuntimeBatchSteps(values.steps);
  if (['uie.runtime.hover', 'uie.runtime.scroll', 'uie.runtime.drag'].includes(name)) validateMouseAction({ ...values, action: name.split('.').at(-1) });
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
    if (key === 'steps' || ['to', 'from', 'delta'].includes(key) || (name === 'uie.runtime.hover' && key === 'id')) continue;
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
