import type { CSSProperties } from 'react';
import type { PropertyValue } from '../shared/uiDocument';

export const rgba = (color: string, transparency: number) => `${color}${Math.round(255 * (1 - transparency)).toString(16).padStart(2, '0')}`;
export const channels = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
const multiply = (a: string, b: string) => `#${channels(a).map((v, i) => Math.round(v * channels(b)[i] * 255).toString(16).padStart(2, '0')).join('')}`;
function gradientLine(width: number, height: number, rotation: number) {
  const angle = rotation * Math.PI / 180, x = Math.cos(angle), y = Math.sin(angle);
  // Roblox ends the center line at the box edges; CSS projects all four corners.
  const length = Math.min(Math.abs(x) > 1e-10 ? width / Math.abs(x) : Infinity, Math.abs(y) > 1e-10 ? height / Math.abs(y) : Infinity);
  const extent = Math.abs(width * x) + Math.abs(height * y);
  return { x, y, length, inset: extent ? 50 * (1 - length / extent) : 0 };
}
export function gradientStyle(p: Record<string, PropertyValue>, color: string, transparency: number, width: number, height: number): CSSProperties {
  const angle = 90 + (p.Rotation as number);
  const { inset } = gradientLine(width, height, p.Rotation as number);
  // Keep color and alpha interpolation separate, as in Roblox's two sequences.
  return {
    backgroundImage: `linear-gradient(${angle}deg, ${multiply(color, p.ColorStart as string)} ${inset}%, ${multiply(color, p.ColorEnd as string)} ${100 - inset}%)`,
    maskImage: `linear-gradient(${angle}deg, ${rgba('#000000', p.TransparencyStart as number)} ${inset}%, ${rgba('#000000', p.TransparencyEnd as number)} ${100 - inset}%)`,
    opacity: 1 - transparency,
  };
}

export function imageGradient(p: Record<string, PropertyValue>, width: number, height: number) {
  const { x, y, length: extent } = gradientLine(width, height, p.Rotation as number);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${width / 2 - x * extent / 2}" y1="${height / 2 - y * extent / 2}" x2="${width / 2 + x * extent / 2}" y2="${height / 2 + y * extent / 2}" color-interpolation="sRGB"><stop stop-color="${p.ColorStart}" stop-opacity="${1 - (p.TransparencyStart as number)}"/><stop offset="1" stop-color="${p.ColorEnd}" stop-opacity="${1 - (p.TransparencyEnd as number)}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function scrollGeometry(width: number, height: number, canvasWidth: number, canvasHeight: number, thickness: number, x: number, y: number, direction = 'XY') {
  const allowX = direction !== 'Y', allowY = direction !== 'X';
  let horizontal = allowX && canvasWidth > width, vertical = allowY && canvasHeight > height;
  if (allowX && vertical && canvasWidth > width - thickness) horizontal = true;
  if (allowY && horizontal && canvasHeight > height - thickness) vertical = true;
  const windowWidth = Math.max(0, width - (vertical ? thickness : 0));
  const windowHeight = Math.max(0, height - (horizontal ? thickness : 0));
  const maxX = allowX ? Math.max(0, canvasWidth - windowWidth) : 0, maxY = allowY ? Math.max(0, canvasHeight - windowHeight) : 0;
  const positionX = Math.min(maxX, Math.max(0, Math.trunc(x))), positionY = Math.min(maxY, Math.max(0, Math.trunc(y)));
  const thumbWidth = canvasWidth ? Math.min(windowWidth, Math.max(2 * thickness, windowWidth * windowWidth / canvasWidth)) : 0;
  const thumbHeight = canvasHeight ? Math.min(windowHeight, Math.max(2 * thickness, windowHeight * windowHeight / canvasHeight)) : 0;
  return { horizontal, vertical, maxX, maxY, windowWidth, windowHeight, x: positionX, y: positionY, thumbWidth, thumbHeight,
    left: maxX ? positionX / maxX * (windowWidth - thumbWidth) : 0,
    top: maxY ? positionY / maxY * (windowHeight - thumbHeight) : 0 };
}
