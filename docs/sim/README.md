# SAP Sales Process Simulator (proof of concept)

A thin, end-to-end slice of the Sales Process PoC described in `CLAUDE.md`: create an inquiry,
create a quotation with reference to it, create a sales order with reference to that, then view
the document flow. Design docs: `docs/architecture-proposal.md` and `docs/lead-in-content.md`.

## Running it locally

Requires Node 20+ (this was built and tested on Node 24). No external services, no accounts, no
API keys — everything (including the database) runs on your machine.

```bash
npm install
npm run dev
```

This starts the API server on `http://localhost:4100` and the web app on `http://localhost:5173`
together. Open `http://localhost:5173` in a browser.

A local SQLite file (`packages/server/sap-sim.db`) holds your progress — delete it to start over
as a brand-new student. Each browser (technically, each browser's `localStorage`) gets its own
anonymous student identity and its own randomly-assigned scenario, so reloading the page resumes
exactly where you left off, and opening it in a different browser gets you a different customer,
materials, and discount amounts.

## What's actually built

- The full wizard flow from `docs/architecture-proposal.md` §10a: Intro → Inquiry (background +
  activity) → Quotation (background + activity) → Sales Order (background + activity) →
  Conclusion (Document Flow), with a progress bar and resume-on-reload.
- Per-student randomized variants (§3a/§3b): customer, materials (one Deluxe + one Professional
  Touring Bike, color randomized), quantities, the K004 item discount, and the RA00 header
  discount all differ per student; order probability is fixed at 70%, per spec.
- The Customer PO Number concept (§3c): system-assigned, typed by the student, used for
  create-with-reference search.
- The quirks called out in `CLAUDE.md`: required-field asterisks, the quotation's stacked
  warning + info dialogs, RA00's "enter it, then Activate it" behavior, the post-save "a blank tab
  may have opened" notice, status-bar-only document numbers, and search-by-name instead of
  search-by-ID.
- The pricing engine (`packages/engine`) is pure and tested (`npm run test -w packages/engine`),
  and is the single source of truth for both the live UI recalculation and the server-side
  verification check — they can never disagree.
- The CAP integration contract from §7: `GET /api/verify?studentKey=...` returns existence,
  ownership, and net-value-match for all three documents.
- The configurable activity layout from §10b (side-by-side / tabbed / drawer), with instructions
  and the simulated screen always on the same step.

## What's simplified or not yet built

This is deliberately a thin slice, not a polished product:

- **Visual fidelity**: UI5 Web Components provide the Fiori look for buttons, dialogs, and message
  strips, but dates use plain HTML date inputs, and the three transaction screens are hand-built
  per step rather than a fully generic form renderer driven by `FieldConfig`.
- **Event log**: the server logs the event types from §6, but there's no dashboard or export for
  an instructor to actually look at them yet.
- **Single assignment**: only the one pilot assignment from §3b is seeded. Multiple assignments,
  a `table`-mode variant pool, or the `fixed` demo-scenario mode (§8, open question) aren't wired
  up yet, though the data model already supports all three.
- **No real CAP connection**: the standalone student identity (an anonymous id in
  `localStorage`) is a stand-in for what CAP would eventually supply. The `/api/verify` endpoint
  is shaped to match what a `SAP_MODE=sim` connector in CAP would call, but nothing in CAP calls
  it yet.
- **No instructor/admin views**: no worklist of all students' documents, no way to inspect a
  specific student's state besides querying the API or the SQLite file directly.

## Repo layout

```
apps/web/            React + Vite + UI5 Web Components — the student-facing app
packages/shared/      TypeScript types shared across the stack (mirrors the architecture doc)
packages/engine/      Pure logic: pricing, variant resolution, seed data, transaction configs
packages/server/      Express + SQLite API
docs/                 Design docs (architecture proposal, lead-in content)
```
