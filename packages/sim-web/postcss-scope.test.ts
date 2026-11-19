import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import scopeSimStyles, { scopeSelectorList } from './postcss-scope.mjs';

const run = async (css: string, from: string) => (await postcss([scopeSimStyles()]).process(css, { from })).css;
const SIM_FILE = String.raw`C:\repo\packages\sim-web\src\index.css`;

describe('scopeSelectorList', () => {
  it('maps the page-level selectors onto the wrapper', () => {
    expect(scopeSelectorList('body')).toBe('.sim-root');
    expect(scopeSelectorList('html')).toBe('.sim-root');
    expect(scopeSelectorList(':root')).toBe('.sim-root');
    expect(scopeSelectorList('*')).toBe('.sim-root, .sim-root *');
    expect(scopeSelectorList('body .x')).toBe('.sim-root .x');
  });

  it('prefixes everything else, once', () => {
    expect(scopeSelectorList('.a')).toBe('.sim-root .a');
    expect(scopeSelectorList('h3')).toBe('.sim-root h3');
    expect(scopeSelectorList('.a > .b:hover')).toBe('.sim-root .a > .b:hover');
    expect(scopeSelectorList('.sim-root h2')).toBe('.sim-root h2');
    expect(scopeSelectorList('.sim-root--page')).toBe('.sim-root--page');
  });

  it('treats each selector in a list separately and keeps commas inside parentheses', () => {
    expect(scopeSelectorList('.a, .b input')).toBe('.sim-root .a, .sim-root .b input');
    expect(scopeSelectorList('.a:not(.b, .c), .d')).toBe('.sim-root .a:not(.b, .c), .sim-root .d');
    expect(scopeSelectorList('input[value="a,b"]')).toBe('.sim-root input[value="a,b"]');
  });
});

describe('the plugin', () => {
  it('scopes rules in the simulator stylesheet, including inside @media, but not @keyframes steps', async () => {
    const out = await run(
      `body{margin:0} .a{color:red} @media (min-width:1px){.b{color:blue}} @keyframes spin{from{opacity:0}to{opacity:1}}`,
      SIM_FILE,
    );
    expect(out).toContain('.sim-root{margin:0}');
    expect(out).toContain('.sim-root .a{color:red}');
    expect(out).toContain('.sim-root .b{color:blue}');
    expect(out).toContain('from{opacity:0}');
  });

  it('leaves every other stylesheet alone', async () => {
    const css = 'body{margin:0} .a{color:red}';
    expect(await run(css, String.raw`C:\repo\packages\frontend-student\src\index.css`)).toBe(css);
    expect(await run(css, '/repo/node_modules/@ui5/theme.css')).toBe(css);
    expect(await run(css, '/repo/packages/sim-web/src/index.css?inline')).toContain('.sim-root .a');
  });
});
