import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { uiEditorCompSource } from '../src/shared/uiCompClass.ts';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'native-bin');
await mkdir(output, { recursive: true });
const bootstrap = await readFile(join(root, 'native', 'bootstrap.luau'), 'utf8');
const marker = '-- UIEDITOR_SHARED_BASE';
if (!bootstrap.includes(marker)) throw new Error('Missing shared UI class injection marker');
await writeFile(join(output, 'bootstrap.luau'), bootstrap.replace(marker, uiEditorCompSource));
await copyFile(join(root, 'native', 'editor.luau'), join(output, 'editor.luau'));
