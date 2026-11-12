import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const AGENT_IGNORE_RULES = ['/Run.bat', '/AGENTS.md'];
export const WORKSPACE_INSTRUCTIONS = `# UIEditor 工作区

<!-- UIEditor managed workspace: MCP 文档读取入口。 -->

本工作区由 UIEditor 管理。开始在这里工作时，先调用 ui-editor MCP 的
uie.docs.read({files:["AGENTS.md"]})，读取通用指南与自动发现的技能摘要，
再按任务读取相关 skill 和参考；当前上下文已有必要说明时可复用。
已知包内路径用 uie.docs.read({files:["包内路径"]}) 批量按需读取，不接受 file 参数。
返回 documents 数组，按输入顺序保留重复；任一文件无效整次报错。只有 AGENTS.md 对象含技能摘要。
不知道位置时用 uie.docs.search 定位后按需读取。
公共说明不再复制到工作区；旧 Docs/ 与 .agents/skills/ 副本不再更新，以 MCP 随包文档为准。

先读取项目补充要求 AGENTS.LOCAL.md（@AGENTS.LOCAL.md）。
若有 styles/Game-DESIGN.md，读取风格及其链接的专项技能。
项目要求、风格和授权仍须遵守；文档读取不授予修改或导出权限。
操作前核对 MCP 当前工程与本工作区一致，不直接修改 UI JSON。
`;
export const LOCAL_INSTRUCTIONS = `# 项目补充要求

本文件由项目维护并提交到 Git，编辑器仅在缺失时创建，不覆盖已有内容。
项目风格、配色和模板说明放在 styles/Game-DESIGN.md，专项技能放在 styles/skills/。
在这里补充当前项目的制作要求、业务约定及需要读取的项目文档。
`;

async function info(path: string) {
  return lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
}

async function writeChanged(path: string, content: string) {
  const existing = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing !== content) await writeFile(path, content, 'utf8');
}

/** Only the minimal managed route is refreshed. Never traverse or synchronize project Docs/skills. */
export async function syncAgentWorkspace(workspace: string): Promise<void> {
  const entry = await info(workspace);
  if (entry && (entry.isSymbolicLink() || !entry.isDirectory())) throw new Error('UIEditorWorkspace 必须是普通目录。');
  for (const name of ['AGENTS.md', 'AGENTS.LOCAL.md', '.gitignore']) {
    const file = await info(join(workspace, name));
    if (file && (file.isSymbolicLink() || !file.isFile())) throw new Error(`AI 工作区文件必须是普通文件：${name}`);
  }
  await mkdir(workspace, { recursive: true });
  if (!await info(join(workspace, 'AGENTS.LOCAL.md'))) await writeFile(join(workspace, 'AGENTS.LOCAL.md'), LOCAL_INSTRUCTIONS, { flag: 'wx' });
  const path = join(workspace, 'AGENTS.md');
  const content = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  // Preserve custom entries; only the editor's explicit marker permits replacement.
  if (content === null || content.includes('<!-- UIEditor managed workspace:')) await writeChanged(path, WORKSPACE_INSTRUCTIONS);
  const ignorePath = join(workspace, '.gitignore');
  const ignore = await readFile(ignorePath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  const lines = new Set(ignore.split(/\r?\n/).map(line => line.trim()));
  const missing = AGENT_IGNORE_RULES.filter(line => !lines.has(line));
  if (missing.length) await writeChanged(ignorePath, ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
}
