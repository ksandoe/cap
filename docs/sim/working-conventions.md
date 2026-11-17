# Working on the simulator: conventions

Carried over from the notes kept while building the sap-sim PoC (2026-10 to 2026-11), so that anyone, human or agent, working in `packages/sim-*` can follow them. The simulator's design rules and requirements are in `packages/sim-web/CLAUDE.md`.

## Fidelity review

Kent reviews one real-SAP screen at a time against the real system (perth.cob.csuchico.edu) and sends screenshots or descriptions of the differences. Each message means "implement now":

1. Make the change.
2. `npm run typecheck`, then `npm run test:sim`.
3. Check it in the browser (`npm run dev:sim`, web on 5173, API on 4100).
4. Report in two or three sentences, and ask whether there is more on this screen or whether to move on.

Scope stays on the screen being reviewed. Do not extend a change to other activities unprompted. Commit and push only when asked. Pushing the demo's source branch triggers a rebuild of the shared Amplify demo, so do not push half-finished work.

## Icons

- The real WebGUI does not use the Fiori icon font. It loads one SVG sprite, `SAPGUI-icons.svg`, with ids like `s_b_disp` (display), `s_b_summ` (sum), `s_b_okno` (person with a red cross), `s_dohede` and `s_doitde` (document with a magnifier), `s_b_insr` and `s_b_delr` (add and remove), `s_xprice` (conditions), `s_b_tool` (wrench), `s_b_conf` (gears).
- Those shapes are SAP's own artwork. **Never copy the sprite's path data into this project.** Pick the closest icon from `@ui5/webcomponents-icons` by meaning, and ask Parand and UCC before ever using the originals.
- To identify an icon on the real screen, ask Kent to paste only the output of `[...document.querySelectorAll('use')].map(u => u.getAttribute('xlink:href') || u.getAttribute('href'))` (the WebGUI may be in an iframe), never the whole sprite.
- Look names up in the UI5 icon explorer (https://ui5.sap.com/test-resources/sap/m/demokit/iconExplorer/webapp/index.html#/overview) and confirm the file exists in `node_modules/@ui5/webcomponents-icons/dist` before using it. Guessing names caused repeated correction rounds.

## Established UI conventions

- Labels end in a colon.
- Display-only values get a dotted underline (`.sap-display-value`).
- A label and its value share a line (`.field-row-inline`).
- Matchcode and calendar icons appear only while the field is focused.
- Currency is `1,234.00 USD`, via `formatCurrency`.
- Item Data and similar drill-ins are full-screen navigations, not modals.

## Testing in the browser

- Prefer `find` or `read_page` references and `form_input` over coordinate clicks or script-injected values, which are unreliable with React inputs.
- After many edits Vite's hot reload can go stale. Reload the page before concluding that something is broken.
- When a preview tool injects a `PORT` environment variable, the sim API server reads it. Start the API on 4100 and the web app on 5173 as separate processes, not through `dev:sim`, or both will try to bind the same port.

## The shared demo (Amplify)

The shared demo is a static build with no backend: `VITE_LOCAL_STORAGE_MODE=true` makes `packages/sim-web/src/api.ts` use `localApi.ts` (browser storage) instead of the Express and SQLite server. Each browser keeps its own private data. Any new API function must be added to `networkApi.ts`, `localApi.ts` and the switcher in `api.ts`. The Amplify app is still connected to the old sap-sim repository; see `docs/merge-plan.md` for repointing it.
