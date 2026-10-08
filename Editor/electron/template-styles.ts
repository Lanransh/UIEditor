import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { robloxStrategy } from '../src/editor/roblox';
import type { TemplateStyle, TemplateStylePreview } from '../src/shared/project';
import type { UIDocument } from '../src/shared/uiDocument';

export interface StyleFile { path: string; content: Buffer }
const ignored = new Set(['node_modules', '.git', '.cache', 'Runtime', 'test-results', 'dist', 'dist-electron']);

export function templateStylesDirectory(packaged: boolean, applicationPath: string, executablePath: string): string {
  return packaged ? join(dirname(executablePath), 'resources', 'TemplateStyles', 'Roblox') : join(dirname(applicationPath), 'TemplateStyles', 'Roblox');
}

async function regular(path: string, directory: boolean) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error(`资源包路径不能是链接或其他文件类型：${path}`);
}

export function styleDirectory(root: string, id: unknown): string {
  if (typeof id !== 'string' || !id || id === '.' || id === '..' || /[\\/:]/.test(id) || basename(id) !== id) throw new Error('模板风格标识无效。');
  return join(root, id);
}

export function projectStylePath(path: string): string {
  return path.startsWith(`template-references${sep}`) ? path : join('AgentWorkspace', path);
}

export function validateDocumentLinks(files: StyleFile[]) {
  const projectRoot = resolve('style-project');
  const paths = files.map(file => resolve(projectRoot, projectStylePath(file.path)));
  for (const file of files.filter(file => file.path.endsWith('.md'))) {
    for (const match of file.content.toString('utf8').matchAll(/\[[^\]]*\]\(([^)\n]+)\)/g)) {
      const link = match[1].replace(/\s+["'][^"']*["']$/, '').replace(/^<|>$/g, '').split('#')[0];
      if (!link || /^(https?:|mailto:)/i.test(link)) continue;
      const destination = decodeURIComponent(link);
      if (isAbsolute(destination) || /^[a-z][a-z0-9+.-]*:/i.test(destination)) throw new Error(`资源包文档含非项目内引用 ${file.path}：${link}`);
      const target = resolve(dirname(resolve(projectRoot, projectStylePath(file.path))), destination);
      const local = relative(projectRoot, target);
      if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`) || !paths.some(path => path === target || path.startsWith(`${target}${sep}`))) {
        throw new Error(`资源包文档引用在项目内不存在 ${file.path}：${link}`);
      }
    }
  }
}

export function validateSkillNames(files: StyleFile[]) {
  const names = new Set<string>();
  for (const file of files.filter(file => file.path.startsWith(join('.agents', 'skills') + sep) && file.path.endsWith(`${sep}SKILL.md`))) {
    const header = file.content.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    const name = header?.match(/^name:[ \t]*["']?([a-z0-9-]+)["']?[ \t]*\r?$/m)?.[1];
    if (!name) throw new Error(`技能缺少有效 name：${file.path}`);
    if (names.has(name)) throw new Error(`工程类型与风格技能同名：${name}`);
    names.add(name);
  }
}

export async function readAgentPackage(directory: string, required: string[]): Promise<StyleFile[]> {
  const label = required.includes('AGENTS.md') ? '工程类型' : '模板风格';
  try { await regular(dirname(directory), true); await regular(directory, true); }
  catch (error) { throw new Error(`无法读取${label} ${basename(directory)}：${(error as Error).message}`); }
  const root = await realpath(directory);
  const files: StyleFile[] = [];
  async function collect(path: string) {
    const local = relative(root, path);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`风格包不允许符号链接：${local}`);
    if (info.isDirectory()) {
      for (const entry of await readdir(path)) {
        if (!ignored.has(entry) && !entry.endsWith('.log') && !entry.endsWith('.tmp')) await collect(join(path, entry));
      }
    } else {
      await regular(path, false);
      const actual = relative(root, await realpath(path));
      if (isAbsolute(actual) || actual === '..' || actual.startsWith(`..${sep}`)) throw new Error(`风格文件越界：${local}`);
      files.push({ path: local, content: await readFile(path) });
    }
  }
  for (const name of required) {
    await regular(join(root, name), false).catch(error => { throw new Error(`无法读取${label}必要文档 ${name}：${(error as Error).message}`); });
    await collect(join(root, name)).catch(error => { throw new Error(`无法读取${label}必要文档 ${name}：${(error as Error).message}`); });
    if (!files.at(-1)!.content.toString('utf8').trim()) throw new Error(`${label}必要文档为空：${name}`);
  }
  for (const name of ['assets', 'references', 'examples', 'template-references', join('.agents', 'skills')]) {
    const path = join(root, name);
    if (name.startsWith('.agents')) {
      const agent = await lstat(join(root, '.agents')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (agent) await regular(join(root, '.agents'), true);
    }
    const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (info) { await regular(path, true); await collect(path); }
  }
  for (const entry of await readdir(root)) {
    if (entry !== 'AGENTS.md' && entry.endsWith('.md') && !required.includes(entry)) {
      await regular(join(root, entry), false);
      await collect(join(root, entry));
    }
  }
  return files;
}

// Snapshot the allowlisted package before creating any project files. Documents
// and resources are copied byte-for-byte; user-authored prompts are never rewritten.
export async function readTemplateStyle(directory: string): Promise<{ files: StyleFile[]; description: string; templateCount: number; preview: UIDocument; templates: TemplateStylePreview['templates'] }> {
  const files = await readAgentPackage(directory, ['Game-DESIGN.md']);
  const templates = files.filter(file => file.path.startsWith(`template-references${sep}`) && file.path.toLowerCase().endsWith('.rbxui.json'));
  if (!templates.length) throw new Error('风格没有可读取的 .rbxui.json 模板。');
  const documents = new Map<string, UIDocument>();
  for (const file of templates) {
    try {
      if (file.content.length > 32 * 1024 * 1024) throw new Error('界面文件超过 32 MiB。');
      const document = robloxStrategy.validate(JSON.parse(file.content.toString('utf8')));
      const visit = (node: typeof document.root) => {
        // A catalog-only reference would depend on the author's global/project
        // image library. Templates must carry their own editable image snapshot.
        if (node.imageAssetId) throw new Error(`图片节点 ${node.name} 仍关联来源图片库 imageAssetId；请使用嵌入 previewImage 与 Image 的独立快照。`);
        node.children.forEach(visit);
      };
      visit(document.root);
      documents.set(file.path, document);
    } catch (error) { throw new Error(`风格模板损坏 ${file.path}：${(error as Error).message}`); }
  }
  validateDocumentLinks(files);
  validateSkillNames(files);
  const design = files.find(file => file.path === 'Game-DESIGN.md')!.content.toString('utf8');
  const description = design.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')) ?? '';
  // The author's first template reference is the cover, not a hardcoded window
  // name. Styles without template links use a stable file-order fallback.
  const linkedTemplate = [...design.matchAll(/\[[^\]]*\]\(([^)\n]+)\)/g)].map(match => {
    const link = match[1].replace(/\s+["'][^"']*["']$/, '').replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^(https?:|mailto:)/i.test(link)) return '';
    return relative(resolve('style-project'), resolve('style-project', 'AgentWorkspace', decodeURIComponent(link)));
  }).find(path => documents.has(path));
  const previewPath = linkedTemplate ?? templates.map(file => file.path).sort((a, b) => a.localeCompare(b, 'zh-CN'))[0];
  return { files, description, templateCount: templates.length, preview: documents.get(previewPath)!,
    templates: [...documents].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([path, document]) => ({ path: relative('template-references', path), document })) };
}

export async function previewTemplateStyle(root: string, id: unknown): Promise<TemplateStylePreview> {
  const directory = styleDirectory(root, id);
  const { templates } = await readTemplateStyle(directory);
  return { directory, templates };
}

export async function listTemplateStyles(root: string): Promise<TemplateStyle[]> {
  const info = await lstat(root).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!info) return [];
  await regular(root, true);
  const styles: TemplateStyle[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith('.')) continue;
    const style: TemplateStyle = { id: entry.name, name: entry.name, description: '', templateCount: 0 };
    try {
      const result = await readTemplateStyle(styleDirectory(root, entry.name));
      style.description = result.description;
      style.templateCount = result.templateCount;
      style.preview = result.preview;
    } catch (error) { style.problem = (error as Error).message; }
    styles.push(style);
  }
  return styles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
