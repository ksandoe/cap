# Lead-in content — Inquiry, Quotation, Sales Order

Status: **draft for discussion**. This is student-facing copy, meant to sit on a short interstitial
screen immediately before each transaction's input screen — not a replacement for Parand's
step-by-step instructions, which still walk the student through *how* to fill in the fields. This
is the "why does this step exist, and what happens to the data" layer the instructions don't cover.

Design intent, per `CLAUDE.md`'s learning goal: students should leave each lead-in able to say what
business event this document represents, who else in the company would ever look at it, and which
pieces of data they're about to enter will reappear, untouched, in the next document. That last
point — *data carrying forward* — is the thread that ties all three lead-ins together and is worth
restating each time, not just once.

Each lead-in below is structured as: **where this sits in the bigger process** → **what this
document means in plain business terms** → **what to watch for**. The third part also doubles as
a pre-brief for the quirks the student is about to hit, framed as "here's why SAP behaves this
way" rather than just a warning.

A simple order-to-cash strip could run across the top of every lead-in, with the current step
highlighted:

```
Inquiry  →  Quotation  →  Sales Order  →  (Delivery)  →  (Billing)
  ▲ you are here
```

The parenthesized steps are outside this PoC's scope but are worth showing grayed-out, so students
see the sales process doesn't stop at the sales order — it hands off to logistics and finance next.

**Illustrative images (Kent is sourcing these)**: each lead-in has a natural spot for one generic/
historical image — a paper purchase order, a typed quotation letter, a carbon-copy sales order
form — shown next to "and here's the same document, digitally, in SAP." The content model should
carry an optional `imageRef` per lead-in so one can be dropped in later without touching the
layout; nothing here depends on having one.

---

## Before: Create Inquiry (VA11)

**Where this sits**

Every sale that starts with a customer asking "what would this cost?" begins here, before any
commitment exists on either side. You're about to play the role of an inside sales rep at your
company, fielding a price request from a prospective customer — Philly Bikes — who hasn't bought
from you yet and isn't obligated to.

**What an inquiry actually is**

An inquiry is SAP's record of a *non-binding* request: a customer wants to know about pricing,
availability, or delivery timing for specific products, and your company wants that request on the
books even though nothing has been promised yet. Think of it as the first entry in a sales
pipeline, not a sale. Two things make that concrete in the system:

- Nothing you enter here is a commitment — no stock gets reserved, no invoice gets created.
- SAP still wants you to estimate **Order Probability**: how likely is it that this inquiry turns
  into a real order? That's not a formality. Multiply the net value by that probability and you get
  the **Expected Order Value** — the number sales *forecasting* actually runs on. A company with a
  thousand open inquiries can't plan production or cash flow on "maybe," but it can plan around a
  dollar-weighted expectation. You're generating one data point in that forecast.

**What to watch for**

- You'll search for the customer and for each material instead of typing codes from memory — real
  sales reps don't memorize every customer or SKU either; the search is the normal workflow, not a
  workaround.
- Required fields are marked with an asterisk (`*`). SAP won't let you save past a missing
  required field, but it also won't stop you from *trying* — you'll see exactly what students
  before you have missed.
- Order Probability defaults to a low number (30%). You're instructed to raise it, which is the
  point: SAP never guesses your confidence for you, you have to tell it.
- When you save, **look at the bottom of the screen, not the middle.** SAP confirms your new
  document number in the status bar, not a popup. That number is how you — and the quotation step
  right after this one — find this inquiry again. Write it down, or at least know where to look for
  it.

**Why this matters later**: everything you enter here — the customer, the materials, the
quantities — is about to get copied, untouched, into the quotation. You're not just filling out a
form once; you're setting the data that the rest of this exercise builds on.

---

## Before: Create Quotation (VA21)

**Where this sits**

Philly Bikes looked at your inquiry response and said "okay, formalize that for us." You're now
moving from *gathering information* to *making a commitment*. This is the step where "non-binding"
becomes "binding."

**What a quotation actually is**

A quotation is a legally binding offer: if the customer accepts it as-is, your company has agreed
to deliver those materials, at that price, by that date. That's a meaningfully bigger commitment
than an inquiry, which is why you'll notice SAP is stricter here — more warnings, more required
confirmations — than it was for the inquiry.

You won't retype the customer or the materials. You'll use **Create with Reference** to pull the
inquiry forward by searching for it. This is standard practice in SAP, not a shortcut unique to
this exercise: whenever a new document is the natural next step after an existing one, you
reference the old document instead of re-keying its data. Two business reasons that matters:

- **Data integrity.** If you retyped the materials and quantities by hand, you could introduce a
  typo between the inquiry and the quotation. Copying by reference guarantees the quotation
  matches what you told the customer in the inquiry.
- **Traceability.** Because the quotation stores a pointer back to the inquiry it came from (and
  the order will later point back to the quotation), anyone — you, a manager, an auditor — can
  reconstruct the full history of how a deal progressed. You'll see this chain directly in the
  Document Flow screen once you've created the sales order.

**Pricing: this is where the numbers get real**

The inquiry showed a plain net value. The quotation is where you apply the actual deal terms —
and SAP does this through **pricing conditions**, not by editing a price field directly. Two
condition types, applied at different levels, because they represent different kinds of
business decisions:

- **K004 (material discount)** — an *item-level* condition. You're giving a dollar-amount discount
  on one specific product (the Deluxe Touring Bike), because maybe it's slow-moving inventory or
  you're trying to build volume on that model specifically.
- **RA00 (percentage discount)** — a *header-level* condition. You're giving a blanket percentage
  off the whole order, because you want to reward this customer's overall business, not just one
  product.

Those are genuinely different business levers — "discount this product" versus "discount this
customer's whole order" — and SAP keeps them separate for that reason. You'll apply them in that
order (item first, then header) and watch the net value recalculate each time, so you can see
exactly how much each discount is worth in dollars.

**What to watch for**

- Pressing Enter after re-entering your reference and dates will likely trigger a warning, then an
  informational message — both need an explicit acknowledgment before you can continue. This
  isn't SAP being fussy for its own sake: it's flagging things (like a date that's changed, or
  terms that differ from the inquiry) that a real sales rep should consciously confirm, not click
  past on autopilot.
- The 5% header discount (RA00) won't apply the instant you type it — you'll need to explicitly
  **activate** it. SAP separates "I've proposed this condition" from "this condition is live,"
  which matters in real pricing scenarios where several possible discounts might be evaluated
  before one is chosen.
- Same status-bar quirk as the inquiry: your new quotation number appears at the bottom of the
  screen when you save, not in a dialog box.

**Why this matters later**: the discounted price you land on here — after both conditions are
applied — is the price that carries forward into the sales order. Whatever net value you end this
step with is the number the order (and your grade) will be checked against.

---

## Before: Create Sales Order (VA01)

**Where this sits**

Philly Bikes has accepted your quotation. This is the moment the deal stops being a sales
conversation and starts being an operational commitment — the trigger that, in a real company,
sets delivery and billing in motion. You won't build those downstream documents in this exercise,
but it's worth knowing a sales order is the handoff point where Sales stops owning the process and
Logistics and Finance pick it up.

**What a sales order actually is**

A sales order is your company's formal acknowledgment that it will fulfill the customer's request
exactly as quoted: same materials, same quantities, same negotiated price. It's the document a
warehouse would pick a delivery against and a finance team would eventually invoice against.
That's why, once you create it with reference to the quotation, you'll see almost nothing changes
on the screen — and that's the point, not a bug in the exercise. If the order showed different
numbers than the quotation the customer agreed to, something would have gone wrong.

**What to watch for**

- Same **Create with Reference** pattern as before — search by your reference number, copy the
  quotation forward. By now this should feel familiar: three different document types, one
  consistent way of carrying data between them.
- Almost everything is pre-filled, including the pricing you worked out in the quotation step and
  the requested delivery date. You're mainly confirming, not re-entering.
- Watch the save confirmation at the bottom-left for your new order number. You'll need it — not
  just for this exercise's submission, but because it's also what lets you (or an instructor, or
  this simulation) pull up **Document Flow** afterward and see the whole chain: inquiry →
  quotation → order, in one view, including the net value at each stage.

**Why this matters afterward**: this is the last document you create, but not the last thing worth
looking at. Document Flow is where the whole point of this exercise becomes visible at once — one
customer request, three linked documents, and a dollar value that was shaped by every discount
decision you made along the way. That's the kind of multi-system, multi-document traceability a
real sales order processor relies on every day, and it's something this exercise can show you
directly that the live SAP system, with its own single-document-at-a-time screens, makes easy to
miss.

---

## Open items for Parand

- Confirm the tone/reading level lands right for MINS 301 (intro-level, fully online, large
  enrollment) — this draft leans toward "business explanation" over "SAP terminology," on purpose.
- Decide whether the grayed-out Delivery/Billing steps in the process strip help or just raise
  questions the exercise doesn't answer; easy to cut if they're a distraction.
- Decide whether "What to watch for" should name the exact quirk ("you'll need to activate it") or
  stay vaguer and let students discover it, per the instructional design goal of productive
  struggle. Current draft tells them enough to not be blindsided, without doing the step for them.
