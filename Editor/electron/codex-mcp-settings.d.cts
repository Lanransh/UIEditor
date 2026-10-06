export function createCodexMcpSettingsStore(options: { filePath?: string; serverPath: string; discoveryPath: string }): { getStatus(): Promise<any>; setEnabled(enabled: boolean): Promise<any> };
export function updateManagedServer(text: string, options: { serverPath: string; discoveryPath: string; enabled: boolean }): string;
