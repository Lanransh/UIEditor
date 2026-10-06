const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const TOML = require("@iarna/toml");

const SERVER_ID = "ui-editor";
const MANAGED_MARKER = `# UIEditor managed MCP config: ${SERVER_ID}`;
const MANAGED_HELP = "# Toggle this MCP from UIEditor -> Hub -> 设置";
const SERVER_HEADER = `[mcp_servers.${SERVER_ID}]`;
const MANAGED_KEYS = new Set(["command", "args", "enabled"]);

function parseConfig(text, filePath) {
  try {
    return TOML.parse(text);
  } catch {
    throw new Error(`${filePath} 不是有效 TOML，未修改 Codex 配置。`);
  }
}

function readServerStatus(parsed) {
  const server = parsed?.mcp_servers?.[SERVER_ID];
  const configured = Boolean(server && typeof server === "object" && !Array.isArray(server));
  return {
    configured,
    enabled: configured && server.enabled !== false,
  };
}

function findServerSection(lines) {
  const start = lines.findIndex((line) => line.trim() === SERVER_HEADER);
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function bracketBalance(value) {
  let balance = 0;
  let quote = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\" && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (quote) continue;
    if (character === "[" || character === "{") balance += 1;
    else if (character === "]" || character === "}") balance -= 1;
  }
  return balance;
}

function stripManagedAssignments(lines) {
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*([A-Za-z0-9_-]+)\s*=/);
    if (!match || !MANAGED_KEYS.has(match[1])) {
      output.push(lines[index]);
      continue;
    }
    let balance = bracketBalance(lines[index].slice(lines[index].indexOf("=") + 1));
    while (balance > 0 && index + 1 < lines.length) {
      index += 1;
      balance += bracketBalance(lines[index]);
    }
  }
  return output;
}

function buildManagedAssignments({ serverPath, discoveryPath, enabled }) {
  const normalizedServerPath = path.resolve(serverPath).replace(/\\/g, "/");
  return [
    `command = ${JSON.stringify("node")}`,
    `args = [${JSON.stringify(normalizedServerPath)}, ${JSON.stringify("--stdio")}, ${JSON.stringify("--discovery")}, ${JSON.stringify(discoveryPath)}]`,
    `enabled = ${enabled ? "true" : "false"}`,
  ];
}

function updateManagedServer(text, options) {
  const hadTrailingNewline = text.endsWith("\n");
  const lines = text ? text.replace(/\r\n/g, "\n").split("\n") : [];
  if (hadTrailingNewline) lines.pop();
  const section = findServerSection(lines);
  const assignments = buildManagedAssignments(options);

  if (!section) {
    while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length > 0) lines.push("");
    lines.push(MANAGED_MARKER, MANAGED_HELP, SERVER_HEADER, ...assignments);
    return `${lines.join("\n")}\n`;
  }

  const preservedBody = stripManagedAssignments(lines.slice(section.start + 1, section.end));
  while (preservedBody.length > 0 && !preservedBody[0].trim()) preservedBody.shift();
  while (preservedBody.length > 0 && !preservedBody[preservedBody.length - 1].trim()) preservedBody.pop();

  const before = lines.slice(0, section.start);
  if (!before.includes(MANAGED_MARKER)) before.push(MANAGED_MARKER, MANAGED_HELP);
  const replacement = [SERVER_HEADER, ...assignments, ...preservedBody];
  const output = [...before, ...replacement, ...lines.slice(section.end)].join("\n");
  return `${output.replace(/\n+$/, "")}\n`;
}

function createCodexMcpSettingsStore(options = {}) {
  const filePath = path.resolve(options.filePath ?? path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml"));
  const serverPath = path.resolve(options.serverPath ?? path.join(__dirname, "..", "mcp-dist", "server.mjs"));

  const discoveryPath = path.resolve(options.discoveryPath);

  async function readText() {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") return "";
      throw new Error(`无法读取 Codex 配置: ${filePath}`);
    }
  }

  async function getStatus() {
    const text = await readText();
    const status = readServerStatus(parseConfig(text, filePath));
    return {
      configPath: filePath,
      ...status,
      managed: text.includes(MANAGED_MARKER),
      available: await fs.access(serverPath).then(() => spawnSync("node", ["--version"], { windowsHide: true }).status === 0, () => false),
    };
  }

  return {
    getStatus,
    async setEnabled(enabled) {
      if (typeof enabled !== "boolean") throw new Error("ui-editor MCP 开关状态无效。");
      const text = await readText();
      parseConfig(text, filePath);
      if (enabled && !(await getStatus()).available) throw new Error("MCP 启动文件或 Node 不可用。");
      const output = updateManagedServer(text, { serverPath, discoveryPath, enabled });
      parseConfig(output, filePath);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporaryPath, output, "utf8");
      try {
        if (await readText() !== text) throw new Error("Codex 配置已变化，请重试。");
        await fs.rename(temporaryPath, filePath);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
      }
      return getStatus();
    },
  };
}

module.exports = {
  MANAGED_MARKER,
  SERVER_HEADER,
  createCodexMcpSettingsStore,
  updateManagedServer,
};
