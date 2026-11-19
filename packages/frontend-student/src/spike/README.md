# Style-scoping spike (work package 1, task S4): NOT FOR MERGE

Throwaway harness. Route `/sim-spike` renders the simulator inside a CAP page with its css scoped under
`.sim-root` (PostCSS plugin in `vite.config.ts`), and, below it, the same simulator standalone in an
iframe (`/sim-standalone.html`, plain css, no CAP css). Both are the same width, so computed styles
can be compared in the browser console. Findings: `docs/work-packages/wp1-s4-style-spike.md`.
The two css files here are copies of `packages/sim-web/src/index.css`; refresh them before rerunning.
