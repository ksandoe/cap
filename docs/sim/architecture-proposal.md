# Architecture & Data Model Proposal — Sales Process PoC

Status: **draft for discussion**, not yet decided. Nothing here is built. Once pieces are
confirmed, split them into individual notes under `docs/decisions/` per the convention in
`CLAUDE.md`.

Source material: Parand's live exercise, *The Sales Process in SAP* (Canvas assignment,
extracted to text from `The Sales Process in SAP.pdf`), reconciled against `CLAUDE.md`'s
requirements and CAP's existing `VerificationResult` contract
(`../cap/packages/backend/src/services/sap/sapConnector.ts`).

---

## 1. What the live exercise actually does (relevant parts only)

Reading the PDF end to end, stripped of anything tied to real SAP login mechanics:

1. **Create Inquiry (VA11)**: Inquiry type `IN`, sales org `UE00`, distribution channel `WH`,
   division `BI` → search and select customer **Philly Bikes** → enter Cust. Reference (the
   student's ID), Customer Ref. Date (today), Valid From (today) / Valid To (+1 month) → search
   and add two materials (Deluxe Touring Bike, Professional Touring Bike) with quantities (5 and
   2) → net value calculates automatically (**$21,400**, fixed) → open each item's **Sales A**
   tab and set **Order Probability** to 70% (default was 30%) → **Expected order value**
   recalculates as net value × probability → Save → SAP assigns a document number, shown only in
   the status bar.
2. **Create Quotation (VA21), with reference**: Quotation type `QT` → **Create with Reference**
   → search dialog finds the inquiry by the student's Cust. Reference → **Copy**, which carries
   the customer, materials, quantities forward → re-enter Cust. Reference / dates (quotation gets
   its own validity window and a **Requested Delivery Date**) → pressing Enter triggers a
   **warning dialog** that must be acknowledged, then an **informational message** that must also
   be acknowledged → **pricing**: add condition type **K004** (material discount), amount $50, to
   the Deluxe Touring Bike item only → back out to header → add condition type **RA00** (percent
   discount), 5%, at the header level → the 5% doesn't apply until an explicit **activate**
   action → Save → new document number in the status bar.
3. **Create Sales Order (VA01), with reference**: Order type `OR` → **Create with Reference** →
   search dialog finds the quotation by Cust. Reference → **Copy**, carrying everything forward
   including the already-discounted pricing and the delivery date → re-enter Cust. Reference /
   date → Save → order number shown in a save-confirmation at the bottom; this is the number the
   student reports as proof of work.
4. Document Flow (**VA03**, implied, not shown in the PDF) is where CAP's verification question
   gets answered in real SAP: does the order exist, trace back to its quotation and inquiry, and
   carry the right net value.

Things in the PDF that are **not relevant** to the simulation and should be dropped or replaced:

- The "3-digit SAP ID / `learn-###` login" mechanic — replaced by a synthetic **student key**
  (see §4).
- Company code `155` and the SAP-logon-specific warnings about it.
- Menu paths phrased as literal SAP GUI navigation (`SAP Menu ► Logistics ► ...`) — the sim can
  reproduce the *screens* without reproducing the *IMG menu tree*; a simple left nav or direct
  links to the three transactions is enough for the learning goal.
- Points/rubric/submission-box mechanics — that's Canvas/CAP's job, not the sim's.

Two numbers worth flagging for Parand, since the exercise brief says *"discount, quantity and
order probability are fixed per assignment"*: the PDF's $21,400 is the **pre-discount inquiry net
value**; the quotation/order net value after the $50 item discount and 5% header discount is a
*different*, smaller number. Whichever value CAP checks for an assignment needs to be computed
from this engine, not hand-typed, or the two will drift the moment someone changes a condition
amount.

---

## 2. High-level architecture

```
sap-sim/
├── apps/
│   └── web/                  # React + Vite SPA, UI5 Web Components
├── packages/
│   ├── engine/                # pure TS: document model, pricing, validation, quirks — no UI, no DB
│   ├── server/                 # thin Node/Express API over the engine + SQLite
│   └── shared/                 # types shared between engine/server/web (Document, Event, Assignment config)
└── docs/
    └── decisions/
```

- **Stack**: TypeScript + React + Vite, matching CAP, as `CLAUDE.md` leans toward. UI5 Web
  Components (`@ui5/webcomponents`, `@ui5/webcomponents-react`) for the Fiori shell, tables, and
  form controls — gets a legitimate SAP-like look for free without touching SAP's branding or
  proprietary assets.
- **Backend**: a small Node/Express service with **SQLite** (via `better-sqlite3` or Prisma),
  running locally with no external services, per the "zero external services" constraint. A real
  (if minimal) backend — rather than `localStorage` — is what makes "leave and resume" and
  "revisit completed documents later" actually durable across browser/device changes, which
  matters for a 300–500-student online course where students will absolutely close the tab
  mid-document.
- **Why split `engine` from `server`**: the pricing/validation/quirk logic is exactly the part
  CAP's verification question depends on (net value, ownership, existence) and exactly the part
  most likely to be reused or embedded differently later (e.g., run client-side for instant
  feedback, or imported directly by a CAP-side `SAP_MODE=sim` connector instead of going over
  HTTP). Keeping it pure and dependency-free (no Express, no SQLite types leaking in) keeps that
  option open.
- **Data-driven transactions**: each of VA11/VA21/VA01 (and VA03 as a read-only view) is a
  **config object**, not a bespoke screen. See §5. This is what lets Shipping/Billing modules get
  added later mostly through configuration, as `CLAUDE.md` asks for.
- **Event log**: append-only `events` table, one row per meaningful student action, written by
  the server on every state-changing API call plus a few client-reported UI events (field focus/
  blur for time-on-field, error dismissals) — see §6.

---

## 3. Data model

### Reference / config data (seeded, same for every student in an assignment)

```ts
Customer {
  id: string            // "PHILLY_BIKES"
  name: string
  country: string
}

Material {
  id: string             // "DXTR1" — may get a per-student suffix, see Assignment.materialNaming
  description: string
  basePrice: number
}

ConditionTypeDef {
  code: string            // "K004" | "RA00"
  name: string            // "Material Discount" | "Net Discount (%)"
  level: 'item' | 'header'
  calcType: 'amount' | 'percent'
  requiresActivation: boolean   // true for RA00, per the exercise's "activate" step
}

Assignment {
  id: string
  title: string
  customerId: string
  materialNaming: 'shared' | 'per-student-suffix'   // supports "material numbers may vary per student"
  scenario: {
    items: { materialId: string; quantity: number }[]
    inquiryOrderProbability: number        // e.g. 70
    itemConditions: { materialId: string; conditionCode: string; amount: number }[]   // K004 $50 on DXTR1
    headerConditions: { conditionCode: string; amount: number }[]                     // RA00 5%
  }
  expectedNetValue: {
    inquiry: number       // computed by the engine from scenario, stored for fast verification
    quotation: number
    order: number
  }
  quirks: QuirkConfig      // see §5
}
```

`expectedNetValue` is **derived**, not authored — a seed script runs the same pricing engine the
student's UI uses and stores the result, so the "verification key" can never drift from the
engine's own math.

### Student-generated data

```ts
SalesDocument {
  id: string                       // "INQ-000042", "QUO-000017", "ORD-000031"
  docType: 'inquiry' | 'quotation' | 'order'
  assignmentId: string
  studentKey: string                // synthetic student identity, see §4
  predecessorId: string | null      // inquiry has null; quotation -> inquiry id; order -> quotation id
  customerId: string
  custReference: string             // == studentKey, by convention, mirroring the exercise
  custReferenceDate: string
  validFrom: string | null          // inquiry/quotation only
  validTo: string | null
  requestedDeliveryDate: string | null   // quotation/order
  items: SalesDocumentItem[]
  headerConditions: AppliedCondition[]
  netValue: number                  // recomputed by the engine on every change, never hand-edited
  status: 'in_progress' | 'complete'
  createdAt: string
  savedAt: string | null
}

SalesDocumentItem {
  lineNumber: number
  materialId: string
  quantity: number
  orderProbability: number | null   // inquiry only
  itemConditions: AppliedCondition[]
  itemNetValue: number
}

AppliedCondition {
  conditionCode: string             // "K004" | "RA00"
  amount: number
  active: boolean                   // models the RA00 "must activate" quirk
}

Event {
  id: string
  studentKey: string
  assignmentId: string
  docId: string | null
  type: EventType                   // see §6
  payload: Record<string, unknown>
  occurredAt: string                 // absolute ISO timestamp
  relativeMs: number                 // ms since this student's session for this assignment started
}
```

### Document flow

Not a separate stored entity — it's a query: walk `predecessorId` from an order back to its
quotation back to its inquiry. The VA03-equivalent screen is just a render of that chain plus
each document's status and net value, which doubles as the "see data most students never see in
real SAP" teaching moment `CLAUDE.md` calls out.

---

## 4. Student identity (replacing the 3-digit SAP ID)

The PDF's "3-digit SAP ID" did three jobs: filtered the customer search, filtered the material
search, and became the Cust. Reference on every document (which is also how create-with-reference
finds the right predecessor). None of that depends on a real SAP login.

Proposal: a single **`studentKey`** (opaque string, synthetic — e.g. a short hash, not a real
student ID), supplied by CAP when it launches the sim, or generated locally when the sim is run
standalone for Parand's review. It plays the same three roles the 3-digit ID played:

- Pre-selects/filters the Sold-To Party and Material search dialogs to that student's scenario
  (keeps the "search and pick from a restricted list" interaction, which is one of the quirks
  worth keeping, without needing real customer-master data per student).
- Is auto-filled as Cust. Reference, and is what "Create with Reference" searches against.
- Is the ownership key CAP's verification question needs ("does this order belong to *this*
  student").

This also directly answers "Some identifiers and material numbers may vary per student": if
`Assignment.materialNaming === 'per-student-suffix'`, material IDs get the studentKey appended at
seed/display time; the pricing and quirks logic never needs to know which mode is active.

---

## 5. Data-driven transaction config (and where the quirks live)

Each transaction is a sequence of **steps**, each step a list of **fields**, each field carrying
its own validation and quirk metadata:

```ts
TransactionConfig {
  id: 'VA11' | 'VA21' | 'VA01'
  createWithReference?: { predecessorDocType: 'inquiry' | 'quotation'; searchBy: 'custReference' }
  steps: StepConfig[]
}

StepConfig {
  id: string
  fields: FieldConfig[]
  warningsOnAdvance?: WarningConfig[]     // e.g. the quotation's warning + info dialog on first Enter
}

FieldConfig {
  name: string
  label: string
  required: boolean          // drives the asterisk + the "overlooked required field" quirk
  copiedFromPredecessor?: boolean
  editableAfterCopy?: boolean
}

WarningConfig {
  condition: (doc) => boolean
  message: string
  kind: 'warning' | 'info'
  dismissAction: 'enter' | 'checkmark'
}
```

This is where every quirk `CLAUDE.md` lists becomes config, not bespoke screen code:

| Quirk | Mechanism |
|---|---|
| Asterisked required fields students skip | `FieldConfig.required`; Save is blocked with a field-level error list, not a silent no-op |
| Warnings needing Enter/Continue, sometimes stacked | `StepConfig.warningsOnAdvance`, an ordered array — the quotation step literally needs two entries (warning, then info) |
| Doc number shown only in the status bar | A persistent bottom status-bar component, not a modal/toast — the save response doesn't open a dialog, it just updates the bar, so students have to learn to look there |
| Blank page / new tab after save | Configurable per transaction (`postSaveBehavior: 'blank-tab' \| 'none'`), with the app immediately explaining in-product: *"This blank tab is normal — SAP does this too. Go back to your other tab."* |
| Create with reference | `TransactionConfig.createWithReference` — search-by-studentKey dialog, then field-level copy with `copiedFromPredecessor` |
| Save incomplete, resume later | `SalesDocument.status`, plus a "My Documents" worklist filtered by `studentKey` |

The pricing engine is a separate, smaller piece: given a document's items and conditions, compute
item net value (`qty × basePrice`, then apply active item-level conditions), then header net value
(sum of item net values, then apply active header-level conditions, honoring
`requiresActivation`). It's the same function whether it's running in the seed script (to produce
`expectedNetValue`), in the UI (live recalculation as the student edits), or — if useful later —
server-side as a check independent of whatever the client sent.

---

## 6. Event log

One `events` row per meaningful action, append-only, keyed by `studentKey` + `assignmentId`, with
both an absolute timestamp and a `relativeMs` since that student's first action on that
assignment (so "time per step" doesn't require joining against a separate session-start table).

Minimal event vocabulary to start:

`assignment_started, step_viewed, field_error_shown, warning_shown, warning_acknowledged, document_saved, document_save_blocked (validation failed), document_resumed, search_dialog_opened, search_dialog_selected, create_with_reference_used, document_flow_viewed`

That's enough to answer the three engagement questions `CLAUDE.md` names: time per step
(`relativeMs` deltas between `step_viewed` events), repeated errors (`field_error_shown` /
`document_save_blocked` counts per field), and abandoned documents (`assignment_started` or
`document_resumed` with no following `document_saved` with `status: 'complete'`).

---

## 7. CAP integration contract

Extends, rather than replaces, CAP's existing `VerificationResult` shape, so `SAP_MODE=sim` can
drop in next to `stub`/`live` without CAP's callers changing shape unexpectedly:

```ts
// New, richer result the sim's connector returns; stub/live can keep returning the narrower
// existing shape, or get backfilled to match.
interface SimVerificationResult {
  allPresent: boolean
  foundDocs: string[]
  missingTypes: string[]
  documents: {
    docType: 'inquiry' | 'quotation' | 'order'
    docId: string | null
    exists: boolean
    ownedByStudent: boolean          // docId's studentKey === the requested studentKey
    netValue: number | null
    expectedNetValue: number
    netValueMatches: boolean
  }[]
}
```

Exposed as `GET /api/verify?studentKey=...&assignmentId=...` on the `server` package. A CAP-side
`SAP_MODE=sim` implementation of `sapConnector.ts` calls this endpoint instead of SAP's OData API
and maps the response down to whatever shape CAP's verification caller currently expects,
expanding it over time as CAP's own verification logic grows to use `ownedByStudent` and
`netValueMatches` instead of just existence.

---

## 8. Open questions for Parand / Kent before building

1. **Scope of the thin slice**: build all three transactions + document flow first (matches
   "Status" section's stated next step), or get one transaction (Inquiry) fully polished —
   quirks, lead-in, event log — before extending to Quotation/Order? Proposal: all three, but
   shallow on polish, so Parand can react to the *whole* flow rather than one excellent screen.
2. **Per-student material numbers**: does the PoC need `per-student-suffix` materials for the
   first demo, or is a shared material catalog (same DXTR1/PRTR1 for everyone, only quantities/
   discounts fixed per assignment) enough to show the concept? Shared is less seed-data work.
3. **Net value target for Parand's demo assignment**: should the PoC replicate the PDF's exact
   numbers (5 Deluxe + 2 Professional, $50 K004, 5% RA00) so Parand can compare directly against
   the real SAP exercise's expected net value?

---

## 9. Lead-in explanations (see companion doc)

The content for the three pre-step explanations (Inquiry, Quotation, Sales Order) is drafted
separately in `docs/lead-in-content.md`, since it's instructional copy rather than an architecture
decision, and Parand will likely want to edit the wording directly.
