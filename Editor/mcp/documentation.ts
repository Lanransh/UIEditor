import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { parseDocument } from 'yaml';
import { documentationPath, validateDocumentationArgs } from '../src/shared/documentation';

interface Skill { name: string; description: string; file: string }

// Only this fixed program executes. Patterns and document contents are data, never source.
// Compilation and matching stay inside the timed context, including pathological RegExp work.
const searchProgram = `(() => {
  const regexp = mode === 'regex' ? new RegExp(pattern, 'u') : null;
  const result = { files: [], truncated: false };
  for (const [file, content] of documents) {
    if (!content.split(/\\r\\n|[\\n\\r\\u2028\\u2029]/).some(line => regexp ? regexp.test(line) : line.includes(pattern))) continue;
    if (result.files.length === maxResults) { result.truncated = true; break; }
    result.files.push(file);
    // Reserve the longer false spelling, so flipping truncated cannot exceed the cap.
    if (JSON.stringify({ ...result, truncated: false }).length > 2000) {
      result.files.pop(); result.truncated = true; break;
    }
  }
  return JSON.stringify(result);
})()`;

export class Documentation {
  constructor(private documents: ReadonlyMap<string, string>, private skills: readonly Skill[]) {}
  read(args: unknown) {
    validateDocumentationArgs('uie.docs.read', args);
    const documents = (args.files as string[]).map(file => {
      const content = this.documents.get(file);
      if (content === undefined) throw new Error('DOCS_NOT_FOUND: 未登记此 Markdown 文档。');
      return { file, content, ...(file === 'AGENTS.md' ? { skills: this.skills.map(skill => ({ ...skill })) } : {}) };
    });
    return { documents };
  }
  async search(args: unknown): Promise<{ files: string[]; truncated: boolean }> {
    validateDocumentationArgs('uie.docs.search', args);
    const pattern = args.pattern as string, mode = args.mode ?? 'literal';
    // A documented subset, rather than an rg compatibility claim.
    if (mode === 'regex') {
      let characterClass = false;
      for (let i = 0; i < pattern.length; ++i) {
        if (pattern[i] === '\\') {
          if (!characterClass && (/[1-9]/.test(pattern[i + 1] ?? '') || pattern.slice(i + 1, i + 3) === 'k<')) throw new Error('DOCS_INVALID_REGEX: 不支持反向引用。');
          ++i;
        } else if (pattern[i] === '[') characterClass = true;
        else if (pattern[i] === ']') characterClass = false;
        else if (!characterClass && pattern.slice(i, i + 2) === '(?' && pattern[i + 2] !== ':') throw new Error('DOCS_INVALID_REGEX: 仅支持普通或非捕获分组，不支持环视、命名组或内联标志。');
      }
    }
    const path = args.path === undefined ? undefined : documentationPath(args.path, true);
    const documents = [...this.documents].filter(([file]) => path === undefined || file === path || file.startsWith(path + '/'));
    if (path !== undefined && !documents.length) throw new Error('DOCS_NOT_FOUND: 未登记此 Markdown 文件或目录。');
    // Each search has its own worker: VM's synchronous timeout must not block stdio/read.
    return new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const { Script } = require('node:vm');
        try {
          parentPort.postMessage({ value: JSON.parse(new Script(workerData.program).runInNewContext(workerData.context,
            { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } })) });
        } catch (error) {
          parentPort.postMessage({ error: error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
            ? 'DOCS_SEARCH_LIMIT: 搜索超过 100ms，请缩小范围或简化表达式。'
            : 'DOCS_INVALID_REGEX: 正则表达式无效。' });
        }
      `, { eval: true, workerData: { program: searchProgram, context: {
        pattern, mode, documents, maxResults: args.maxResults ?? 10,
      } } });
      let received = false;
      worker.once('message', message => {
        received = true;
        if (message.error) reject(new Error(message.error)); else resolve(message.value);
      });
      worker.once('error', reject);
      worker.once('exit', code => { if (!received) reject(new Error(`DOCS_SEARCH_FAILED: 搜索进程退出 (${code})。`)); });
    });
  }
}

export async function loadDocumentation(directory: string, diagnostic: (message: string) => void = message => console.error(message)): Promise<Documentation> {
  const root = resolve(directory), documents = new Map<string, string>();
  try {
    if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) throw new Error();
    async function collect(local: string) {
      const path = join(root, local), info = await lstat(path);
      if (info.isSymbolicLink() || await realpath(path) !== path) { diagnostic(`DOCS_PACKAGE: 跳过链接 ${local}`); return; }
      if (info.isDirectory()) {
        for (const name of (await readdir(path)).sort()) await collect(local ? local + '/' + name : name);
      } else if (info.isFile() && local.endsWith('.md')) documents.set(local, await readFile(path, 'utf8'));
    }
    await collect('');
  } catch { throw new Error('DOCS_PACKAGE_UNAVAILABLE: 无法读取随包文档。'); }
  if (!documents.get('AGENTS.md')?.trim()) throw new Error('DOCS_PACKAGE_UNAVAILABLE: 缺少非空 AGENTS.md。');
  const skills: Skill[] = [], invalid = new Set<string>();
  const skillRoot = '.agents/skills/';
  const directories = new Set([...documents.keys()].filter(file => file.startsWith(skillRoot)).map(file => file.split('/')[2]));
  for (const directory of [...directories].sort()) {
    const file = skillRoot + directory + '/SKILL.md';
    try {
      const header = documents.get(file)?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      if (!header || header.length > 8192) throw new Error();
      const document = parseDocument(header);
      if (document.errors.length || document.warnings.length) throw new Error();
      const data = document.toJS({ maxAliasCount: 0 });
      if (!data || typeof data.name !== 'string' || data.name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name)
        || data.name !== directory || typeof data.description !== 'string' || !data.description.trim() || data.description.length > 1024) throw new Error();
      skills.push({ name: data.name, description: data.description, file });
    } catch { invalid.add(directory); diagnostic(`DOCS_SKILL_INVALID: 不发布 ${file}`); }
  }
  // Requiring name === directory makes valid skill identities unique.
  for (const file of documents.keys()) if (file.startsWith(skillRoot) && invalid.has(file.split('/')[2])) documents.delete(file);
  return new Documentation(new Map([...documents].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), skills.filter(skill => !invalid.has(skill.name)));
}
