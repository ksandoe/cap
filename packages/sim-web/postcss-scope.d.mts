import type { Plugin } from 'postcss';

export const SCOPE: string;
export function scopeSelector(selector: string): string;
export function scopeSelectorList(list: string): string;

declare const scopeSimStyles: { (): Plugin; postcss: true };
export default scopeSimStyles;
