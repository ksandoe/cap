# 002 — Replicating SAP menu navigation before each transaction

**Decided:** 2026-11-01 (Kent, after his first full hands-on walkthrough of the Fiori-density
rework).

## The question

Kent: "i would like to replicate the menu operations preceding each step." Flagged alongside a
request for even higher screen fidelity, and after offering to upload higher-quality screenshots
per step.

## This reverses an earlier call

`docs/architecture-proposal.md` originally said menu paths "phrased as literal SAP GUI
navigation... should be dropped or replaced," reasoning that "a simple left nav or direct links to
the three transactions is enough for the learning goal." Kent is now asking for the opposite: the
navigation itself (not just the transaction screens) is part of what students should be exposed
to.

## Decision

Reproduce, ahead of each transaction's own screen, the two things "The Sales Process in SAP.pdf"
documents before every transaction:

1. **A SAP Easy Access folder-tree screen** (`EasyAccessMenu` component) showing the literal menu
   path from the PDF (e.g. `Logistics ▸ Sales and Distribution ▸ Sales ▸ Inquiry ▸ Create`), with
   decorative sibling folders at every level (Materials Management, Shipping and Transportation,
   Quotation/Order next to Inquiry, Change/Display/List next to Create, etc.) so the real clutter
   and "which folder was it again" friction comes through, not just the three correct screens.
   Clicking a non-target leaf shows an inline hint instead of silently doing nothing or crashing.
2. **The transaction's own initial/parameter screen** (Inquiry Type `IN` / Sales Org `UE00` /
   Distribution Channel `WH` / Division `BI` for VA11; Quotation Type `QT` for VA21; Order Type
   `OR` for VA01) — a real screen the PDF shows and the sim had been skipping entirely, jumping
   straight to Sold-To Party / Create with Reference.

These values are fixed constants for the exercise, not per-student parameters, so they're shown
pre-filled rather than typed — the point is exposure to the screen and the extra click, not another
field to get wrong.

Each `TransactionConfig` (VA11/VA21/VA01) now carries `menuPath` and `initialScreen` data
(`packages/shared` → `TransactionConfig`, populated in `packages/engine/src/transactionConfigs.ts`
straight from the PDF's own menu-path and initial-screen text), keeping this data-driven rather
than hardcoded per activity component.

## What this ruled out

- **A single shared "launcher" screen listing all three transactions as shortcuts.** Faster to
  build, but defeats the point Kent is making — the menu *is* part of what students should get
  comfortable with.
- **Letting students type values into the initial screen.** These aren't per-student data (unlike
  Customer Reference or materials), so making them fillable would just add friction without
  teaching anything — see tier-1 reasoning in [[001-handling-bad-student-entries]].

## Open follow-up

Kent separately offered to upload higher-quality screenshots per step. Screen layout/icon fidelity
and this menu-navigation work are related but separate — screenshots would sharpen the visual
match of existing screens; they're not required to get the menu/initial-screen structure right,
since the PDF's own text already specifies the exact path and field values.
