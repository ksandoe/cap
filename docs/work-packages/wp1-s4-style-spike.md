# S4 spike: can the simulator's styles live inside a CAP page?

**Status:** findings, 2026-11-20. Task S4 of `docs/work-packages/wp1-sim-in-cap.md`.
**Answer:** yes, as a component, with three changes: scope the simulator's stylesheet, add a small shield for CAP's global element rules, and replace the simulator's window-based sizing with container-based sizing. The iframe fallback is not needed for styling.

## What I tested

A throwaway harness (branch `wp1-style-spike`, not for merge) adds a route `/sim-spike` to the student app. It renders the simulator inside the CAP page with its stylesheet scoped under `.sim-root`, and below it the same simulator standalone in an iframe, with no CAP styles and the original stylesheet. Both are the same width and share the same data, so I clicked through the same screens in both and compared computed styles element by element: colors, fonts, margins, padding, borders, display, position, spacing and cursor.

## Findings

**1. The stylesheets rarely collide by name.** The simulator has 125 class names and CAP's student app has 68. Only one is shared, `.active`. The danger is not class names but global rules:
- the simulator has two, `*` and `body` (page margin, font family `72`, background `#f5f6f7`, text color)
- CAP has several: `*`, `body`, `h2`, `h3`, `button`

**2. Unscoped, the simulator restyles the whole CAP page.** Loading its stylesheet unscoped changed CAP's body background from `#f8f8f7` to `#f5f6f7`, the font from `system-ui` to `72`, and the text color. **Scoped** under `.sim-root` (the `*` and `body` rules mapped to the wrapper), CAP's page was unchanged.

**3. Scoped, the simulator looks the same as standalone, except for CAP's `h2` and `h3` rules.** Screens compared, with identical element counts in both copies:

| Screen | Elements | Style differences |
|---|---|---|
| Intro | 17 | none |
| Inquiry background | 28 | `h2` and `h3`: CAP's global rules change color, margins and font size |
| Activity, Easy Access menu | 136 | none |
| Menu with Logistics ▸ … ▸ Inquiry ▸ Create expanded | 321 | none |
| VA11 initial screen | 96 | none |
| VA11 overview, and the Reference Documents dialog | 97 | none |

The Background screen will not be shown in the embedded activity (the instructions come from CAP's recipe), but `h3` also heads Document Flow and other panels, so the leak is real. A **shield** fixes it: a block in the scoped stylesheet that reverts only the properties CAP sets, with higher specificity than CAP's bare element selectors:

```css
.sim-root h1, .sim-root h2, .sim-root h3, .sim-root h4 { color: revert; margin: revert; font-size: revert; }
.sim-root button { font: revert; cursor: revert; }
```

With the shield, the differences went from 2 elements to 0.

**4. UI5 dialogs keep their content inside the scope.** The dialog's content stays in the component tree under `.sim-root`, and only its shadow content goes into UI5's separate static area. So the scoped selectors still match dialog content.

**5. The simulator is built around the browser window, not a container.** This is the larger job, and it belongs to S3:
- `.app-shell { min-height: 100vh }`: inside a CAP page it measured 1,264px, exactly the viewport height.
- `.status-bar { position: fixed; left: 0; right: 0; bottom: 0 }`: it anchors to the browser window, not the activity frame. Measured: it spans the window width and sits at the window bottom, outside the simulator's container.
- `.sap-menu-backdrop { position: fixed; inset: 0 }`: the click-away layer behind an open menu would cover all of CAP.
- `.order-scroll { max-height: min(560px, calc(100vh - 300px)) }`: depends on window height.
- `ActivityLayout` chooses its layout from `window.innerWidth`. It is not used in embedded mode.

## Recommendation for S3

1. **Scope with a PostCSS plugin.** The harness plugin works: it prefixes every rule with `.sim-root`, maps `body`, `html` and `:root` to the wrapper, maps `*` to the wrapper and its descendants, and leaves `@keyframes` alone. Put it in `packages/sim-web` and use it in both the student app's Vite config and the simulator's own, with `SimWorkspace` and the standalone `main.tsx` both wrapping the app in `.sim-root`. One code path then serves both, and the standalone app stays identical to the embedded one.
2. **Append the shield block** to the simulator's stylesheet.
3. **Make the layout container-based.** `.sim-root` gets `position: relative` and a height from its parent. The status bar becomes `position: sticky; bottom: 0` (or absolute inside the container), the menu backdrop becomes absolute inside the container, `.app-shell` drops `100vh`, and the order scroll area uses the container's height.
4. **Keep the iframe as a fallback only.** It is not needed for styling.

## Not covered (do before calling S3 done)

- The Quotation and Order screens, Create with Reference, the customer search help, Item Data and Header Data panels, and Document Flow. The checked screens used the same styles, so I expect no new differences, but the shield only covers the elements I listed.
- Real browser rendering at desktop widths. My viewport was 450px wide and the check compares computed style values, not screenshots.
- Keyframe name clashes and the global effects of UI5's `ThemeProvider`. I checked CAP's body styles only.
- Future global element rules added to CAP's stylesheet. A convention helps: add them under a class, not bare `h2` or `button`.

## To rerun

Check out `wp1-style-spike`, run `npm ci`, run the student app's dev server, and open `/sim-spike`. The two css files in `packages/frontend-student/src/spike/` are copies of the simulator's stylesheet; refresh them first.
