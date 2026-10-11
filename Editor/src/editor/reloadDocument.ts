import type { UIDocument } from '../shared/uiDocument';

export function mergeSavedDocument(saved: UIDocument, current: UIDocument, disk: UIDocument): UIDocument {
  function merge<T>(before: T, local: T, external: T, label: string): T {
    const baseline = JSON.stringify(before), edited = JSON.stringify(local), loaded = JSON.stringify(external);
    if (loaded === baseline || edited === loaded) return local;
    if (edited === baseline) return external;
    throw new Error(`${label}在 App 和文件中都已修改，请先保留需要的版本，再重新打开界面。`);
  }
  const { scripts: savedScripts, ...savedUI } = saved;
  const { scripts: currentScripts, ...currentUI } = current;
  const { scripts: diskScripts, ...diskUI } = disk;
  return { ...merge(savedUI, currentUI, diskUI, 'UI'), scripts: {
    source: merge(savedScripts.source, currentScripts.source, diskScripts.source, 'View 脚本'),
    integration: merge(savedScripts.integration, currentScripts.integration, diskScripts.integration, 'Preview 脚本'),
  } };
}
