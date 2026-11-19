/**
 * PostCSS plugin: confines the simulator's stylesheet to `.sim-root`, so loading it inside CAP's page
 * cannot restyle CAP (and CAP's own rules reach the simulator only through the shield at the end of
 * `src/index.css`).
 *
 * Add it to the `css.postcss.plugins` of any Vite config that bundles the simulator (the standalone app's
 * and the student app's). It leaves every other stylesheet alone: it acts only on files under
 * `sim-web/src`, so it is safe to register for a whole app.
 *
 *   - `body`, `html` and `:root` become `.sim-root`, so the base font, colour and background belong to
 *     the simulator's wrapper, not to the page.
 *   - `*` becomes `.sim-root, .sim-root *`.
 *   - every other selector gets `.sim-root ` in front; one already starting with `.sim-root` is kept.
 *   - `@keyframes` steps are not selectors and are not touched.
 */
export const SCOPE = '.sim-root';

/** Splits a selector list on top-level commas (not the ones inside `:not(a, b)` or `[attr="a,b"]`). */
function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Scopes one selector (no top-level commas). Returns a comma list, since `*` needs two selectors. */
export function scopeSelector(selector) {
  const s = selector.trim();
  if (s === '*') return `${SCOPE}, ${SCOPE} *`;
  if (s === 'body' || s === 'html' || s === ':root') return SCOPE;
  const rooted = s.match(/^(?:body|html|:root)(?=[\s>+~])\s*(.*)$/s);
  if (rooted) return `${SCOPE} ${rooted[1]}`.trim();
  if (s === SCOPE || s.startsWith(`${SCOPE} `) || s.startsWith(`${SCOPE}.`) || s.startsWith(`${SCOPE}-`) || s.startsWith(`${SCOPE}:`)) return s;
  return `${SCOPE} ${s}`;
}

export function scopeSelectorList(list) {
  return splitSelectors(list).map(scopeSelector).join(', ');
}

const SIM_STYLESHEET = /\/sim-web\/src\/[^?]*\.css(\?.*)?$/;
const isSimStylesheet = (file) => !!file && SIM_STYLESHEET.test(file.split('\\').join('/'));

/** @returns {import('postcss').Plugin} */
export default function scopeSimStyles() {
  return {
    postcssPlugin: 'sim-scope',
    Once(root, { result }) {
      if (!isSimStylesheet(result.opts.from)) return;
      root.walkRules((rule) => {
        const parent = rule.parent;
        if (parent && parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
        rule.selector = scopeSelectorList(rule.selector);
      });
    },
  };
}
scopeSimStyles.postcss = true;
