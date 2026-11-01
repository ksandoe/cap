# 001 — Handling bad student entries (typos, mistakes, going off-script)

**Decided:** 2026-10-31 (Kent, after his own hands-on testing produced a mistyped PO number, wrong
materials, and a blank screen that should have shown an error instead).

## The question

Kent: "we have two big issues: how to handle bad entries by the student (whether typos or
laziness, they are going to happen). we need a strategy to dealing with them."

## Decision: three tiers, not one blanket rule

1. **Structural errors — block, with a clear message, same as real SAP.** A missing required
   field, a non-numeric quantity, an empty search term: these aren't pedagogically interesting
   mistakes, they're just incomplete input. Block save / block advancing, same as the asterisked
   required-field quirk already does. Real SAP does this too (e.g. the required-field check), so
   it costs nothing in fidelity.

2. **Business-logic errors — never block, never correct, let them flow through to net value.**
   Wrong quantity, wrong discount amount, wrong material, forgetting to raise Order Probability,
   forgetting to Activate RA00: these are exactly the mistakes `CLAUDE.md` says the exercise is
   *for* — "a wrong discount or a missing material produces a wrong or zero net value... Checking
   that an order exists is not enough." The simulator must never tell a student "that's wrong" in
   the moment, the same way real SAP wouldn't know or care whether $40 was the *right* discount to
   authorize. The net value mismatch is the intended feedback signal, and per the existing
   CAP-integration design (§7), that signal surfaces later — to an instructor or to CAP's
   reflective-conversation step — not inline during the task. If this assumption is wrong (i.e. if
   the sim should eventually self-check and flag mismatches to the student), that's a product
   decision for Kent/Parand to make explicitly, not something to back into silently.

3. **Simulator bugs — never allowed, regardless of what the student typed.** A student entering an
   unexpected-but-valid combination (e.g. two Professional bikes and no Deluxe bike) must never
   produce a blank screen, a dead-end, or a crash. This is squarely our bug, not a "bad entry" —
   the fix is to stop hardcoding assumptions about what the student *should* have entered (e.g.
   "K004 always targets whichever item is named DXTR*") and instead build every screen generically
   over whatever the student actually has, the way real SAP does: you select a row, then act on
   *that* row, regardless of what material is in it.

## What this ruled out

- **Auto-correcting or rejecting "wrong" business values.** Would defeat the entire verification
  design — a net value that always comes out right regardless of input tells CAP nothing.
- **Silently guessing intent** (e.g. "did you mean PO-10001?"). Real SAP doesn't do this, and it
  would blur the line between tier 1 and tier 2 in a way that's hard to reason about consistently.

## What changed because of this

- `VA21Quotation`'s Item Pricing step no longer assumes a Deluxe item exists at a hardcoded index;
  the student selects which item to open conditions for (§ this doc, tier 3), and a missing-case
  message replaces what used to be a blank screen.
- Create-with-reference search fields are real, student-typed inputs (not a button pre-filled with
  the "right" answer) — see the `apps/web` commit history around 2026-10-31.
