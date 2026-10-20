import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { robloxStrategy as strategy } from '../src/editor/roblox';
import { executeCode, robloxCodeAdapter } from '../electron/code-executor';

const audit = await readFile(resolve('../ProjectTypes/Roblox/.agents/skills/roblox-localization/scripts/audit-text.luau'), 'utf8');

function fixture() {
  const document = strategy.createDocument('Audit');
  const title = strategy.createNode('TextLabel');
  title.properties.Text = 'Rewards';
  const template = strategy.createNode('Frame');
  template.properties.Visible = false;
  const value = strategy.createNode('TextLabel');
  value.properties.Text = '';
  value.properties.AutoLocalize = false;
  template.children.push(value);
  document.root.children.push(title, template);
  const expectations = {
    [title.id]: { dynamic: false, autoLocalize: true },
    [value.id]: { dynamic: true, autoLocalize: false },
  };
  return { document, title, template, value, expectations };
}

function run(document: ReturnType<typeof fixture>['document'], expectations: object) {
  const entries = Object.entries(expectations).map(([id, value]) =>
    `["${id}"]={dynamic=${value.dynamic},autoLocalize=${value.autoLocalize}}`).join(',');
  return executeCode(robloxCodeAdapter, resolve('native-bin'), document, 'luau', `local expectations={${entries}}\n${audit}`);
}

test('文本验收遍历隐藏原型且不修改设计或脚本', async () => {
  const { document, expectations } = fixture();
  const before = JSON.stringify(document);
  const result = await run(document, expectations);
  assert.equal(result.operationCount, 0);
  assert.deepEqual(result.document, document);
  assert.equal(JSON.stringify(document), before);
  assert.match(JSON.stringify(result.logs), /验收通过/);
});

test('文本验收阻止占位残留、错误开关、祖先关闭和清单遗漏或失效', async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => { f.value.properties.Text = 'Item Name'; },
    (f: ReturnType<typeof fixture>) => { f.value.properties.AutoLocalize = true; },
    (f: ReturnType<typeof fixture>) => { f.title.properties.AutoLocalize = false; },
    (f: ReturnType<typeof fixture>) => { f.template.properties.AutoLocalize = false; },
    (f: ReturnType<typeof fixture>) => {
      const button = strategy.createNode('TextButton');
      button.properties.AutoLocalize = false;
      button.children.push(f.title);
      f.document.root.children = [button, f.template];
      f.expectations[button.id] = { dynamic: false, autoLocalize: false };
    },
    (f: ReturnType<typeof fixture>) => { delete f.expectations[f.value.id]; },
    (f: ReturnType<typeof fixture>) => { f.expectations.missing = { dynamic: true, autoLocalize: false }; },
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(run(f.document, f.expectations), /文本验收失败/);
  }
});
