import { lstat, mkdir, readdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { readAgentPackage, validateDocumentLinks, validateSkillNames } from './template-styles';

export const AGENT_IGNORE_RULES = ['/Run.bat', '/AgentWorkspace/AGENTS.md', '/AgentWorkspace/Docs/', '/AgentWorkspace/.agents/skills/'];
export const LOCAL_INSTRUCTIONS = `# 项目补充要求

本文件由项目维护并提交到 Git，编辑器仅在缺失时创建，不覆盖已有内容。
项目风格、配色和模板说明放在 styles/Game-DESIGN.md，专项技能放在 styles/skills/。
在这里补充当前项目的制作要求、业务约定及需要读取的项目文档。
`;

async function info(path: string) {
  return lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
}

// Inspect before any write, including parent directories, so synchronization never follows junctions.
async function inspect(path: string): Promise<string[]> {
  const entry = await info(path);
  if (!entry) return [];
  if (entry.isSymbolicLink()) throw new Error(`AI 工作区路径不能是链接：${path}`);
  if (entry.isFile()) return [path];
  if (!entry.isDirectory()) throw new Error(`AI 工作区路径类型无效：${path}`);
  const files: string[] = [];
  for (const name of await readdir(path)) files.push(...await inspect(join(path, name)));
  return files;
}

async function writeChanged(path: string, content: Buffer | string) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const existing = await readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing?.equals(bytes)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function pruneEmpty(path: string) {
  const entry = await info(path);
  if (!entry?.isDirectory()) return;
  for (const name of await readdir(path)) await pruneEmpty(join(path, name));
  await rmdir(path).catch(error => { if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error; });
}

/** Called only when activating a project, never when listing recent projects or inspecting clone sources. */
export async function syncAgentWorkspace(workspace: string, packageRoot: string): Promise<void> {
  const common = await readAgentPackage(packageRoot, ['AGENTS.md']);
  validateDocumentLinks(common);
  validateSkillNames(common);
  // These are the only editor-owned destinations. Project files can never enter this list.
  for (const file of common) {
    if (file.path !== 'AGENTS.md' && !file.path.startsWith(`Docs${sep}`) && !file.path.startsWith(join('.agents', 'skills') + sep)) {
      throw new Error(`公共提示词包包含非编辑器管理文件：${file.path}`);
    }
  }
  const agent = join(workspace, 'AgentWorkspace');
  const agentInfo = await info(agent);
  if (agentInfo && (agentInfo.isSymbolicLink() || !agentInfo.isDirectory())) throw new Error('AgentWorkspace 必须是普通目录。');
  const dotAgents = await info(join(agent, '.agents'));
  if (dotAgents && (dotAgents.isSymbolicLink() || !dotAgents.isDirectory())) throw new Error('.agents 必须是普通目录。');
  const skills = join(agent, '.agents', 'skills');
  await inspect(join(agent, 'Docs'));
  await inspect(skills);
  for (const path of [join(agent, 'AGENTS.md'), join(agent, 'AGENTS.LOCAL.md'), join(workspace, '.gitignore')]) {
    const entry = await info(path);
    if (entry && (entry.isSymbolicLink() || !entry.isFile())) throw new Error(`AI 工作区文件必须是普通文件：${path}`);
  }
  const local = join(agent, 'AGENTS.LOCAL.md');
  const localInfo = await info(local);
  await mkdir(agent, { recursive: true });
  if (!localInfo) await writeFile(local, LOCAL_INSTRUCTIONS, { flag: 'wx' });
  const wanted = new Set(common.map(file => join(agent, file.path)));
  const stale = [...await inspect(join(agent, 'Docs')), ...await inspect(skills)].filter(path => !wanted.has(path));
  for (const file of common.filter(file => file.path !== 'AGENTS.md')) await writeChanged(join(agent, file.path), file.content);
  for (const path of stale) await unlink(path);
  await pruneEmpty(join(agent, 'Docs'));
  await pruneEmpty(skills);
  await writeChanged(join(agent, 'AGENTS.md'), common.find(file => file.path === 'AGENTS.md')!.content);
  const ignorePath = join(workspace, '.gitignore');
  const ignore = await readFile(ignorePath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  const lines = new Set(ignore.split(/\r?\n/).map(line => line.trim()));
  const missing = AGENT_IGNORE_RULES.filter(line => !lines.has(line));
  if (missing.length) await writeChanged(ignorePath, ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
}
