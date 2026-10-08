import { findNode } from './uiDocument';
import { validateJSON, type RuntimeFrame } from './runtime';
import type { AutomationRequest } from './automation';

const actions = ['run', 'reset', 'stop', 'click', 'assert'] as const;
export interface RuntimeBatchStep {
  action: typeof actions[number];
  id?: string;
  properties?: Record<string, unknown>;
  disabled?: boolean;
  dispatched?: boolean;
  reason?: 'hidden' | 'disabled' | null;
}
export const runtimeBatchStepsSchema = {
  type: 'array', minItems: 1, maxItems: 32,
  items: {
    type: 'object', additionalProperties: false, required: ['action'],
    properties: {
      action: { enum: actions }, id: { type: 'string' },
      properties: { type: 'object' }, disabled: { type: 'boolean' },
      dispatched: { type: 'boolean' }, reason: { enum: ['hidden', 'disabled', null] },
    },
  },
};

export function validateRuntimeBatchSteps(value: unknown): asserts value is RuntimeBatchStep[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new Error('steps 必须包含 1–32 个步骤。');
  for (const step of value) {
    if (!step || typeof step !== 'object' || Array.isArray(step) || !actions.includes(step.action)) throw new Error('无效的验证步骤。');
    const allowed = step.action === 'click' ? ['action', 'id', 'dispatched', 'reason'] : step.action === 'assert' ? ['action', 'id', 'properties', 'disabled'] : ['action'];
    if (Object.keys(step).some(key => !allowed.includes(key))) throw new Error('验证步骤包含不支持的字段。');
    if (['click', 'assert'].includes(step.action) && (typeof step.id !== 'string' || !step.id)) throw new Error('点击和断言需要稳定节点 id。');
    for (const key of ['disabled', 'dispatched']) if (step[key] !== undefined && typeof step[key] !== 'boolean') throw new Error(`${key} 必须是布尔值。`);
    if (step.reason !== undefined && ![null, 'hidden', 'disabled'].includes(step.reason)) throw new Error('reason 无效。');
    if (step.properties !== undefined) {
      validateJSON(step.properties);
      if (!step.properties || typeof step.properties !== 'object' || Array.isArray(step.properties)) throw new Error('properties 必须是对象。');
    }
    if (step.action === 'assert' && step.disabled === undefined && !Object.keys(step.properties ?? {}).length) throw new Error('断言需要 properties 或 disabled。');
  }
}

function equal(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return false;
  const a = actual as Record<string, unknown>, b = expected as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(key => Object.hasOwn(a, key) && equal(a[key], b[key]));
}

// Reuse single-step handlers; do not allow authoring, arbitrary code or file operations.
export async function executeRuntimeBatch(
  args: Record<string, unknown>,
  dispatch: (request: AutomationRequest) => Promise<any>,
  inspect: () => RuntimeFrame | null,
  verify: () => void,
) {
  validateRuntimeBatchSteps(args.steps);
  verify();
  const startedAt = Date.now();
  const results: { index: number; action: string; success: boolean; result?: unknown; error?: string }[] = [];
  for (const [index, step] of args.steps.entries()) {
    let result: any;
    try {
      verify();
      if (Date.now() - startedAt >= 8000) throw new Error('批量验证超过 8 秒预算，请拆成较小批次。');
      if (step.action === 'assert') {
        const frame = inspect();
        if (!frame) throw new Error('没有运行副本。');
        const node = findNode(frame.document.root, step.id!);
        if (!node) throw new Error('断言节点不存在。');
        result = { id: node.id, properties: Object.fromEntries(Object.keys(step.properties ?? {}).map(key => [key, node.properties[key]])), disabled: frame.disabled.includes(node.id) };
        for (const [key, expected] of Object.entries(step.properties ?? {})) {
          if (!equal(node.properties[key], expected)) throw new Error(`属性 ${key} 不匹配：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(node.properties[key])}。`);
        }
        if (step.disabled !== undefined && result.disabled !== step.disabled) throw new Error('disabled 状态不匹配。');
      } else {
        result = await dispatch({
          name: step.action === 'click' ? 'uie.runtime.click' : 'uie.runtime.control',
          arguments: { sessionId: args.sessionId, revision: args.revision, ...(step.action === 'click' ? { id: step.id } : { action: step.action }) },
        });
        verify();
        if (!result.result?.ok) throw new Error(result.result?.error ?? '运行操作失败。');
        if (step.action === 'click') {
          if (step.dispatched !== undefined && result.dispatched !== step.dispatched) throw new Error('dispatched 状态不匹配。');
          if (step.reason !== undefined && result.reason !== step.reason) throw new Error('reason 不匹配。');
        }
      }
      results.push({ index, action: step.action, success: true, result });
    } catch (error) {
      results.push({ index, action: step.action, success: false, result, error: error instanceof Error ? error.message : String(error) });
      break;
    }
  }
  return { success: results.every(result => result.success), results, skipped: args.steps.length - results.length, diagnostics: await dispatch({ name: 'uie.debug.get_diagnostics', arguments: {} }) };
}
