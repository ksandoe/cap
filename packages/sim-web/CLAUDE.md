# SAP Sales Process Simulator (proof of concept)

A web simulation of the small slice of SAP that the MINS 301 **Sales Process** exercise uses. Students create an inquiry, a quotation with reference to it, and a sales order, then inspect the document flow.

This PoC exists to **inform a decision, not to implement one.** Kent will show it to Parand Mansouri-Rad (SAP content lead) to decide whether a simulation can replace live SAP for some modules in the Spring 2027 pilot. Discussion brief: https://claude.ai/artifact/1BimxxuEqjMHJWoMypyCL3

## Context

- **Parent project:** CAP (Conversational Assessment Platform), a sibling repo at `../cap`. Students do a hands-on SAP task, then have a reflective AI conversation about it. CAP is funded by a CSU LIFT award; the pilot runs in MINS 301 (Chico State, fully online, 300–500 students per semester) in **Spring 2027**. `../cap/CLAUDE.md` has the full project context, team and constraints. Read it when you need background, but this repo is deliberately independent of it.
- **Learning goal:** exposure to enterprise software, comfort with it, and seeing the **business process and its information flows**. Not SAP mastery. Teaching the flow matters more than pixel-perfect fidelity. The simulation can show things real SAP hides, such as how data carries forward from document to document.
- **Precedent:** simulation-based teaching is accepted in the SAP academic community (ERPsim, HEC Montréal). It is unconfirmed whether ERPsim simulates the SAP screens themselves or only the business environment around real SAP, so don't cite it as precedent for simulated screens.
- **People:**
  - Kent Sandoe: PI and product owner, the usual user here
  - Parand: owns the exercise content and the relationship with UCC (the campus SAP hosting center)
  - Aliyah Cardenas: student analyst who tests and interviews

## The slice to simulate

Sequence: **Inquiry → Quotation (with reference to the inquiry) → Sales Order (with reference to the quotation)**. Each document references its predecessor. Approximate SAP transaction codes: VA11 creates an inquiry, VA21 a quotation, VA01 a sales order, and **VA03** displays a sales order and opens **Document Flow**.

Requirements from Parand's interviews:

- **Net value is the verification signal.** The expected net value is the same for every student. A correct net value shows that the earlier steps were done right; a wrong discount or a missing material produces a wrong or zero net value. Checking that an order exists is **not** enough. Verification must confirm the order exists, belongs to *this* student, contains the expected data, and has the right net value.
- **Pricing:** include the pricing conditions the exercise uses: **K004** (material discount) and **RA00** (percentage discount from gross). Discount, quantity and order probability are **fixed per assignment**. Some identifiers and material numbers may vary per student, so support per-student parameters.
- **Quirks to reproduce deliberately**, because students struggle with them and exposure to them is the point:
  - Required fields marked with an **asterisk** that students overlook
  - **Warning messages** that need Enter or Continue, sometimes more than once, before proceeding
  - The generated **document number shown in the status bar at the bottom** of the screen, where students miss it
  - After saving an inquiry or quotation, SAP can open a **blank page or new tab**. Students should learn that this is harmless and to return to the original tab.
  - **Create with reference** (copying data from the predecessor document)
  - Saving before everything is complete, and then **returning to an incomplete document** to finish it
- **Students must be able to leave and resume** (interruptions, crashes, mistakes) and **revisit their completed documents** as reference later.
- **Instructors want engagement signals:** time per step, repeated errors, abandoned documents. Log every meaningful action with a relative timestamp.

## Design leanings (proposals; confirm before building on them)

- **Look and feel:** SAP's **UI5 Web Components** (the open-source Fiori design system, Apache 2.0). They give a legitimate Fiori look without copying SAP branding or proprietary assets. Don't use SAP logos or trademarks.
- **Data-driven transactions:** define screens, fields, validations and quirks as data, so the Shipping, Billing and other modules can be added later mostly through configuration.
- **A document model with explicit document flow:** customers, materials, pricing conditions, and documents linked to their predecessors.
- **Instrument everything:** an append-only event log per student session.
- **CAP integration contract:** design an API that answers CAP's verification question: given a student key and an activity, do the required documents exist, who owns them, and what is the net value? CAP can then add this simulator as `SAP_MODE=sim` next to its `stub` and `live` modes without a rewrite. CAP's existing contract (`VerificationResult` in `../cap/packages/backend/src/services/sap/sapConnector.ts`) only checks that documents exist and will need extending for owner and net value.
- **Keep the stack familiar:** TypeScript, React and Vite, like CAP, unless there's a good reason to differ. Local dev should run with zero external services.

## Constraints (Kent's CSU Claude pilot license terms)

- **Synthetic data only.** No real student data, Level 1/2 data, FERPA records, credentials, API keys or internal endpoints go to Claude. Never read `.env` files or secrets.
- **No connection to the real SAP system,** Canvas or other enterprise systems. Any real integration needs a separate IT and data-owner request.
- Students can't use the Claude license (that includes Aliyah); her input reaches Claude through Kent.
- Never put exercise answer keys into anything a student-facing AI could see.

## Status

- **2026-10-31:** repo created; nothing built yet. Next step: agree on the architecture and data model, then build a thin end-to-end slice (inquiry → quotation → sales order → document flow) with pricing and the main quirks, for Parand to try.
- Record design decisions in `docs/decisions/`, one short note per decision: what was decided, why, and alternatives rejected.
