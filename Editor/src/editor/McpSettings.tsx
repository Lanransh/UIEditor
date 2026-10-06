import { useEffect, useState } from 'react';
export function McpSettings({ onClose }: { onClose(): void }) {
  const [status, setStatus] = useState<{ configured: boolean; enabled: boolean; available: boolean; configPath: string } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(true);
  useEffect(() => { void window.automation.invoke('settings:get').then(setStatus).catch(error => setError(String(error))).finally(() => setBusy(false)); }, []);
  async function setEnabled(enabled: boolean) {
    setBusy(true); setError('');
    try { setStatus(await window.automation.invoke('settings:set', enabled)); } catch (error) { setError(String(error)); } finally { setBusy(false); }
  }
  return <div className="mcp-dialog" role="dialog" aria-modal="true" aria-label="配置 Codex MCP">
    <h2>配置 Codex MCP</h2><p>ui-editor · 通过当前编辑器制作与测试界面</p>
    {status && <><p>配置位置：{status.configPath}</p><p>{status.configured ? status.enabled ? '已启用' : '已禁用' : '尚未配置'} · {status.available ? '启动文件与 Node 可用' : '启动文件或 Node 不可用'}</p>
      <button disabled={busy || (!status.enabled && !status.available)} onClick={() => void setEnabled(!status.enabled)}>{status.enabled ? '禁用 MCP' : '启用 MCP'}</button>
      <button disabled={busy || !status.available} onClick={() => void setEnabled(true)}>修复启动路径</button></>}
    {error && <p role="alert">{error}</p>}<p>配置后请在 Codex 中重新连接 MCP；调用工具前需打开 UIEditor 工程。</p>
    <button disabled={busy} onClick={onClose}>关闭</button>
  </div>;
}
