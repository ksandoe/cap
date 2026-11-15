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

- **Simulated SAP (under discussion, Oct 2026):** a web simulation of the small slice of SAP the exercises use, possibly replacing live SAP for Sales (and Navigation) in the Spring 2027 pilot.
  - Kent is taking it to Parand first, then the team.
  - Discussion brief: https://claude.ai/artifact/1BimxxuEqjMHJWoMypyCL3
  - Until it's decided, don't invest further in the SAP account pool or live OData verification.
  - Keep the SAP verification interface swappable (`SAP_MODE` stub | live, plus a future `sim`).
  - If adopted, it largely settles the next two items.
- **SAP account model:** random pooled accounts (current code and PRD) vs. a stable account per student. UCC may not allow pooled reuse, and students need to return to their own work.
- **SAP verification:** must check the sales order's owner and **net value**, not just that it exists. Whether the OData API exposes this is unconfirmed.
- **Research identity:** the LIFT research plan needs a stable pseudonymous ID per student. The PRD stores only cohort-level IDs. LTI `iss`+`sub` (hashed server-side) makes this feasible, but it is tied to IRB and consent design. The existing IRB 2024-164 does **not** cover CAP.
- **Rubric dimensions:** code (3), proposal (4) and Joni (split transfer/reflection) disagree. Editable under Admin → Platform settings.
- **Completion threshold:** what counts as a pass. Completion itself is decided to be all-or-nothing points.
- **Canvas write-back:** AGS vs. a scoped Canvas API. This is a Phase 2 decision with ATEC.

## Decided

Record decisions in `docs/decisions/`. Each record says what was decided, who decided it, and what it means for the code.

- **Canvas LTI path with ATEC** ([docs/decisions/2026-10-canvas-lti-atec.md](docs/decisions/2026-10-canvas-lti-atec.md)):
  - The team owns the app, hosting and maintenance; ATEC owns Canvas registration.
  - Phase 1 is launch only. Identity is `iss`+`sub` and the activity comes from a custom parameter. No name, email or roster data.
  - Completion is graded all-or-nothing.
  - **Credly goes through Canvas.** CAP never stores emails.
  - Canvas Dev now; formal review before real students use it.

## Claude license terms (CSU pilot, approved Oct 2026)

Kent's Claude access comes from an approved CSU Claude pilot license (individual, faculty only). It is granted in waves:

- **Wave 1 ends 2027-01-15.**
- Wave 2 runs 2027-01-19 → 2027-09-01 and needs a **new request**. Renewal isn't guaranteed.

Keep decisions and context in the repo and Drive, not only in Claude conversations, so work isn't stranded if access lapses. University work must happen in the **CSU workspace** (account tied to calstate.ai), never a personal Claude account.

The application commits to the following, and they bind how Claude works in this repo:

- **Only public materials, synthetic data, and fully de-identified content.** No Level 1/2 data, FERPA records, credentials, API keys or internal endpoints go to Claude. In practice:
  - Never read `.env` files, secrets, deploy bundles (`cap-deploy.zip`) or the Drive "demo site links and credentials" doc.
  - Test conversations use **synthetic** student responses only.
- **The prototype stays disconnected** from SAP, Canvas, PeopleSoft and M365. Any real integration or student-facing deployment needs a separate IT and data-owner request; the Spring 2027 pilot depends on that request.
- **Approved uses:**
  - Recipe and rubric design
  - Testing adaptive questioning against synthetic students, which includes evaluating Claude as the assessment engine vs. ChatGPT Edu
  - Literature synthesis
  - Research-analysis planning on synthetic or de-identified data
  - Technical design and prototype code
- **Students can't use the license.** That includes Aliyah. Her work reaches Claude only through Kent.

## SAP simulator packages

`packages/sim-web`, `sim-engine`, `sim-shared` and `sim-server` are the SAP Sales Process simulator, merged in from the separate sap-sim repo (history kept) on 2026-11-15. Read `packages/sim-web/CLAUDE.md` before working in them: it holds the simulator's own design rules and requirements; working conventions are in `docs/sim/working-conventions.md`. Its other docs are in `docs/sim/`, and the decision to merge is `docs/decisions/2026-11-one-repo.md`. Run it with `npm run dev:sim`.

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
