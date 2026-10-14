const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseConfig(text, filePath) {
  try {
    const config = JSON.parse(text);
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!object(config) || ('mcpServers' in config && !object(config.mcpServers)) ||
      (config.mcpServers && 'ui-editor' in config.mcpServers && !object(config.mcpServers['ui-editor']))) throw new Error();
    return config;
  } catch {
    throw new Error(`${filePath} 不是有效 MCP JSON 配置，未修改 Cursor 配置。`);
  }
}

function createCursorMcpSettingsStore(options) {
  const filePath = path.resolve(options.filePath ?? path.join(os.homedir(), '.cursor', 'mcp.json'));
  const serverPath = path.resolve(options.serverPath);
  const discoveryPath = path.resolve(options.discoveryPath);
  async function readText() {
    try { return await fs.readFile(filePath, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error(`无法读取 Cursor 配置: ${filePath}`);
    }
  }
  async function getStatus() {
    const config = parseConfig((await readText()) ?? '{}', filePath);
    const configured = Object.hasOwn(config.mcpServers ?? {}, 'ui-editor');
    return {
      configPath: filePath, configured, enabled: configured,
      available: await fs.access(serverPath).then(() => spawnSync('node', ['--version'], { windowsHide: true }).status === 0, () => false),
    };
  }
  return {
    getStatus,
    async setEnabled(enabled) {
      if (typeof enabled !== 'boolean') throw new Error('ui-editor MCP 开关状态无效。');
      const text = await readText();
      const config = parseConfig(text ?? '{}', filePath);
      if (enabled) {
        if (!(await getStatus()).available) throw new Error('MCP 启动文件或 Node 不可用。');
        config.mcpServers ??= {};
        const server = config.mcpServers['ui-editor'] ?? {};
        delete server.url;
        config.mcpServers['ui-editor'] = { ...server, command: 'node', args: [serverPath.replace(/\\/g, '/'), '--stdio', '--discovery', discoveryPath] };
      } else {
        if (!Object.hasOwn(config.mcpServers ?? {}, 'ui-editor')) return getStatus();
        delete config.mcpServers['ui-editor'];
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        if (await readText() !== text) throw new Error('Cursor 配置已变化，请重试。');
        await fs.rename(temporaryPath, filePath);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
      }
      return getStatus();
    },
  };
}

module.exports = { createCursorMcpSettingsStore };
