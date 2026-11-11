import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
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
  const entry = docs.read({ files: ['AGENTS.md'] }).documents[0];
  assert.deepEqual(entry.skills?.map(skill => skill.name), ['author', 'author-extra']);
  assert.equal(entry.skills?.[0].description, 'Make UI. Use when editing.');
  const skill = docs.read({ files: [entry.skills![0].file] }).documents[0];
  assert.ok(skill.content.startsWith('---\n'));
  assert.equal('skills' in skill, false);
  assert.equal(skill.documentRevision, entry.documentRevision);
  await put('AGENTS.md', 'changed');
  assert.equal(docs.read({ files: ['AGENTS.md'] }).documents[0].content, entry.content);
  assert.equal((await docs.search({ pattern: 'entry' })).documentRevision, entry.documentRevision);
  const changed = (await loadDocumentation(root)).documentRevision;
  assert.notEqual(changed, entry.documentRevision);
  await put('Docs/new.md', 'new reference');
  assert.notEqual((await loadDocumentation(root)).documentRevision, changed);
  await put('.agents/skills/new-skill/SKILL.md', '---\nname: new-skill\ndescription: New editing task.\n---\n# New skill');
  assert.equal(docs.read({ files: ['AGENTS.md'] }).documents[0].skills?.length, 2);
  assert.equal((await loadDocumentation(root)).read({ files: ['AGENTS.md'] }).documents[0].skills?.length, 3);
});

test('files-only read preserves order, duplicates, entry metadata and atomic failure', async t => {
  const { root } = await fixture(t), docs = await loadDocumentation(root);
  const files = ['.agents/skills/author/SKILL.md', 'AGENTS.md', '.agents/skills/author/SKILL.md'];
  const result = docs.read({ files });
  assert.deepEqual(Object.keys(result).sort(), ['documentRevision', 'documents']);
  assert.deepEqual(result.documents.map(document => document.file), files);
  assert.deepEqual(result.documents, files.map(file => docs.read({ files: [file] }).documents[0]));
  assert.ok(result.documents.every(document => document.documentRevision === result.documentRevision));
  assert.equal('skills' in result.documents[0], false);
  assert.equal(result.documents[1].skills?.length, 2);
  for (const args of [{ files: [] }, { files: ['AGENTS.md', null] }, { files: ['AGENTS.md'], file: 'AGENTS.md' },
    { file: 'AGENTS.md' }, { files: ['AGENTS.md', '../escape.md'] }, { files: ['AGENTS.md', 'private.txt'] }]) {
    assert.throws(() => docs.read(args), /DOCS_/);
  }
  const schema = definitions.find(tool => tool.name === 'uie.docs.read')!.inputSchema;
  assert.deepEqual(schema.required, ['files']);
  assert.equal('file' in schema.properties, false);
  assert.deepEqual(schema.properties.files, { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } });
});

test('literal/regex search returns only sorted unique paths; line matching and component-scoped paths', async t => {
  const { root } = await fixture(t), docs = await loadDocumentation(root);
  const result = (await docs.search({ pattern: 'keyword', maxResults: 20 }));
  assert.deepEqual(Object.keys(result).sort(), ['documentRevision', 'files', 'truncated']);
  assert.deepEqual(result.files, [...result.files].sort());
  assert.equal(result.files.length, 4);
  assert.equal(result.truncated, false);
  assert.deepEqual((await docs.search({ pattern: 'onClick|onHover', mode: 'regex' })).files, ['.agents/skills/author/references/nodes.md']);
  assert.deepEqual((await docs.search({ pattern: 'onClick|onHover' })).files, []);
  assert.equal((await docs.search({ pattern: 'a.b' })).files.length, 1);
  assert.equal((await docs.search({ pattern: '^on(Click|Hover)$', mode: 'regex' })).files.length, 1);
  assert.equal((await docs.search({ pattern: '[?()]', mode: 'regex' })).truncated, false, 'literal special characters inside classes are not special groups');
  assert.equal((await docs.search({ pattern: '\\\\1', mode: 'regex' })).truncated, false, 'escaped backslashes are not backreferences');
  assert.ok((await docs.search({ pattern: ' ' })).files.length > 0);
  assert.deepEqual((await docs.search({ pattern: 'first\\s+second', mode: 'regex' })).files, []);
  assert.deepEqual((await docs.search({ pattern: 'keyword', path: '.agents/skills/author/' })).files, [
    '.agents/skills/author/SKILL.md', '.agents/skills/author/references/nodes.md',
  ]);
  assert.deepEqual((await docs.search({ pattern: 'keyword', path: 'AGENTS.md' })).files, ['AGENTS.md']);
  assert.deepEqual((await docs.search({ pattern: 'nothing' })), { documentRevision: result.documentRevision, files: [], truncated: false });
  for (const file of result.files) assert.equal(docs.read({ files: [file] }).documents[0].file, file);
});

test('search file and JSON limits preserve complete paths; exact limit can report complete', async t => {
  const { root, put } = await fixture(t);
  for (let i = 0; i < 25; ++i) await put(`Docs/${String(i).padStart(2, '0')}.md`, 'match');
  const docs = await loadDocumentation(root);
  assert.equal((await docs.search({ pattern: 'match' })).files.length, 10);
  assert.equal((await docs.search({ pattern: 'match' })).truncated, true);
  assert.equal((await docs.search({ pattern: 'match', maxResults: 20 })).files.length, 20);
  assert.equal((await docs.search({ pattern: 'match', maxResults: 20 })).truncated, true);
  assert.equal((await docs.search({ pattern: 'keyword', maxResults: 4 })).truncated, false);
  for (let i = 0; i < 12; ++i) await put(`long/${'x'.repeat(180)}${i}.md`, 'huge');
  const long = await loadDocumentation(root), result = (await long.search({ pattern: 'huge', maxResults: 20 }));
  assert.equal(result.truncated, true);
  assert.ok(result.files.length > 0 && result.files.length < 12);
  assert.ok(JSON.stringify(result).length <= 2000);
  for (const file of result.files) assert.equal(long.read({ files: [file] }).documents[0].content, 'huge');
});

test('parameters, path escapes, regex errors and resource exhaustion are identifiable', async t => {
  const { root, put } = await fixture(t);
  await put('Docs/pathological.md', 'a'.repeat(30000) + '!');
  const docs = await loadDocumentation(root);
  for (const args of [{}, { files: [] }, { files: '' }, { files: [4] }, { file: 'AGENTS.md' }, { files: ['AGENTS.md'], extra: true }]) {
    assert.throws(() => validateTool('uie.docs.read', args), /DOCS_/);
  }
  for (const path of ['../AGENTS.md', '/AGENTS.md', 'C:/AGENTS.md', '\\\\server\\a', 'Docs/../AGENTS.md', 'Docs//a.md', 'AGENTS.md:stream', 'Docs/./a.md', 'Docs /a.md']) {
    assert.throws(() => docs.read({ files: [path] }).documents[0], /DOCS_INVALID_PATH/);
    await assert.rejects(docs.search({ pattern: 'a', path }), /DOCS_INVALID_PATH/);
  }
  for (const args of [{}, { pattern: '' }, { pattern: 1 }, { pattern: 'a', mode: 'other' },
    { pattern: 'a', path: '' }, { pattern: 'a', maxResults: 21 }, { pattern: 'a', maxResults: 0 },
    { pattern: 'a', maxResults: 1.1 }, { pattern: 'a', extra: true }, { pattern: 'a'.repeat(513) }]) {
    assert.throws(() => validateTool('uie.docs.search', args), /DOCS_/);
  }
  for (const pattern of ['[', '(?=a)', '(a)\\1', '(?<name>a)\\k<name>', '(?i)a']) {
    await assert.rejects(docs.search({ pattern, mode: 'regex' }), /DOCS_INVALID_REGEX/);
  }
  await assert.rejects(docs.search({ pattern: '(a+)+$', mode: 'regex', path: 'Docs/pathological.md' }), /DOCS_SEARCH_LIMIT/);
  assert.equal(docs.read({ files: ['AGENTS.md'] }).documents[0].file, 'AGENTS.md', 'service remains usable after timeout');
  assert.throws(() => docs.read({ files: ['private.txt'] }).documents[0], /DOCS_NOT_FOUND/);
  await assert.rejects(docs.search({ pattern: 'secret', path: 'private.txt' }), /DOCS_NOT_FOUND/);
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
  assert.deepEqual(docs.read({ files: ['AGENTS.md'] }).documents[0].skills?.map(skill => skill.name), ['author', 'author-extra']);
  assert.equal(diagnostics.length, 4);
  assert.deepEqual((await docs.search({ pattern: 'secret' })).files, []);
  for (const file of ['linked/escape.md', '.agents/skills/bad/SKILL.md', '.agents/skills/bad/references/secret.md']) assert.throws(() => docs.read({ files: [file] }).documents[0], /DOCS_NOT_FOUND/);
  await assert.rejects(loadDocumentation(join(root, 'linked')), /DOCS_PACKAGE_UNAVAILABLE/);
});

test('real package discovers skills and all Markdown links resolve inside the same whitelist', async () => {
  const docs = await loadDocumentation(resolve('ai-docs'));
  assert.equal(docs.read({ files: ['AGENTS.md'] }).documents[0].skills?.length, 3);
  const result = (await docs.search({ pattern: '.', mode: 'regex', maxResults: 20 }));
  assert.equal(result.truncated, false);
  for (const file of result.files) {
    for (const match of docs.read({ files: [file] }).documents[0].content.matchAll(/\[[^\]]*\]\(([^)\n]+)\)/g)) {
      if (/^(https?:|#)/.test(match[1])) continue;
      const path = posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(match[1].split('#')[0])));
      assert.equal(docs.read({ files: [path] }).documents[0].file, path);
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
    const entry = JSON.parse((await call('uie.docs.read', { files: ['AGENTS.md'] })).content[0].text);
    assert.equal(entry.documents[0].skills.length, 3);
    const batch = JSON.parse((await call('uie.docs.read', { files: ['AGENTS.md', entry.documents[0].skills[0].file, 'AGENTS.md'] })).content[0].text);
    assert.equal(batch.documents.length, 3);
    assert.deepEqual(batch.documents[0], batch.documents[2]);
    assert.equal((await call('uie.docs.read', { files: ['AGENTS.md', 'missing.md'] })).isError, true);
    assert.equal((await call('uie.docs.read', { file: 'AGENTS.md' })).isError, true);
    const search = JSON.parse((await call('uie.docs.search', { pattern: 'Text.Define' })).content[0].text);
    assert.equal(search.documentRevision, entry.documentRevision);
    assert.ok(search.files.length > 0);
    const error = await call('uie.docs.read', { files: ['C:/private.md'] });
    assert.equal(error.isError, true);
    assert.doesNotMatch(error.content[0].text, /C:| at /);
    assert.equal((await call('uie.docs.search', {})).isError, true);
    assert.equal((await call('uie.editor.get_state', {})).isError, true, 'business calls still require the App');
  } finally {
    child.stdin.end();
    await new Promise<void>(resolve => { child.once('close', () => resolve()); child.kill(); });
  }
});

// Gate real worker execution and bridge replies rather than guessing elapsed-time thresholds.
test('real stdio overlaps docs only, survives errors and drains accepted requests after EOF', { timeout: 30000 }, async t => {
  const { root } = await fixture(t);
  const gates = new Map<string, ServerResponse>();
  const arrivals = new Map<string, () => void>();
  const waitFor = (key: string) => gates.has(key) ? Promise.resolve() : new Promise<void>(resolve => arrivals.set(key, resolve));
  const businessOrder: string[] = [];
  let activeBusiness = 0, overlappedBusiness = false;
  const bridge = createServer(async (request, response) => {
    let key: string;
    if (request.url!.startsWith('/search/')) key = decodeURIComponent(request.url!.slice('/search/'.length));
    else {
      let body = '';
      for await (const chunk of request) body += chunk;
      key = JSON.parse(body).name;
      businessOrder.push(key);
      if (++activeBusiness > 1) overlappedBusiness = true;
      response.once('finish', () => --activeBusiness);
    }
    gates.set(key, response);
    arrivals.get(key)?.();
  });
  bridge.listen(0, '127.0.0.1');
  await once(bridge, 'listening');
  const port = (bridge.address() as { port: number }).port;
  t.after(() => { bridge.closeAllConnections(); bridge.close(); });
  const discovery = join(root, 'discovery.json');
  await writeFile(discovery, JSON.stringify({ port, token: 'test' }));
  const preload = join(root, 'gate-workers.cjs');
  await writeFile(preload, `
    const workers = require('node:worker_threads');
    const Original = workers.Worker;
    workers.Worker = class extends Original {
      constructor(source, options) {
        const url = 'http://127.0.0.1:${port}/search/' + encodeURIComponent(options.workerData.context.pattern);
        super("require('node:http').get(" + JSON.stringify(url) + ", response => { response.resume(); response.on('end', () => {" + source + "}); });", options);
      }
    };
    require('node:module').syncBuiltinESMExports();
  `);
  const child = spawn(process.execPath, ['--require', preload, resolve('mcp-dist/server.mjs'), '--discovery', discovery], {
    cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill(); });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise<number | null>(resolve => child.once('close', resolve));
  const pending = new Map<number, (value: any) => void>();
  const responses: (number | null)[] = [];
  createInterface({ input: child.stdout }).on('line', line => {
    const response = JSON.parse(line);
    responses.push(response.id);
    pending.get(response.id)?.(response);
  });
  let id = 0;
  const send = (name: string, args = {}) => {
    const key = ++id;
    const result = new Promise<any>(resolve => pending.set(key, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method: 'tools/call', params: { name, arguments: args } }) + '\n');
    return result;
  };
  const release = (key: string, value: { ok: boolean; value?: unknown; error?: string } = { ok: true, value: { name: key } }) => {
    assert.ok(gates.has(key), 'gate must have been reached: ' + key);
    gates.get(key)!.end(JSON.stringify(value));
  };
  const first = send('uie.editor.get_state');
  await waitFor('uie.editor.get_state');
  const second = send('uie.editor.get_capabilities');
  const search1 = send('uie.docs.search', { pattern: 'first' });
  const search2 = send('uie.docs.search', { pattern: '[', mode: 'regex' });
  await Promise.all([waitFor('first'), waitFor('[')]);
  const read = await send('uie.docs.read', { files: ['AGENTS.md', 'AGENTS.md'] });
  assert.equal(JSON.parse(read.result.content[0].text).documents.length, 2);
  assert.deepEqual([...responses], [5], 'read finishes while two searches and slow App call are gated');
  const invalid = await send('uie.docs.read', { files: ['AGENTS.md', '../escape.md'] });
  assert.equal(invalid.result.isError, true);
  child.stdin.write('{broken JSON\n');
  const last = send('uie.docs.read', { files: ['AGENTS.md'] });
  child.stdin.end();
  assert.equal((await last).result.isError, undefined, 'error does not poison subsequent docs requests');
  release('[');
  assert.equal((await search2).result.isError, true);
  release('first');
  assert.equal((await search1).result.isError, undefined);
  release('uie.editor.get_state', { ok: false, error: 'expected bridge failure' });
  assert.equal((await first).result.isError, true);
  await waitFor('uie.editor.get_capabilities');
  release('uie.editor.get_capabilities');
  assert.equal((await second).result.isError, undefined, 'failed business call does not poison serial queue');
  assert.equal(await exited, 0, stderr);
  assert.deepEqual(businessOrder, ['uie.editor.get_state', 'uie.editor.get_capabilities']);
  assert.equal(overlappedBusiness, false, 'business calls remain serial');
  assert.equal(responses.filter(id => id !== null).length, 7, 'EOF drains every accepted request');
  assert.ok(responses.includes(null), 'malformed JSON is reported');
});
