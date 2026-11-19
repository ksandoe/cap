# Integrating the SAP simulator with CAP: design proposal

**Status:** revised 2026-11-18, after the two repositories were merged. Still a proposal. Items marked "decided" record Kent's decisions; the rest has not been agreed with David or Parand.
**Basis:** a read-only pass through the CAP repository (`main` at `d3ae4d6`, which includes the simulator) and, for the Sales slice, `docs/work-packages/wp1-sim-in-cap.md`. I did not read `infra/`, the admin authoring UI or the tests (there are none), so anything touching hosting or authoring is flagged as unchecked.

## 1. What the two projects look like today

**CAP** (students do an activity, then a reflective AI conversation):
- Four hard-coded phases, `PHASES = {CHECKIN:1, ACTIVITY:2, CHECKOUT:3, SUMMARY:4}` (`shared/constants/phases.ts`). `WizardPage.tsx` renders one component per number, and `WizardShell.tsx` builds its progress rail from them.
- Phase progress is mixed into the session state machine: `LAUNCHED → LEARNING → SAP_PENDING → SAP_VERIFIED → CHECKIN → CHECKOUT → …` (`shared/types/session.ts`). `stateForPhase()` and `createRetry()` in `orchestratorService.ts` translate between the two, so a change to the phases touches the orchestrator, the store and three components.
- The activity is SAP-shaped. `ActivityPhase` ends with "I have completed the activity", calls `verify-sap` and polls. A session holds a pooled SAP account (`sapUsername`) from launch to completion, and the per-student `{param}` values are looked up by that account (`paramDb`). Sessions are destroyed on completion.
- `verifySapDocuments(sapUsername, requiredDocTypes)` only reports which documents exist, and the required list is hard-coded as `['VA11','VA21','VA01']` with a TODO to read it from module config.
- Instructions are authored recipe content: `guided_tool` blocks hold ordered instructions with `{param}` placeholders and an optional iframe `url`. The lift-drive review already says the SAP quirks (asterisks, the status-bar document number, the blank tab) are recipe content, not code.
- Identity is the HMAC of Canvas `iss`+`sub` (`learnerKey.ts`). The browser never sees it. The AI prompts get this student's `parameters` as the "known result" (`contextCompiler.ts`).

**The simulator:**
- Three transactions plus Document Flow, per-student randomized assignment (`AssignmentInstance`), net value computed server-side, an append-only event log with relative timestamps, and `GET /api/verify?studentKey&assignmentId` returning existence, owner and net-value match per document.
- Identity is a random UUID in the browser's localStorage. The deployed Amplify demo is static and keeps everything in the browser. The Express and SQLite server only exists for local development.
- It carries its own instruction text and block flow (Intro, Background, Activity, Conclusion), which duplicates what CAP's recipe authoring is for.

## 2. Gaps between them

| # | Gap | Why it matters |
|---|---|---|
| 1 | Identity: the sim has a per-browser UUID, CAP has a hashed per-learner key. | Resume, "revisit my documents later" and verification all need one stable key per learner and activity, supplied by CAP and never chosen by the browser. |
| 2 | The sim's persistence is localStorage (demo) or local SQLite. | Verification must read server-side data the student cannot edit. |
| 3 | Per-student parameters: CAP binds them from `paramDb` by pool account, the sim generates them itself. | There must be one source of truth, or the recipe's `{param}` text and the sim's expected net value will disagree. |
| 4 | Instruction text lives in two places. | Parand authors in CAP; the sim has its own copy in code. |
| 5 | `/api/verify` has no authentication and returns `expectedNetValue`. | Fine on localhost, not once it is reachable from the internet. That field must never reach a browser or an AI prompt. |
| 6 | CAP's verification result only says present or missing. | CAP needs owner and net-value outcomes, plus student-safe messages that don't reveal the expected value. |
| 7 | Phases are a fixed numeric enum entangled with SAP states. | This is the reorganization you want. See §4. |

## 2a. The three exercise types and what each needs

Kent's description, 2026-11-07. These map one-to-one onto the five modules in the LIFT proposal: Navigation, Sales, Shipping, Billing and Integrated Fulfillment.

| | 1. Navigation (scavenger hunt) | 2. Simulation (Sales, Shipping, Billing) | 3. Integrative |
|---|---|---|---|
| Layout | Instructions alternating with multiple-choice questions, beside a window showing an SAP web interface (Fiori or other) | Instructions beside the simulated SAP screens | Instructions beside an SAP window; ends with an export to Excel and some final work there (may change) |
| Purpose | Get introduced to and comfortable with the interface of an enterprise system; nothing is changed in SAP. Extra read-only exploration, such as inventory searches, can extend it | Learn one business process by doing it | Apply what the simulations taught |
| SAP side | Live SAP, read-only, nothing stored | The sim: three transactions per module, verified server-side, each module independent | Live SAP |
| What proves completion | Complete or "not yet": every question answered correctly, corrected as they go (decided 2026-11-07) | Documents exist, belong to the student, net value matches | The uploaded Excel workbook: an instance-wide report exported as CSV, opened in Excel, with the student's own row highlighted (decided 2026-11-07) |
| Reflective conversation afterward | Yes (decided 2026-11-07) | Yes | Yes |
| Today's CAP support | Partial: `knowledge_check` blocks exist but are unrecorded and unscored, and a frame lives inside a block | Nothing yet beyond the `sap` stub | Nothing yet |

What follows from this:

1. **Only type 2 is covered by the simulator.** Types 1 and 3 use live SAP (confirmed 2026-11-07), so CAP's note that the sim "largely settles" the SAP account model is only partly true. It settles it for Sales, Shipping and Billing. For types 1 and 3 the UCC work decides it, and CAP needs a live-SAP provider whichever way that goes.
2. **The three simulations are independent of each other (decided 2026-11-07).** Shipping starts from a provided sales order and Billing from a provided delivery, each regenerated from that student's assignment values and flagged as "provided" so the Document Flow can still show the whole chain. Nothing carries over between modules, so a student who struggled with Sales is not blocked, and sim state is scoped to learner plus activity and can be purged when that activity completes. If we want the three to feel like one story, the customer and materials can be derived from the learner key so they coincide, without sharing state. The sim currently has one assignment (`pilot-sales-process`) and three document types; Shipping and Billing add transactions and document types (delivery, goods issue, billing document) that the data-driven configs are meant to absorb, and the verification contract's hard-coded document list becomes per-activity.
3. **Type 1 needs recorded questions and a frame that survives the steps.** Students correct as they go (decided 2026-11-07): each answer is checked on the server straight away, a wrong answer gets feedback and another try, and the activity is complete when every question is right. That fits the all-or-nothing Canvas grade already decided, and the hunt then gets a reflective conversation like the other two types.
   - Questions: `knowledge_check` is "self-check, not graded" and nothing is stored. Worse, `correctAnswer` and `understandingNote` are part of the whole recipe object that `GET /recipe/:moduleId` returns to the student's browser (`recipeService.getRecipe` sends it unfiltered), so an answer key is in the student's page. Recorded, server-scored questions are needed, and the answers must stay on the server. With unlimited retries a multiple-choice question can be guessed, so "complete" says little about understanding. That seems acceptable for a familiarization exercise, as long as the attempts per question are recorded: first-try accuracy is useful for the reflective conversation and for instructors.
   - Frame: in `blocks.tsx` the iframe is inside the `guided_tool` block, which `ActivityPhase` mounts and unmounts as the student moves between steps. For a hunt, moving to the next question would reset the student's place in the SAP interface. The frame has to belong to the activity as a whole, not to a block.
4. **Showing live SAP beside the instructions is the main technical risk for types 1 and 3.** Kent's hope is a browser inside the page, or something more integrated than a second tab. The options, most integrated first:
   - **Direct iframe.** Works only if UCC's SAP web server allows framing from CAP's origin (`frame-ancestors` or `X-Frame-Options`) and the SAP session cookie survives inside a cross-site frame. Browser handling of `SameSite` and third-party cookies is the usual failure. Needs UCC configuration, and the answer may differ between Fiori and the classic WebGUI. Unchecked.
   - **Streamed remote browser.** A browser runs on a server and the student sees it in a frame on the CAP page (a managed streaming service, or something like Guacamole or Kasm). Framing headers and cookies stop mattering, because the student's browser never frames SAP itself. Costs: compute for every concurrent student, capacity planning for 300 to 500 students near a deadline, one more service to host and secure, and UCC has to accept connections from it if SAP is campus-only.
   - **Reverse proxy** serving SAP under CAP's own origin. It avoids the framing rules but rewrites a live SAP application, which is fragile and a security surface. I would not recommend it.
   - **Side-by-side windows.** CAP opens SAP in a popup sized to sit beside the instructions. It is the least integrated, but it needs no change at UCC beyond what exists, so it is the fallback that always works.

   **Tested 2026-11-17 against the real WebGUI** (the page is in `docs/tools/framing-test`; Kent ran it in his own browser, and nothing was sent to SAP from here):
   - The WebGUI does not send an `X-Frame-Options` block. Instead SAP's own *clickjacking framing protection* posts `SAPFrameProtection*require-origin` to the page around it and waits.
   - Our page answered. SAP then asked its allowed-sites service, `GET /sap/public/bc/uics/whitelist/service?parentOrigin=…&appl=/sap/bc/gui/sap/its/webgui/`, and got **403 Forbidden**, both for a local file and for a real `https` address on another host. The frame stayed blank.
   - So framing is blocked by an allowed-sites list that UCC's SAP administrators control, not by a header or a bug on our side. The service exists and is switched on; what is missing is an entry for our address (SAP documents this as the HTTP whitelist, entry type 30, maintained through the UCON tools). Entries match the exact address, including `https` and any port, so CAP needs a stable production address and probably a `localhost` development address too.
   - **A popup works today.** The WebGUI login loads in a window placed beside the page, and login succeeds. This is the baseline. Framed SAP is an upgrade if UCC adds an address.
   - Unknown until an address is allowed: whether login, the start screen and other screens work properly inside a frame (cookies). A `csuchico.edu` address for CAP would likely avoid the cross-site cookie problem.
   - The browser's `unload` warning from SAP's login scripts also appears in a normal tab, so it is unrelated to framing.

   The draft request to UCC is in `docs/ucc-framing-request.md`. The activity-level workspace in §4 hosts whichever mode applies and should treat the popup as the default.
5. **Live SAP identity: plan on issued accounts, treat SSO as an upside.** Kent does not expect SSO to happen (2026-11-07), so the provider is designed around issued accounts and stays agnostic enough to adopt SSO if it arrives.
   - **Issued accounts** (the main path): each semester UCC provisions a dedicated SAP instance with about 1,000 users (`learn-001` to `learn-999`, plus products, customers and so on) and a link to the WebGUI. UCC does not want to know who each account belongs to; that is the faculty's job (Kent, 2026-11-07). The IDs are anonymous, and capacity (1,000 against 300 to 500 students) is not the constraint I feared. CAP hands out IDs first in, first out, and records the pairing of ID and pseudonymous Canvas key from the LTI launch.
   - **What that changes in CAP.** Today an account belongs to a session and is released when the session is destroyed. A semester-long account needs a stored mapping from learner key to account that outlives sessions. It is pseudonymous (no name or email), but it is persistent, so David has to agree it fits CAP's FERPA position. Purge it when UCC resets the instance at semester end. The mapping needs a table; a hash can't do it, because 500 learners hashed into 1,000 slots would collide.
   - **Two ways to handle the hunt.** Because the hunt is view-only, it does not need an account per student. Either (a) rotate students through a small set of hunt accounts, or (b) use the same table as the integrative exercise, so a student keeps one ID all term. Option (a) allows those accounts to be display-only, which turns "don't change anything" from an instruction into a control, and it keeps hunt activity out of the accounts used for the integrative exercise. The catch is that several students would be logged in as the same user at once, and SAP may limit concurrent logins of one user; UCC would need to allow it. Option (b) needs no special setup, but a student's hunt browsing happens in the account that later does the real work, and it can change data. Either way, the table of IDs is kept for the term.
   - **SSO** (upside only): the student signs in to SAP as themselves. CAP deliberately holds no name, email or campus ID, so it could not tell which SAP user belongs to which learner. That is fine for the hunt, and the integrative exercise is unaffected because its evidence is the workbook (next point), except that the authenticity check below would no longer work.
   - **Hunt content has to survive a shared instance.** Students work at different times, so some will be in the integrative exercise, changing stock and orders, while others are still on the hunt. Hunt questions should ask about structure (which screens, fields and options exist) or use data the integrative exercise does not touch, never about values another student could change. Otherwise a correct answer on Monday is wrong on Tuesday.
6. **Type 3 evidence is the uploaded workbook (decided 2026-11-07).** The student generates a report on sales or account balances for the whole instance, including other students' work, exports it as CSV, imports it into Excel, finds and highlights the row their own activity produced, and uploads the workbook. Things to settle:
   - **What is checked.** The server parses the file and finds the highlighted row, then checks that it is the student's: the user or created-by column shows their issued account, and the amounts match the expected values for their parameters (`paramDb` already binds values by account). It should also check that no other row is highlighted, and that the report holds many rows, as a sign it was run on the instance. Expected values stay server-side and out of any AI prompt.
   - **The layout is not ours to fix.** The columns come from SAP's export, so a template with fixed cell positions won't work. The checker should find columns by header text. Parand should specify one report and one layout variant so the headers are the same for everyone, and say which report it is (sales or account balances).
   - **Excel's quirks.** Importing a CSV drops leading zeros from document numbers and may change number and date formats. The checker has to normalize those before comparing. "Highlight" needs a definition: a cell fill the checker can read from the file. A conditional-formatting rule is much harder to read, so the instructions should say to use fill color.
   - **Safe handling.** Accept `.xlsx` only (no macros), cap the size, and parse in a way that resists malformed or zip-bomb files. An instance-wide report with hundreds of students' rows can be large.
   - **FERPA.** The workbook holds other students' rows, and it carries author and last-modified-by properties. The account IDs are anonymous (`learn-001` and so on, with the mapping kept in CAP), so other students' rows are pseudonymous. In any case I'd hold the file only long enough to check it, store the result and a summary, and delete the file, which needs David's agreement.
   - **Authenticity.** The user column ties the highlighted row to the issued account, so a classmate's workbook fails. Cells can still be edited by hand. Without a server-side look at SAP itself, which would be a separate IT request, this is a plausibility check, and I think that is enough for a completion exercise. Under SSO the user-column check would disappear.

## 3. How the simulator joins CAP

**Decided (Kent, 2026-11-17): one repository.** The simulator was merged into the CAP monorepo with its history (`packages/sim-web`, `sim-engine`, `sim-shared` and `sim-server`; see `docs/decisions/2026-11-one-repo.md` and `docs/merge-plan.md`). That settles the options this section used to weigh:

- **Separate app over HTTP: dropped.** It added a second deployment and datastore, a launch token between two services, and cross-origin iframe handling, with no benefit once the code lives in one repository.
- **Engine inside CAP's backend: chosen.** Documents and verification live in CAP's own store, behind CAP's own authentication.
- **Fully client-side: still rejected.** The student controls the browser, so a verification the student can fake defeats the point.

**The Sales slice is specified in `docs/work-packages/wp1-sim-in-cap.md`.** In outline:
- All simulator state goes through an async storage interface. CAP's implementation sits behind it (the JSON store locally, DynamoDB in production), keyed by learner key and activity, not by session, so students can return to their documents.
- New `/sim/*` routes in the CAP backend sit behind the existing session authentication. The learner key and activity come from the session token, never from the browser. The PoC's `studentKey` query parameter goes away.
- The simulator's screens appear in the activity frame of the student app (a new `tool: 'sap_sim'`), with the instructions coming from the CAP recipe. No intro, background or conclusion blocks of its own. A style-scoping spike decides between a component and an iframe.
- No SAP pool account is taken for simulator activities, and `session.parameters` come from the simulator's per-learner assignment, so `{param}` placeholders and the AI "known result" keep working.
- CAP's verification result grows to `{ passed, items: [{ key, status: 'ok' | 'missing' | 'mismatch', studentMessage }] }`. A mismatch turns into "the net value on your order isn't what we expected, so recheck the discounts", never the expected number. The PoC's endpoints currently return the expected net value to the caller. That is removed inside CAP, with an automated test.

## 4. Decoupling the phases

**Direction:** make the flow a property of the module, not of the code.

1. **Phases as data.** Replace the numeric enum with an ordered flow on the recipe or module config. The default is today's `checkin → activity → reflect → summary`. Each phase has `kind`, a `status` (`locked | available | in_progress | done`) and an entry gate. `WizardPage` and `WizardShell` render from the flow, and each phase gets its own URL so resume and Back work per phase.
2. **Keep lifecycle separate from progress.** `SessionState` keeps only `ACTIVE`, `SAVED`, `INTERRUPTED`, `EXPIRED`, `COMPLETED`. What the student has done lives in per-phase status. `SAP_PENDING` and `SAP_VERIFIED` become sub-status of the activity phase, and `stateForPhase()` goes away.
3. **Activity providers.** One interface the activity phase calls, with implementations per exercise kind:
   - `start(session) → { frameUrl?, parameters }`
   - `verify(session) → ActivityResult`
   - `release(session)`
   - `evidence(session) → ActivityEvidence`

   The providers follow the three types in §2a:
   - **Hunt** (type 1): each answer is checked on the server as it is submitted, and `verify` returns complete once every question is correct, otherwise "not yet". The live-SAP side only needs an identity (an issued account, or SSO later) and checks nothing.
   - **Sim** (type 2): `verify` asks the simulator for document existence, owner and net value.
   - **Integrative** (type 3): the same live-SAP provider for the frame and identity, and `verify` checks the uploaded workbook (see §2a point 6).

   Account assignment is sticky per learner for the semester (§2a point 5), so there is no release step before the semester-end purge.
3a. **A workspace that belongs to the activity.** The tool frame moves out of the content blocks into an activity-level workspace (instructions on one side, a persistent frame on the other). Steps change what the student reads and answers, not what is in the frame. This is what the hunt and the integrative exercise need, and it is harmless for the sim.
4. **Reflection consumes evidence, not SAP fields.** `ActivityEvidence` is de-identified: pass or fail, number of attempts, a per-item summary, and engagement signals (relative durations, categories of repeated errors, abandoned documents). `contextCompiler` reads this instead of `sapDocRefs` and the raw parameters. This is also where the instructor view and "I don't know" counts from the lift review get their data.
5. **Decoupling across time.** Today a session holds a pooled SAP account for up to a week when SAVED, which is why check-in, activity and reflection stay tightly coupled. Sim activities hold no account, so check-in can be done days ahead and reflection long after the activity. That needs a decision on how long phase records live, because sessions are destroyed at completion and CAP's FERPA position is "no persistent student data".

**Not decided here:** whether reflection can start when verification fails (a per-module gate such as `pass | attempted`). The Sales work package provisionally keeps the sim documents on a retry, so the student can fix them.

## 5. Open questions for you and the team

Settled 2026-11-07: the hunt corrects as students go and gets a reflective conversation about comfort with an enterprise UI; SSO is unlikely, so issued accounts are the plan, about 1,000 per semester in a dedicated instance; the integrative evidence is an uploaded workbook with the student's row highlighted in an instance-wide CSV report.

1. **What does UCC allow for showing SAP beside the instructions?** Framing, a streamed browser, or only a popup window (§2a point 4)? This decides how integrated types 1 and 3 can be, so I'd run the spike early. Also for UCC: can several people use one display-only account at the same time (for the hunt), and how is the instance reset at semester end? Settled: the account IDs are anonymous.
1a. **Hunt content and its reflection.** The reflection is about comfort with an enterprise system's interface, which suits the self-reported comfort and first-try accuracy we can capture. The content needs more thought, as Kent said: read-only extensions such as inventory searches, written so answers don't depend on values other students change (§2a point 5). Parand owns this.
1b. **The integrative report.** Sales or account balances? Which report and which layout variant, so the column headers are identical for everyone? And what does the student's row contain that is unique to them? Plus David's agreement on holding the workbook only until it is checked (§2a point 6).
1c. **A semester-long account mapping in CAP.** Is a stored learner-to-account table acceptable under CAP's FERPA position, purged at semester end? David's call.
2. **Hosting and datastore for the simulator.** Decided in principle: the engine runs in CAP's backend and its state lives in CAP's own tables (DynamoDB, with the JSON store for local development). Creating the production table and the retention period are for Kent and David (see `docs/work-packages/wp1-sim-in-cap.md` §7).
3. **Retention.** The sim stores per-learner behavior (time per step, errors) keyed to a pseudonymous ID. That is research data, and the IRB currently does not cover CAP. Does it follow CAP's rule (relative timestamps only, no absolute times), and how long does it live?
4. **Where the instructions live.** I propose CAP's recipe authoring, with the sim as screens only. Parand needs to agree.
5. **Answer keys and AI context.** `contextCompiler` already puts assignment values into prompts. Expected net value should stay out. The agent should see what the student did and whether they passed, not the target.
6. **Per-learner or per-attempt sim state.** Parand wants students to return to their own documents. I'd key sim state by learner and activity, not session.
7. **Standalone demo.** I'd keep the static Amplify build as a separate demo and not mix it with the embedded mode.

## 6. Proposed order of work

| Stage | What | Where | Depends on |
|---|---|---|---|
| 0 | Team decisions: §5 items 1–4 | docs, then a record in CAP's `docs/decisions/` | Kent, David, Parand |
| 0b | Spike with UCC. **Partly done 2026-11-17:** framing is blocked by SAP's allowed-sites list and needs an entry for our address; a popup works today (§2a point 4). Still to do: send the request (`docs/ucc-framing-request.md`), and ask about shared display-only accounts for the hunt and semester reset | Kent, UCC, David | A production address for CAP |
| 1 | Sim side: storage interface, public instance, richer verification, `SimWorkspace` export, style-scoping spike | `packages/sim-*` | Work package 1, PR 1 (contracts) |
| 1 | CAP side: `/sim` routes, storage tables, `SAP_MODE=sim`, seeded recipe, student app wiring | `packages/backend`, `packages/frontend-student` | Work package 1, PR 1; Devin |
| 2 | Phase decoupling: flow config, per-phase status, provider interface | `../cap` | Stage 1 |
| 3 | Evidence into reflection, engagement signals, retention and purge | `../cap` and here | Stage 2 |
| 4 | Recorded, server-scored questions for the hunt, and the activity-level workspace frame | `../cap` | Stage 2 |
| 5 | Shipping and Billing: new transactions and document types, per-activity verification, provided predecessor documents | here | Stage 1 |
| 6 | Live-SAP provider (issued accounts first, SSO if it arrives) for the hunt and the integrative exercise, plus workbook upload and check | `../cap` | The framing spike's outcome, and the integrative exercise settling |

Stage 1 can start without Stage 2, so students could use the sim inside today's wizard before the phase refactor lands. The Shipping and Billing sims are the largest piece of new simulator work; the Sales slice took several rounds of screen-by-screen matching against the real system, and each of those transactions will likely need the same.

## 7. Things to know before touching CAP

- **Resolved 2026-11-18:** Devin's seven uncommitted check-in files were committed (`5c14dd6`), and `main` now contains `redesign-v2` plus the simulator merge (`d3ae4d6`). Work from `main`; Devin's folder should switch to it.
- CAP's `CLAUDE.md` says to keep the SAP verification interface swappable and not to invest further in the account pool or live OData until the sim decision lands. This proposal follows both.
- The pilot constraints still apply: synthetic data only, no connection to real SAP or Canvas, and no answer keys in anything a student-facing AI can see.
- CAP's `CLAUDE.md` says open decisions need the team. Once §5 is settled, record it in CAP's `docs/decisions/` with who decided, and update the "Simulated SAP" entry there.
