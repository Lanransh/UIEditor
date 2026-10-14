import { existsSync, watch, type FSWatcher } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

// Watch the nearest existing parent too, so missing or replaced roots recover.
export function watchAssetDirectory(directory: string, changed: () => void, failed: (error: Error) => void) {
  const root = resolve(directory);
  let watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  function schedule() {
    if (closed) return;
    if (timer) return;
    timer = setTimeout(() => { timer = undefined; attach(); changed(); }, 150);
  }
  function attach() {
    for (const watcher of watchers) watcher.close();
    watchers = [];
    let parent = dirname(root);
    while (!existsSync(parent) && dirname(parent) !== parent) parent = dirname(parent);
    function listen(path: string, recursive: boolean) {
      try {
        const watcher = watch(path, { recursive }, (_event, filename) => {
          const target = filename === null ? null : resolve(path, filename.toString());
          const fromRoot = target === null ? '' : relative(root, target);
          const toRoot = target === null ? '' : relative(target, root);
          const inside = (value: string) => value !== '..' && !value.startsWith(`..${sep}`);
          if (inside(fromRoot) || inside(toRoot)) schedule();
        });
        watcher.on('error', error => { failed(error); schedule(); });
        watchers.push(watcher);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed(error as Error);
      }
    }
    listen(parent, false);
    if (existsSync(root)) listen(root, true);
  }
  attach();
  return () => {
    closed = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    watchers = [];
  };
}
