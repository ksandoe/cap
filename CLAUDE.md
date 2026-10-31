# CAP — Conversational Assessment Platform

Students complete a hands-on SAP exercise, then have a reflective AI conversation that assesses whether they understand what they did and why. Built for MINS 301 (Chico State, fully online, 300–500 students/semester). Setup, ports, env switches and migrations are in [README.md](README.md). Read it rather than guessing commands.

## Project context

- **Funding:** CSU LIFT award, AY 2026–27 ($19k total; $3k for software). CAP is the "Reflect" step of the proposal's *Check-in → Do → Check → Reflect → Badge* module flow.
- **Hard dates:** LIFT interim report **2027-02-01** · **Spring 2027 pilot** in MINS 301 (proposal promises 5 SAP modules: Navigation, Sales, Shipping, Billing, Integrated Fulfillment; only Sales exists) · final report and deliverables **2027-06-30**. Deliverables carry a Creative Commons license.
- **Team:**
  - Kent Sandoe: PI and product owner (the usual user here)
  - David Zeichick: architecture, identity, security
  - Parand Mansouri-Rad: SAP content; liaison to UCC (the SAP hosting center) and Credly
  - Joni Dunlap: conversational assessment lead, instructional design
  - Arash Negahban: research and IRB
  - Aliyah Cardenas: student analyst; runs stakeholder interviews and testing

## Sources of truth

- **Requirements come mostly from stakeholder interviews.** Aliyah's running "Interview Notes" Google Doc is in the **LIFT** shared drive (Google Drive connector) under *Interview Notes*. **Before planning feature work, check it for entries newer than the trackers below.**
- [docs/interview-feedback-status.md](docs/interview-feedback-status.md): what changed in response to each round of feedback, written for the interviewees.
- [docs/lift-drive-review.md](docs/lift-drive-review.md): every Drive document checked against the build. It covers open gaps, conflicts between documents, and the suggested order of work. **Update it when gaps close or decisions land.**
- **Master PRD and user stories v2** (`docs/*.docx`/`.txt`, mirrored in Drive): the intended architecture. The code has deliberately moved past them in places. Examples: one platform-wide rubric instead of per-recipe rubrics, eval records in DynamoDB, a wizard-based authoring flow. Treat the PRD as intent, not as a spec to restore. The IIO and conversational-assessment PRDs are superseded.

## Open decisions (don't settle these in code alone)

These need the team, UCC, IT or the IRB. Surface them; don't pick an answer silently.

- **SAP account model:** random pooled accounts (current code and PRD) vs. a stable account per student. UCC may not allow pooled reuse, and students need to return to their own work.
- **SAP verification:** must check the sales order's owner and **net value**, not just that it exists. Whether the OData API exposes this is unconfirmed.
- **Research identity:** the LIFT research plan needs a stable pseudonymous ID per student. The PRD stores only cohort-level IDs. Tied to IRB and consent design. The existing IRB 2024-164 does **not** cover CAP.
- **Rubric dimensions:** code (3), proposal (4) and Joni (split transfer/reflection) disagree. Editable under Admin → Platform settings.
- **Completion and grade policy:** the threshold for "Completed", and whether the instructor confirms grades in Canvas.

## Constraints

- **FERPA-first.** No student PII persisted. Don't add absolute timestamps or other re-identifying fields to research or eval records without flagging it. Student text goes to the LLM, so keep identifiers out of prompts. Campus policy forbids FERPA data and PII in AI prompts.
- **Campus IT:** Canvas LTI and grade passback are a "Category B" integration. They need an IT and data-owner design review before going live. Develop against stubs and sandboxes (`*_MODE=stub`).
- **LLM is provider-neutral** (OpenAI-compatible; Azure and institutional gateways supported). Don't hard-wire a vendor.
- **Never put answer keys or walkthroughs into student-facing AI context.** An example is the Ghost Lock CTF material in Drive.
- In Drive, don't open "CAP demo site links and credentials" unless asked.

## Working here

- Monorepo with npm workspaces: `packages/{backend,frontend-student,frontend-admin,shared}`. Shared types and constants live in `@cap/shared`.
- Validate with `npm run typecheck` and `npm run build`. Local dev needs no AWS (`USE_LOCAL_DB=true`, mock LLM without a key).
- Stubbed integrations are labeled with `TODO` and `stub` modes; the admin UI tags unbuilt pages "not yet built". Keep it honest that way.
- Branch `redesign-v2` is the active line; `main` is the PR base.
