import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { loadDocumentation } from '../mcp/documentation';
import { definitions, validateTool } from '../src/shared/automation-tools';

async function fixture(t: TestContext) {
  await mkdir(resolve('test-results'), { recursive: true });
  const root = await mkdtemp(resolve('test-results/docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (file: string, content: string) => {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content, 'utf8');
  };
  await put('AGENTS.md', '# Entry\nentry keyword');
  await put('.agents/skills/author/SKILL.md', '---\nname: author\ndescription: >-\n  Make UI.\n  Use when editing.\n---\n# Author\nkeyword\n[Reference](references/nodes.md)');
  await put('.agents/skills/author/references/nodes.md', '# Nodes\nkeyword keyword\nonClick\nonHover\nliteral a.b\nfirst\nsecond');
  await put('.agents/skills/author-extra/SKILL.md', '---\nname: author-extra\ndescription: Extra UI task.\n---\nkeyword');
  await put('private.txt', 'secret keyword');
  return { root, put };
}

test('read explicitly selects a Markdown file; entry alone includes parsed skills; snapshot/revision are consistent', async t => {
  const { root, put } = await fixture(t);
  const docs = await loadDocumentation(root);
  const entry = docs.read({ file: 'AGENTS.md' });
  assert.deepEqual(entry.skills?.map(skill => skill.name), ['author', 'author-extra']);
  assert.equal(entry.skills?.[0].description, 'Make UI. Use when editing.');
  const skill = docs.read({ file: entry.skills![0].file });
  assert.ok(skill.content.startsWith('---\n'));
  assert.equal('skills' in skill, false);
  assert.equal(skill.documentRevision, entry.documentRevision);
  await put('AGENTS.md', 'changed');
  assert.equal(docs.read({ file: 'AGENTS.md' }).content, entry.content);
  assert.equal(docs.search({ pattern: 'entry' }).documentRevision, entry.documentRevision);
  const changed = (await loadDocumentation(root)).documentRevision;
  assert.notEqual(changed, entry.documentRevision);
  await put('Docs/new.md', 'new reference');
  assert.notEqual((await loadDocumentation(root)).documentRevision, changed);
  await put('.agents/skills/new-skill/SKILL.md', '---\nname: new-skill\ndescription: New editing task.\n---\n# New skill');
  assert.equal(docs.read({ file: 'AGENTS.md' }).skills?.length, 2);
  assert.equal((await loadDocumentation(root)).read({ file: 'AGENTS.md' }).skills?.length, 3);
});

test('literal/regex search returns only sorted unique paths; line matching and component-scoped paths', async t => {
  const { root } = await fixture(t), docs = await loadDocumentation(root);
  const result = docs.search({ pattern: 'keyword', maxResults: 20 });
  assert.deepEqual(Object.keys(result).sort(), ['documentRevision', 'files', 'truncated']);
  assert.deepEqual(result.files, [...result.files].sort());
  assert.equal(result.files.length, 4);
  assert.equal(result.truncated, false);
  assert.deepEqual(docs.search({ pattern: 'onClick|onHover', mode: 'regex' }).files, ['.agents/skills/author/references/nodes.md']);
  assert.deepEqual(docs.search({ pattern: 'onClick|onHover' }).files, []);
  assert.equal(docs.search({ pattern: 'a.b' }).files.length, 1);
  assert.equal(docs.search({ pattern: '^on(Click|Hover)$', mode: 'regex' }).files.length, 1);
  assert.equal(docs.search({ pattern: '[?()]', mode: 'regex' }).truncated, false, 'literal special characters inside classes are not special groups');
  assert.equal(docs.search({ pattern: '\\\\1', mode: 'regex' }).truncated, false, 'escaped backslashes are not backreferences');
  assert.ok(docs.search({ pattern: ' ' }).files.length > 0);
  assert.deepEqual(docs.search({ pattern: 'first\\s+second', mode: 'regex' }).files, []);
  assert.deepEqual(docs.search({ pattern: 'keyword', path: '.agents/skills/author/' }).files, [
    '.agents/skills/author/SKILL.md', '.agents/skills/author/references/nodes.md',
  ]);
  assert.deepEqual(docs.search({ pattern: 'keyword', path: 'AGENTS.md' }).files, ['AGENTS.md']);
  assert.deepEqual(docs.search({ pattern: 'nothing' }), { documentRevision: result.documentRevision, files: [], truncated: false });
  for (const file of result.files) assert.equal(docs.read({ file }).file, file);
});

test('search file and JSON limits preserve complete paths; exact limit can report complete', async t => {
  const { root, put } = await fixture(t);
  for (let i = 0; i < 25; ++i) await put(`Docs/${String(i).padStart(2, '0')}.md`, 'match');
  const docs = await loadDocumentation(root);
  assert.equal(docs.search({ pattern: 'match' }).files.length, 10);
  assert.equal(docs.search({ pattern: 'match' }).truncated, true);
  assert.equal(docs.search({ pattern: 'match', maxResults: 20 }).files.length, 20);
  assert.equal(docs.search({ pattern: 'match', maxResults: 20 }).truncated, true);
  assert.equal(docs.search({ pattern: 'keyword', maxResults: 4 }).truncated, false);
  for (let i = 0; i < 12; ++i) await put(`long/${'x'.repeat(180)}${i}.md`, 'huge');
  const long = await loadDocumentation(root), result = long.search({ pattern: 'huge', maxResults: 20 });
  assert.equal(result.truncated, true);
  assert.ok(result.files.length > 0 && result.files.length < 12);
  assert.ok(JSON.stringify(result).length <= 2000);
  for (const file of result.files) assert.equal(long.read({ file }).content, 'huge');
});

test('parameters, path escapes, regex errors and resource exhaustion are identifiable', async t => {
  const { root, put } = await fixture(t);
  await put('Docs/pathological.md', 'a'.repeat(30000) + '!');
  const docs = await loadDocumentation(root);
  for (const args of [{}, { file: '' }, { file: 4 }, { file: 'AGENTS.md', extra: true }]) {
    assert.throws(() => validateTool('uie.docs.read', args), /DOCS_/);
  }
  for (const path of ['../AGENTS.md', '/AGENTS.md', 'C:/AGENTS.md', '\\\\server\\a', 'Docs/../AGENTS.md', 'Docs//a.md', 'AGENTS.md:stream', 'Docs/./a.md', 'Docs /a.md']) {
    assert.throws(() => docs.read({ file: path }), /DOCS_INVALID_PATH/);
    assert.throws(() => docs.search({ pattern: 'a', path }), /DOCS_INVALID_PATH/);
  }
  for (const args of [{}, { pattern: '' }, { pattern: 1 }, { pattern: 'a', mode: 'other' },
    { pattern: 'a', path: '' }, { pattern: 'a', maxResults: 21 }, { pattern: 'a', maxResults: 0 },
    { pattern: 'a', maxResults: 1.1 }, { pattern: 'a', extra: true }, { pattern: 'a'.repeat(513) }]) {
    assert.throws(() => validateTool('uie.docs.search', args), /DOCS_/);
  }
  for (const pattern of ['[', '(?=a)', '(a)\\1', '(?<name>a)\\k<name>', '(?i)a']) {
    assert.throws(() => docs.search({ pattern, mode: 'regex' }), /DOCS_INVALID_REGEX/);
  }
  assert.throws(() => docs.search({ pattern: '(a+)+$', mode: 'regex', path: 'Docs/pathological.md' }), /DOCS_SEARCH_LIMIT/);
  assert.equal(docs.read({ file: 'AGENTS.md' }).file, 'AGENTS.md', 'service remains usable after timeout');
  assert.throws(() => docs.read({ file: 'private.txt' }), /DOCS_NOT_FOUND/);
  assert.throws(() => docs.search({ pattern: 'secret', path: 'private.txt' }), /DOCS_NOT_FOUND/);
});

test('invalid skills and linked documents/junctions cannot enter either read or search', async t => {
  const { root, put } = await fixture(t), diagnostics: string[] = [];
  await put('.agents/skills/bad/SKILL.md', '---\nname: author\ndescription: duplicate identity\n---\nsecret');
  await put('.agents/skills/bad/references/secret.md', 'secret');
  await put('.agents/skills/missing/SKILL.md', '---\nname: missing\n---\nsecret');
  await put('.agents/skills/yaml/SKILL.md', '---\nname: yaml\nname: yaml\ndescription: wrong\n---\nsecret');
  const outside = root + '-outside';
  await mkdir(outside);
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'escape.md'), 'secret');
  await symlink(outside, join(root, 'linked'), 'junction');
  const docs = await loadDocumentation(root, message => diagnostics.push(message));
  assert.deepEqual(docs.read({ file: 'AGENTS.md' }).skills?.map(skill => skill.name), ['author', 'author-extra']);
  assert.equal(diagnostics.length, 4);
  assert.deepEqual(docs.search({ pattern: 'secret' }).files, []);
  for (const file of ['linked/escape.md', '.agents/skills/bad/SKILL.md', '.agents/skills/bad/references/secret.md']) assert.throws(() => docs.read({ file }), /DOCS_NOT_FOUND/);
  await assert.rejects(loadDocumentation(join(root, 'linked')), /DOCS_PACKAGE_UNAVAILABLE/);
});

test('real package discovers skills and all Markdown links resolve inside the same whitelist', async () => {
  const docs = await loadDocumentation(resolve('ai-docs'));
  assert.equal(docs.read({ file: 'AGENTS.md' }).skills?.length, 3);
  const result = docs.search({ pattern: '.', mode: 'regex', maxResults: 20 });
  assert.equal(result.truncated, false);
  for (const file of result.files) {
    for (const match of docs.read({ file }).content.matchAll(/\[[^\]]*\]\(([^)\n]+)\)/g)) {
      if (/^(https?:|#)/.test(match[1])) continue;
      const path = posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(match[1].split('#')[0])));
      assert.equal(docs.read({ file: path }).file, path);
    }
  }
});

test('built stdio bundle works offline, from another cwd and a relocated resource package', async t => {
  const { root } = await fixture(t);
  const packaged = join(root, 'resources', 'mcp-dist');
  await cp(resolve('mcp-dist'), packaged, { recursive: true });
  const child = spawn(process.execPath, [join(packaged, 'server.mjs'), '--discovery', join(root, 'not-running.json')], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const pending = new Map<number, (result: any) => void>();
  createInterface({ input: child.stdout }).on('line', line => { const value = JSON.parse(line); pending.get(value.id)?.(value.result); });
  let id = 0;
  const request = (method: string, params = {}) => new Promise<any>((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => reject(new Error('stdio timed out: ' + stderr)), 10000);
    pending.set(key, value => { clearTimeout(timer); pending.delete(key); resolve(value); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n');
  });
  try {
    assert.match((await request('initialize')).instructions, /uie\.docs\.read/);
    const tools = (await request('tools/list')).tools;
    for (const name of ['uie.docs.read', 'uie.docs.search']) assert.deepEqual(tools.find((tool: any) => tool.name === name), definitions.find(tool => tool.name === name));
    const call = (name: string, args: object) => request('tools/call', { name, arguments: args });
    const entry = JSON.parse((await call('uie.docs.read', { file: 'AGENTS.md' })).content[0].text);
    assert.equal(entry.skills.length, 3);
    const search = JSON.parse((await call('uie.docs.search', { pattern: 'Text.Define' })).content[0].text);
    assert.equal(search.documentRevision, entry.documentRevision);
    assert.ok(search.files.length > 0);
    const error = await call('uie.docs.read', { file: 'C:/private.md' });
    assert.equal(error.isError, true);
    assert.doesNotMatch(error.content[0].text, /C:| at /);
    assert.equal((await call('uie.docs.search', {})).isError, true);
    assert.equal((await call('uie.editor.get_state', {})).isError, true, 'business calls still require the App');
  } finally {
    child.stdin.end();
    await new Promise<void>(resolve => { child.once('close', () => resolve()); child.kill(); });
  }
});
