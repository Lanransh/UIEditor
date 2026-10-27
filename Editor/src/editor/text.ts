import type { CSSProperties } from 'react';
import type { UINode } from '../shared/uiDocument';
import { auxiliary } from './roblox';

export function textFont(font: unknown): CSSProperties {
  const family = font === 'Arial' ? 'Roblox Arimo' : String(font).startsWith('Gotham') ? 'Roblox Montserrat' : 'Roblox Source Sans Pro';
  return { fontFamily: `'Roblox Symbols', '${family}', 'Microsoft YaHei', sans-serif`, fontWeight: font === 'GothamBold' ? 700 : 400, lineHeight: 1 };
}

let measure: HTMLDivElement | undefined;
export function textFontSize(node: UINode, text: string, width: number, height: number): number {
  if (!node.properties.TextScaled) return Math.floor(node.properties.TextSize as number);
  const constraint = auxiliary(node, 'UITextSizeConstraint')?.properties;
  const min = constraint ? constraint.MinTextSize as number : 1;
  const max = constraint ? constraint.MaxTextSize as number : 100;
  if (!measure) {
    measure = document.createElement('div');
    Object.assign(measure.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    document.body.append(measure);
  }
  Object.assign(measure.style, textFont(node.properties.Font), { width: `${Math.max(0, width)}px` });
  measure.textContent = text || '\u200b';
  let low = Math.ceil(min), high = Math.floor(max);
  while (low < high) {
    const size = Math.ceil((low + high) / 2);
    measure.style.fontSize = `${size}px`;
    if (measure.scrollWidth <= width && measure.getBoundingClientRect().height <= height) low = size;
    else high = size - 1;
  }
  return low;
}
