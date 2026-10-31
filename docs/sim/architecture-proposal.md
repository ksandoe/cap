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

Two numbers worth flagging for Parand: the PDF's $21,400 is the **pre-discount inquiry net
value**; the quotation/order net value after the $50 item discount and 5% header discount is a
*different*, smaller number. The original interview notes said quantity/discount/probability are
"fixed per assignment," meaning every student's correct answer is identical — Kent has since asked
to loosen that (see §3a): each student gets their own combination of these values, and therefore
their own correct net value, while the underlying computation (discount stacking, probability
math) stays identical for everyone. Whichever value CAP checks needs to come from the engine's own
calculation for that student's specific parameters, never hand-typed, or the two will drift the
moment a range or table changes.

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
  id: string             // SAP-style customer number, e.g. "127999" — carried over from Parand's
                          // real sandbox master data for flavor; implies no live SAP connection
  name: string
  city: string
  postalCode: string
  country: string         // "US" for the pilot pool
}

Material {
  id: string              // e.g. "DXTR1999" — no per-student suffixing, see §4
  description: string
  basePrice: number        // reasonable wholesale unit price — see §3b for the pilot catalog
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
  customerPool: string[]        // Customer ids this assignment draws from — §3b has the pilot's 12
  materialPool: string[]        // Material ids this assignment draws from — §3b has the pilot's 6
  variantStrategy: VariantStrategy   // replaces a single fixed scenario — see §3a
  quirks: QuirkConfig           // see §5
}
```

`Assignment` no longer carries a single `scenario` or `expectedNetValue` — both are now
per-student, resolved once and persisted on an `AssignmentInstance` (§3a), not authored or
computed at the assignment level.

### 3a. Parameterization: per-student variants

The original interview notes fixed quantity, discount, and order probability per assignment, so
every student's correct net value was identical. Kent has asked to loosen that: each student
should get their own combination of these values — and therefore their own correct net value —
while still being checkable by the same engine. Two generation modes, chosen per assignment:

```ts
type VariantStrategy =
  | { mode: 'fixed'; scenario: ScenarioParams }     // today's single-shared-answer behavior, kept for a quick demo
  | { mode: 'table'; variants: ScenarioParams[] }    // instructor-authored pool, roughly a dozen to a few dozen rows
  | { mode: 'random'; ranges: ScenarioRanges }       // generated within bounds, whole numbers

interface ScenarioParams {
  customerId: string
  items: { materialId: string; quantity: number }[]
  itemConditions: { materialId: string; conditionCode: string; amount: number }[]   // applied to one item, see §3b
  headerConditions: { conditionCode: string; amount: number }[]
  orderProbability: number
}

interface ScenarioRanges {
  customerPool: string[]                  // one picked at random per student
  materialSlots: { role: string; colorPool: string[] }[]   // one material picked at random per slot — e.g. one 'deluxe' + one 'professional'
  quantity: { min: number; max: number }  // per slot, independently
  itemDiscount: {                          // applied to one specific slot's material, by role — not a random pick among slots
    conditionCode: string                  // "K004"
    appliesToRole: string                  // e.g. "deluxe"
    amountMin: number; amountMax: number; step: number
  }
  headerDiscount: {
    conditionCode: string                  // "RA00"
    amountMin: number; amountMax: number; step: number
  }
  orderProbability: number                 // fixed, not randomized — see §3b
}
```

`step` keeps a random range producing numbers that look like real business decisions — e.g. a K004
discount with `amountMin: 25, amountMax: 75, step: 5` only ever lands on $25/$30/.../$75, never
$47. Defaults to 1 (any whole number) when omitted. Everything resolved is a whole number, per
Kent's guidance — no fractional quantities or discount cents.

**Resolving a variant once, per student, and persisting it:**

```ts
interface AssignmentInstance {
  id: string
  assignmentId: string
  studentKey: string
  source: 'fixed' | 'table' | 'random'
  variantIndex: number | null    // which table row, if source === 'table'
  seed: string | null            // studentKey + assignmentId, if source === 'random' — reproducible and auditable
  resolvedParams: ScenarioParams
  expectedNetValue: { inquiry: number; quotation: number; order: number }   // computed once, from resolvedParams
  custPoNumber: string   // system-assigned, student-facing — populates Customer Reference at every
                          // step and is the create-with-reference search key, see §3c
  createdAt: string
}
```

The first time a student touches an assignment (opens VA11), the server resolves their variant —
picks a table row (e.g. `hash(studentKey) % variants.length`, deterministic, no need to track
which rows are "already used") or rolls the ranges with a PRNG seeded from
`studentKey + assignmentId` — runs it once through the pricing engine to get `expectedNetValue`,
and **persists the result**. Every later screen, including a resumed document days later, reads
the already-resolved `AssignmentInstance` rather than re-rolling. That's not just tidiness: a
student who leaves and comes back must see the same quantities and discounts they started with, or
the exercise breaks the exact requirement `CLAUDE.md` already calls out — pause and resume.

For this pilot, `random` is fully specified (§3b) — Kent supplied concrete pools and ranges — so
it's the default, not `table`. `table` and `fixed` stay available in the engine as fallbacks:
`table` for a small hand-picked set an instructor wants to eyeball before trusting a wider random
range, `fixed` for a single demo scenario (e.g., one that matches the PDF's exact numbers — see the
open question in §8).

### 3b. Seed data and generation rules for the pilot assignment

Kent supplied real pool data and concrete randomization rules, pulled from Parand/UCC's own SAP
sandbox master data. Together they fully specify the `random` mode for this assignment.

**Customer pool** (12 customers; one picked at random per student — company code `999` and country
`US` are constant across all of them, carried over from the sandbox for flavor; no live SAP
connection is implied or used):

| Customer ID | Postal Code | City | Name |
|---|---|---|---|
| 129999 | 02210 | Boston | Beantown Bikes |
| 126999 | 10014 | New York City | Big Apple Bikes |
| 127999 | 19073 | Philadelphia | Philly Bikes |
| 135999 | 20003 | Washington, DC | DC Bikes |
| 128999 | 30319 | Atlanta | Peachtree Bikes |
| 132999 | 48076 | Detroit | Motown Bikes |
| 131999 | 49504 | Grand Rapids | Furniture City Bikes |
| 130999 | 60515 | Chicago | Windy City Bikes |
| 125999 | 80207 | Denver | Rocky Mountain Bikes |
| 133999 | 92612 | Irvine | SoCal Bikes |
| 134999 | 94304 | Palo Alto | Silicon Valley Bikes |
| 136999 | 98146 | Seattle | Northwest Bikes |

**Material pool** — down to 6. Kent confirmed the earlier count was a miscount (9, not 8) and
simplified by dropping the 3 GPS-bike computers entirely. Every student gets exactly one **Deluxe**
and one **Professional** Touring Bike, with the **color — and therefore the price — randomized
independently per slot**:

| Material ID | Description | Unit price |
|---|---|---|
| DXTR1999 | Deluxe Touring Bike (Black) | $900 |
| DXTR3999 | Deluxe Touring Bike (Red) | $910 |
| DXTR2999 | Deluxe Touring Bike (Silver) | $940 |
| PRTR1999 | Professional Touring Bike (Black) | $1,200 |
| PRTR3999 | Professional Touring Bike (Red) | $1,210 |
| PRTR2999 | Professional Touring Bike (Silver) | $1,240 |

**Generation rules** — the `ScenarioRanges` for this assignment:

```ts
{
  customerPool: [/* all 12 ids above */],
  materialSlots: [
    { role: 'deluxe',       colorPool: ['DXTR1999', 'DXTR2999', 'DXTR3999'] },
    { role: 'professional', colorPool: ['PRTR1999', 'PRTR2999', 'PRTR3999'] },
  ],
  quantity: { min: 2, max: 11 },                                                                       // independently, per slot
  itemDiscount: { conditionCode: 'K004', appliesToRole: 'deluxe', amountMin: 10, amountMax: 80, step: 10 },   // per unit, deluxe only
  headerDiscount: { conditionCode: 'RA00', amountMin: 2, amountMax: 8, step: 1 },                       // percent, whole numbers
  orderProbability: 70,   // not randomized — matches the exercise's own default-then-corrected value
}
```

Resolution procedure, seeded deterministically from `studentKey + assignmentId` (reproducible,
never re-rolled on resume):

1. Pick one customer uniformly from `customerPool`.
2. For each slot (`deluxe`, `professional`), pick one color uniformly from that slot's `colorPool`
   — every student gets exactly one Deluxe Touring Bike and one Professional Touring Bike, just a
   different color (and therefore a different price) each time.
3. For each slot, pick a quantity uniformly in `[2, 11]`, independently.
4. The K004 discount always applies to the `deluxe` slot's material — simplified per Kent, so
   there's no randomness in *which* item gets discounted, only in *how much*: pick the amount
   uniformly from `{10, 20, 30, 40, 50, 60, 70, 80}`. The Professional Touring Bike never gets an
   item discount.
5. Pick the RA00 header discount uniformly from `{2, 3, 4, 5, 6, 7, 8}` (percent).
6. Order probability is fixed at 70 for every student — per Kent, this one isn't randomized; it
   follows the exercise's own 30%-default-corrected-to-70% flow (a §5 quirk, not §3a randomization).
7. Run the result through the pricing engine once to get `expectedNetValue` for inquiry, quotation,
   and order, and persist the whole thing — including a freshly assigned Customer PO Number, §3c —
   as that student's `AssignmentInstance`.

With a $900 price floor (the cheapest Deluxe color) and these ranges, net value can't reach zero or
negative even at the smallest-quantity/largest-discount combination — e.g. 2 × ($900 − $80) = $1,640
for the discounted Deluxe line alone — so this assignment needs no extra guard rule. Worth
re-checking if the catalog or ranges change later.

Search strategy, now that there's no per-student ID doing triple duty, is substantial enough to
cover on its own — see §3c.

### 3c. Search strategy and the Customer PO Number

The 3-digit ID did more than identify a student — per Kent, in the live exercise it was also **part
or all of the customer's PO number**, which is what made "search for your inquiry by Cust.
Reference" work during create-with-reference. Once customers and materials become a shared pool
instead of per-student-unique (§3b), that one ID can't carry all three of its old jobs anymore
(§4), so each search in the flow gets its own, more realistic technique:

- **Finding "your" customer** (Sold-To Party search, when creating the inquiry): the assignment
  brief names the student's assigned customer by name (e.g., *"Beantown Bikes wants pricing on two
  bicycles"*). The student searches the Sold-To Party dialog **by name** — same
  search-and-select interaction as the original exercise, just a realistic search term instead of a
  numeric ID.
- **Finding "your" materials** (Material search, same step): the brief is **dynamically generated**
  from the student's own `AssignmentInstance` and names both materials by full description, color
  included — e.g. *"...pricing on a Deluxe Touring Bike (Red) and a Professional Touring Bike
  (Silver)."* The student searches the Material dialog (e.g. `*TOURING BIKE*`), sees all six
  colors, and selects the two actually named — the same "search a list, pick the right ones"
  interaction as before, with no ambiguity about which color to choose.
- **Finding "your" inquiry/quotation** (Create with Reference, in the quotation and order steps):
  this is where the ID-as-PO-number trick still works well, once reframed correctly — see below.

**The Customer PO Number.** Every document has a **Customer Reference** field, which in real SAP
terms is the customer's own **Purchase Order (PO) number** — a value Philly Bikes (or whichever
customer) assigned using *their own* internal numbering system, not SAP's. To our company's SAP,
it's meaningless except as a label the customer uses for their own request — which is exactly why
it's a separate field from our own system-generated document number, and exactly why
create-with-reference can search on it: searching Customer Reference for `PO-10238` is how a real
rep would look up "the document for that PO," regardless of which customer or materials are on it.

For this PoC, each student's `AssignmentInstance` (§3a) gets one `custPoNumber`, **system-assigned**
at variant-resolution time — a simple per-assignment counter formatted like a real PO
(`PO-10238`, `PO-10239`, ...), per Kent. The student still **types it in by hand** at every step,
exactly like the original exercise's 3-digit ID — only where the value comes from has changed, not
how it's entered. Two reasons it's assigned rather than student-chosen:

- It has to be unique enough that create-with-reference search returns exactly one document, even
  when two students share the same underlying customer.
- Per Kent: a free-text field inviting students to invent their own reference number is a field
  inviting them to type something personal into it (a real ID number, a name, anything) — assigning
  the value sidesteps that risk entirely, consistent with the project's own synthetic-data-only
  constraint (`CLAUDE.md`). If "let students pick their own PO" is revisited later, this concern
  doesn't go away — it would need its own mitigation (e.g. a constrained format, or a short pick
  list) rather than a truly open text field.

Letting students choose or type their own PO number *value* is explicitly **out of scope for this
PoC** — noted as a roadmap item, not something to build now.

`SalesDocument.custReference` (below) is populated from `AssignmentInstance.custPoNumber`, not from
`studentKey` directly. `studentKey` goes back to being a purely internal identity — see §4.

### Student-generated data

```ts
SalesDocument {
  id: string                       // "INQ-000042", "QUO-000017", "ORD-000031"
  docType: 'inquiry' | 'quotation' | 'order'
  assignmentId: string
  studentKey: string                // synthetic student identity, see §4
  predecessorId: string | null      // inquiry has null; quotation -> inquiry id; order -> quotation id
  customerId: string
  custReference: string             // == AssignmentInstance.custPoNumber, the customer's own PO
                                      // number, not studentKey — see §3c
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
standalone for Parand's review. Once customers/materials are pooled (§3b) and Customer Reference is
reframed as the customer's own PO number (§3c), `studentKey` ends up doing one job, not three:

- Is the ownership key CAP's verification question needs ("does this order belong to *this*
  student") — the internal identity every `SalesDocument`, `Event`, and `AssignmentInstance` is
  scoped by.

It is never shown to the student and never typed into a field. The other two jobs the 3-digit ID
used to do are split out elsewhere: search-dialog filtering is replaced by searching by name (§3c),
and Customer Reference is populated by the separate, student-facing `custPoNumber` (§3c) — not by
`studentKey` itself.

On a real SAP instance, customers and materials were numbered per-student for an operational
reason, not a pedagogical one: with hundreds of students sharing one live client, giving everyone
the same customer or material number would mean they were literally editing the same
inventory/master record. Kent confirmed that constraint doesn't apply to a simulation — each
student's documents already live in their own rows, scoped by `studentKey`, so there's nothing to
collide. Per that guidance: **no per-student customer or material numbering.** Instead, a shared
pool of customers and materials (12 and 6 respectively for the pilot — see §3b) backs every
assignment; each student is randomly assigned one customer and two materials from that pool as
part of variant resolution (§3a/§3b), not given uniquely-minted master data. Several students will
land on the same customer or the same material, which is fine — ownership and correctness are
tracked by `studentKey` on the document, not by the uniqueness of the master data it references.

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
  instructions: string                    // Parand's step-by-step text for this one step — see §10b
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
| Create with reference | `TransactionConfig.createWithReference` — search by Customer Reference (the student's PO number, §3c), then field-level copy with `copiedFromPredecessor` |
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

`expectedNetValue` here is read from that student's own `AssignmentInstance` (§3a) — looked up by
`studentKey` + `assignmentId` — not a single constant on `Assignment`, now that net value is
expected to differ student to student by design.

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
2. ~~Per-student material numbers~~ — resolved: not needed in a simulation (§4). A shared pool of
   customers and materials backs every assignment; students are randomly assigned from it.
3. ~~Default variant strategy~~ — resolved for the pilot: `random`, using §3b's fully-specified
   pools and ranges. `table`/`fixed` stay available in the engine for a hand-picked demo set or a
   side-by-side comparison against the PDF.
4. ~~Ranges/step sizes~~ — resolved, see §3b: quantity 2–11 per item, K004 $10–$80 per unit in $10
   steps on one item, RA00 2–8% in whole points, order probability fixed at 70 (not randomized).
5. ~~Material count mismatch~~ — resolved: 9, not 8; GPS computers dropped entirely, down to 6
   (§3b). One Deluxe + one Professional Touring Bike per student, color randomized per slot.
6. ~~Wholesale unit prices~~ — resolved: Kent's exact figures and color mapping (Deluxe: Black
   $900 / Red $910 / Silver $940; Professional: Black $1,200 / Red $1,210 / Silver $1,240), §3b.
7. ~~Per-unit vs. flat item discount~~ — resolved: per-unit, and simplified to always apply to the
   Deluxe Touring Bike only (§3b) — no more randomly choosing which of the two items gets it.
8. ~~Search-by-name UX~~ — accepted, now expanded into §3c with the Customer PO Number concept.
9. ~~PO number format~~ — resolved: a simple per-assignment counter formatted like `PO-10238`
   (§3c). Confirmed the student still types it by hand at every step; only the value's source
   changed (system-assigned, not student-invented) — specifically to avoid a free-text field that
   invites real personal data, per Kent and `CLAUDE.md`'s synthetic-data-only constraint.
   **Roadmap, not a question**: letting students choose/type their own PO *value* stays deferred
   past this PoC; if revisited, the PII concern still needs its own mitigation, not just removal.
10. ~~Fixed demo scenario~~ — deferred, per Kent: not needed right now; a `fixed`-mode variant (for
    a repeatable walkthrough or test fixture, separate from students' random ones) can be added
    later without any design change — `fixed` is already one of §3a's three `VariantStrategy`
    modes, just unused for now.
11. **Read-only completed documents** (§10a): once a document is saved with `status: 'complete'`,
    the wizard shows it read-only by default. Real SAP would allow further edits through a separate
    "change" transaction (VA02/VA12), which is out of scope here — confirm read-only is fine for
    this PoC.
12. **Layout breakpoint** (§10b): 1024px (side-by-side above it, tabbed below) is a placeholder —
    worth tuning once this is tested on real devices, not a hard decision now.

---

## 9. Lead-in explanations (see companion doc)

The content for the three pre-step explanations (Inquiry, Quotation, Sales Order) is drafted
separately in `docs/lead-in-content.md`, since it's instructional copy rather than an architecture
decision, and Parand will likely want to edit the wording directly.

---

## 10. UI shell: wizard flow and activity-screen layout

Kent's proposal: wrap the whole exercise in a wizard — a fixed sequence of blocks with visible
progress, and a configurable layout inside each hands-on block for how instructions and the
simulated SAP screen are arranged.

### 10a. The eight blocks

1. Intro
2. Inquiry background (the §9 lead-in)
3. Inquiry activity (VA11)
4. Quotation background (the §9 lead-in)
5. Quotation activity (VA21)
6. Sales Order background (the §9 lead-in)
7. Sales Order activity (VA01)
8. Conclusion — the natural home for the **Document Flow** view (§3, "Document flow"), so the
   exercise ends exactly where the lead-in content's own closing line already points: "one customer
   request, three linked documents, one dollar value, in one view."

```ts
ActivityFlow {
  assignmentId: string
  blocks: FlowBlock[]      // the 8 above, in order
}

type FlowBlock =
  | { type: 'intro' | 'conclusion'; content: StaticContentRef }
  | { type: 'background'; docType: 'inquiry' | 'quotation' | 'order'; content: StaticContentRef }   // §9's lead-ins
  | { type: 'activity'; docType: 'inquiry' | 'quotation' | 'order'; transactionConfigId: string }    // §5's VA11/VA21/VA01
```

**Gating falls out of the data model that already exists, rather than needing a rule of its own:**
block *N+1*'s activity is simply unavailable until block *N*'s document is saved with
`status: 'complete'` — the same dependency create-with-reference already enforces (you can't
reference a quotation that doesn't exist yet). A student can always navigate *backward* to re-read a
background block or re-view a completed document; a completed document displays read-only (editing
a saved, verified document is out of scope for this PoC — real SAP's separate "change" transactions,
VA02/VA12, aren't being built — flagged in §8). An *incomplete* saved document stays editable, which
is exactly the "save and return later" quirk `CLAUDE.md` asks for.

**Progress**, persisted per `(studentKey, assignmentId)` so it survives the leave-and-resume
`CLAUDE.md` requires:

```ts
FlowProgress {
  studentKey: string
  assignmentId: string
  currentBlockIndex: number     // where the student resumes to
  furthestBlockIndex: number    // the forward-navigation limit
}
```

The 8-block progress indicator is the student-facing version of this: a stepper, current block
highlighted, completed blocks clickable, blocks past `furthestBlockIndex` grayed out.

### 10b. Layout inside an activity block

Within blocks 3/5/7 (the hands-on VA11/VA21/VA01 screens), two panes share the space: **Parand's
step-by-step instructions** and **the simulated SAP screen**. Three layout candidates, auto-picked
by viewport width but overridable by the student:

| Mode | Best for | Behavior |
|---|---|---|
| **Side-by-side** | Wide screens (laptop/desktop) | Both panes visible at once |
| **Tabbed** | Narrow screens (phone, small tablet, or a small window) | One pane visible at a time; the other keeps its state, unseen |
| **Drawer/overlay** | A middle ground, or a student's own preference once they're comfortable | Instructions collapse to a toggle; the SAP screen gets the full width until it's opened |

```ts
type ActivityLayoutMode = 'side-by-side' | 'tabbed' | 'drawer'

interface ActivityLayoutConfig {
  breakpointPx: number          // e.g. 1024 — side-by-side above this width, tabbed below, as the default
  studentOverride: boolean      // true: a visible toggle lets the student pick any mode regardless of width
}
```

This is one app-wide setting, not configured per transaction — students shouldn't have to re-learn
a layout control between Inquiry and Quotation. A student's chosen override is a device-local
preference (e.g. `localStorage`), not state CAP or the event log needs to know about.

**The two panes stay on the same step together, regardless of layout** — the one design decision
underneath all three modes. Both read from the same current-step index into
`TransactionConfig.steps` (§5), which is why `StepConfig` now carries its own `instructions` text
(§5). In side-by-side mode, the instructions pane shows the current step's text next to the live
screen. In tabbed mode, switching to "Instructions" shows the same text; switching back to "SAP
Screen" resumes exactly where the student left off, since the simulated screen never unmounts —
only visibility changes. In drawer mode, the instructions toggle open over (or beside) the
still-visible screen. A quirk like the post-save blank-tab behavior (§5) is an overlay on top of
whichever layout is active, so it needs no separate handling per mode.
