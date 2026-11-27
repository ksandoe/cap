# Work package 6: orchestration, testing and cost tracking (Aliyah)

**Status:** draft for Kent, 2026-11-23. Written by Claude as the architect. Not yet agreed with David.
**For:** Aliyah Cardenas. It works with or without Claude: Aliyah is expected to get her own Claude seat soon. Until then, questions go to Kent, who can pass them on.
**Updated 2026-11-23:** Part B, the target flow in section 1 and tasks A8 and B3 to B5 were added after reading how completion and grade posting work today. The reasoning is in `docs/decisions/2026-11-launch-and-grade-return.md`.
**Basis:** a read of CAP `main` at `af5aea7` (`ltiService.ts`, `gradeService.ts`, `orchestratorService.ts`, `assessmentService.ts`, `llmProvider.ts`, `contextCompiler.ts`, `evalDb.ts`, `.env.example`) and the Canvas decision note `docs/decisions/2026-10-canvas-lti-atec.md`. I did not read the admin app, `infra/`, or the CloudWatch setup.
**Facts established on 2026-11-22:** a real Canvas launch from Chico State's dev instance now works end to end, using a development key and the deployed backend. Everything below builds on that.

## 1. Your three jobs

1. **Orchestration (your main job).** Make the path from the Canvas click to the activity trustworthy (phase 1), then make the path from the finished activity back to the Canvas gradebook work (phase 2).
2. **Cost tracking.** Before the realistic test runs, find out roughly what one conversation costs on a few different language models, and record the estimated cost with every conversation from now on.
3. **Ongoing testing.** Run a series of realistic test conversations, log what happens, and put the transcripts in front of Kent and the team.

**The target flow** (proposed, not yet agreed with David or Mir):
1. The student opens an assignment in Canvas. Our tool launches **inside the Canvas frame** and shows a landing page.
2. A button on the landing page opens CAP **in a new browser tab**, with a full window to work in. The new tab is signed in by a one-time code, not by a second launch.
3. When the student finishes, our **server** posts the grade to Canvas (AGS) whatever the browser is doing. The landing page in the Canvas frame asks the server for the status and shows it, and the last screen in the new tab has a "Return to Canvas" button.

Fine-tuning the screens of step 2 is not part of this package. Parand and Aliyah will do that together later.

**Suggested order.** Cost tracking comes first because Kent wants cost numbers attached to the realistic runs and because it is a small, self-contained change that teaches you where things live. Then start the launch hardening. The realistic runs begin once cost capture is merged and the cost probe (section 4) has been done once. Testing continues after that, every time something is deployed.

**Not your job in this package:** phase 3 (Canvas to AWS to Qualtrics and back, the survey launcher). It waits for Arash, David and the IRB to settle how student emails are handled. Do not start it, and do not add email or name handling anywhere.

## 2. Rules that apply to everything here

- **Synthetic data only.** Test runs use made-up students. Never type a real name, student ID, email or anything personal into a test conversation, even your own. Transcripts from test runs are then not student data, which is what lets Kent review them with Claude's help.
- **If you use Claude on this repository,** the same terms apply to what you give it: synthetic data only, no secrets, no Canvas addresses or IDs, and never read `.env` files.
- **Secrets never go in the repository, in a pull request, in a chat, or in a screenshot.** That covers the Canvas client ID, deployment ID, the Canvas Dev address, the tool's private key, the OpenAI key and any other API key, and the learner-key secret. They live in `.env` files (never committed) and in the Lambda console.
- **Do not read or write production data.** Local development uses `USE_LOCAL_DB=true`, a JSON file on your machine.
- **Answer keys stay on the server.** Nothing a student's browser or an AI prompt can see may contain expected net values or exercise answers.
- **Pull requests:** small, one topic each, with tests. Kent merges. **David reviews anything that changes identity, launch, privacy or what is stored.** `createSession` in `orchestratorService.ts` is also touched by the simulator work, so tell Kent before you edit it.
- **You do not deploy.** Kent and Devin do that. You prove your change locally and in the pull request.
- Files in this repository use Windows line endings. Keep each file's endings as you find them.

## 3. Part A: launch to activity (phase 1)

**Where it lives:** `packages/backend/src/services/lti/ltiService.ts` (the two handlers), `routes/lti.ts`, `services/identity/learnerKey.ts`, `services/orchestrator/orchestratorService.ts` (`createSession`).

**What exists today.** The login step redirects Canvas back to its authorization address. The launch step reads the token Canvas posts, **decodes it without checking it**, builds the learner key from `iss` and `sub`, picks the activity, creates the session and redirects the browser to the student app with the session token in the address.

**Why this matters.** Because nothing is checked, anyone who can reach the launch address can forge a launch and appear as any learner. The dev instance only has test accounts, so this is acceptable today and unacceptable before real students.

Each task has a **done when** line. Do them roughly in this order.

**A1. Verify the launch token.** Use `jose` (already a dependency). Fetch Canvas's public keys from `LTI_PLATFORM_JWKS_URL` and cache them. Check:
- the signature;
- `iss` equals `LTI_PLATFORM_URL`;
- `aud` contains `LTI_CLIENT_ID`;
- `exp` and `iat`, with a small clock allowance;
- the `nonce` matches the one issued at login (A2);
- `deployment_id` equals `LTI_DEPLOYMENT_ID`;
- the message type is a resource link request and the version is 1.3.0.

**This task comes before any grade posting.** The grade address arrives inside this token, so an unverified token could point it at someone else's server (see Part B).

The `aud` and `deployment_id` checks are the important ones. Canvas hosted by Instructure signs every school's launches with the same keys and the same issuer name, so a valid token for another school's tool would otherwise pass.
**Done when:** each check has a test that fails without it, using a test key pair and a fake key server inside the test (no real Canvas needed), and a launch from the real dev instance still works.

**A2. Real `state` and `nonce`.** Today both are the placeholder text `TODO_generate_state`. Generate a random value for each at login, remember them, and check at launch that the returned state is one we issued, recently, and used only once. Two ways to remember: a small DynamoDB table with a time-to-live (Kent creates the table), or a signed, short-lived value with no table. **Do not use cookies for this.** In the target flow the login happens inside an iframe in Canvas, where browsers often block third-party cookies. Write a half-page note on which of the two approaches you recommend and why, and get David's view before building.
**Done when:** a replayed launch is rejected, and a launch with a wrong or expired state is rejected.

**A3. Take the session token out of the address.** The launch currently redirects to `…/launch?token=<session token>`. Addresses end up in browser history and server logs. The replacement is also how the landing page signs the student in to the new tab (step 2 of the target flow). Propose a design (for example a short-lived one-time code exchanged by the student app for the session token) and get David's view first.
**Done when:** no session token appears in any address, and the student app still signs in, including after a relaunch.

**A4. Reject unknown activities.** Found on 2026-11-22: a launch that names an activity that does not exist is accepted and creates a session for it. Check the activity against the module configuration and refuse launches for unknown ones.
**Done when:** a launch with a made-up activity returns an error and creates nothing, and a real one still works. (The existing test `keeps the activity the launch names…` uses a made-up name and will need to change.)

**A5. Make failures diagnosable.** The student sees only "LTI launch failed. Please try again from Canvas." and the cause is in CloudWatch, which Kent and you cannot read today. Add a short reference code to that page that is also written to the log with a specific, non-sensitive reason (for example `TOKEN_SIGNATURE`, `UNKNOWN_ACTIVITY`, `SESSION_STORE`). Never log the token, the login hint or any user identifier. Ask Kent whether you can have read access to the function's logs.
**Done when:** a deliberately broken launch in a test shows a reference code, and the matching log line carries the same code and a reason.

**A6. One key per Canvas, not one for the whole server.** The server holds a single client ID and deployment ID in environment variables. The dev and production Canvas instances will each have their own. Write a one-page design note for a small registry (a list of client ID, deployment ID and environment) and how the launch picks one. Do not build it yet.
**Done when:** the note exists and David has read it.

**A7. Activity choice (design note only).** `LTI_DEFAULT_ACTIVITY_ID` (added on 2026-11-22) makes one key open one activity. For several activities in one course we will need to tell links apart, by Canvas's resource link ID or by Deep Linking, where the instructor picks the activity when adding the link. Write a short note comparing the two. Do not build it yet.

**A8. Say who may frame us.** The app sends no framing headers today, so any site can put it in a frame. The target flow needs Canvas to frame the landing page, and nobody else should. Add `Content-Security-Policy: frame-ancestors` with the Canvas origins, read from configuration (the Canvas addresses are not written in the repository), and do not send `X-Frame-Options: DENY` or `SAMEORIGIN`, which would block Canvas too. Check that the student app, the landing page and the launch response all carry it.
**Done when:** a test shows the header on those responses, and the landing page still loads inside a frame from an allowed origin in a browser.

## 4. Part B: activity to grade return (phase 2)

**Where it lives:** `services/grade/gradeService.ts` (a stub with TODOs), `completeSession` in `services/orchestrator/orchestratorService.ts`, `db/sessionDb.ts`, the shared session types, and the student app (a new landing page, plus the exit page).

**The design and the reasons for it** are in `docs/decisions/2026-11-launch-and-grade-return.md`. Read it first. This part is the task list.

**What the code does today** (found on 2026-11-23, and the reason this is more than finishing the stub):

| Finding | Consequence |
|---|---|
| `completeSession` posts the grade inside `Promise.allSettled`, so a failure is ignored, and then **deletes the session record**, including the grade address and the student's `sub`. | If Canvas is unreachable for a minute, the grade is lost for good and nothing can retry it. |
| Nothing keyed to the learner survives completion. Only de-identified research records do. | There is nothing to show "completed" on a landing page, and nothing to retry from. A small durable completion record is needed (B3). |
| The grade address (`lineitem`) comes from the launch token, which is not verified yet (A1). | A forged launch could point it at another server, and the server would send its Canvas access token there. Verification (A1) comes first, and the address must also be checked to belong to Canvas. |
| The stub posts the score to the line item address itself. | As we understand the AGS standard, scores go to that address with `/scores` added to the path. Check it against the specification (B4). |
| The launch's `launch_presentation.return_url` is not read anywhere. | There is no "Return to Canvas" target yet (B5). |

**Decided so far** (`docs/decisions/2026-10-canvas-lti-atec.md`): completion is graded all or nothing, 1.0 if passed and 0.0 otherwise. **Still open:** whether to use LTI Advantage grade services (AGS) or a narrowly scoped Canvas API. Kent proposes AGS and ATEC has more experience with the API. Also open: what exactly counts as "passed", and whether a failed attempt posts 0.0 or posts nothing (section 7).

Do these in order and stop where a decision is needed.

**B1. Compare AGS and the scoped Canvas API.** One page. Cover what Mir has to configure, what secrets we hold, how each handles a student who completes twice, and what each needs in the dev instance and later in production. Kent takes it to Mir.

**B0. Look at a real assignment launch (do this first).** Mir has provided an assignment placement and switched on the AGS score scope for the dev key (2026-11-26), and a test assignment exists in the dev course. We have never seen what Canvas sends on an assignment launch, and the rest of Part B depends on it.
- In `handleLaunch`, add **one log line** that records only which of these are present, never their values: the AGS endpoint claim; the line item address; the list of scopes Canvas says were granted (scope names are not sensitive); `launch_presentation.return_url`; the value of `launch_presentation.document_target` (Canvas should say whether it is loading the tool in the frame or in a separate window, which is how the landing page will know whether to show itself); the message type; and the **names** of the custom parameters. Add a yes or no for whether the line item address's host is the same as the platform's host. No addresses, identifiers, tokens or `sub` values go in the log.
- Ask Devin to deploy it (code only). Kent or you open the test assignment as the test student. Ask Devin to paste back the log line.
- Expect the whole student app to appear inside the Canvas frame, because the landing page does not exist yet. That is fine for this test.
- Write the results into section 7 of `docs/decisions/2026-11-launch-and-grade-return.md` (which items are confirmed and which are not), and note any surprises.
**Done when:** the log line has been read from a real assignment launch and the results are in the decision note.

**B2. Placement and scopes.** The "SAP Access" link in the course navigation has no grade line in Canvas. Grade return needs the tool launched from an **assignment**. **Update 2026-11-26:** Mir has set up an assignment placement and had already switched on the grade services (the score scope) on the dev key. B0 shows whether Canvas also needs the line item scope for the grade address to appear in the launch. Until B0 is done, build against a fake Canvas in tests.

**Who does what in Part B:** Aliyah takes B0 to B4 (the experiment, the completion record and the grade client). Kent is working on the landing page (B5) with Claude, using the current sign-in mechanism for now. The one-time code (A3) will replace it, so check with Kent before changing how the session token is handed over.

**B3. The completion record and the retry queue.** Add a small durable record per learner and activity, written before the session is deleted. It holds: the learner key, the activity id, status (in progress or completed), attempt count, last result, the grade state (`pending`, `posted` or `failed`), the number of post attempts, and what is needed to post the grade (the line item address, the raw `sub`, the context id, the return address). Rules:
- It is server-side only. No endpoint returns the `sub` or the line item address to a browser.
- It carries a time-to-live so it is purged at semester end. Agree the period with David.
- A completion writes the record as `pending`, then tries to post. A failure leaves it `pending` with a reason, and it is retried. Start with: retry on the student's next launch, plus an admin-only "retry pending grades" action. A scheduled job is a later option and needs infrastructure from Kent.
- Kent must be able to see which grades are `pending` or `failed`.
**David reviews this task** because it adds persistent per-learner data.
**Done when:** completing an activity leaves a record, a simulated Canvas outage leaves it `pending`, and a later retry posts the grade once and marks it `posted`. Posting twice must not create a second score.

**B4. The AGS client** (`gradeService.ts`), built after A1 and B3.
- Fetch an access token from Canvas with the client-credentials flow, authenticating with a signed assertion made with the tool's private key. **The private key goes in AWS Secrets Manager, not an environment variable.** Kent creates the secret and gives the function permission to read it, and you write the code that reads it (cache it). The key itself never appears in the repository, a pull request or a chat.
- Cache the token until shortly before it expires.
- **Take the token address and the assertion's audience from Canvas, not from a tutorial.** A popular write-up of AGS (the dev.to article "How to send grades back to Canvas using AGS in 2026") hardcodes `canvas.instructure.com/login/oauth2/token`, and I believe the address for Canvas hosted by Instructure is different. **Mir confirmed the address on 2026-11-26** from Instructure's documentation: `https://sso.canvaslms.com/login/oauth2/token`, with the request fields `grant_type=client_credentials`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `client_assertion` (the signed JWT) and `scope` (the score scope). He mentioned the school's own address with the same path as a possible alternative. Use the `sso` address, put it in configuration (never hardcode it, for example `LTI_TOKEN_URL`), and check what Canvas expects as the `aud` of the signed assertion (the same address is the likely answer). The same article is a fair orientation to the flow (it matches this task) but it cites no specification, never mentions verifying the launch, and says nothing about the return address or posting policy, so check each detail against the AGS specification.
- Before sending anything, check that the line item address belongs to Canvas's own host, and refuse otherwise.
- Post the score to the line item address with `/scores` added, as the specification describes. Use the score content type and the fields the specification requires. Confirm the path and the content type against the AGS specification rather than this document.
- Never swallow an error. Record a non-sensitive reason code on the completion record and in the log.
**Done when:** tests against a fake Canvas cover a good post, an expired token, a refused post, a bad line item address and a network error, and a test student in the dev instance sees the right score in the gradebook (needs B2).

**B5. The landing page and "Return to Canvas".** After B3 and B4, and after A3 (the one-time code):
- **Landing page.** After a verified launch from an assignment, serve a small page for the Canvas frame. It shows the student's status for this activity (not started, in progress, completed, grade recorded or being recorded) and a button that opens CAP in a new tab. The tab is signed in with the one-time code from A3, not by a second launch.
- **Status.** The landing page asks a status endpoint every few seconds while it is visible. The endpoint uses a short-lived token issued at launch and returns only the status, never an identifier or an address. **Do not use cookies, and do not rely on the two tabs sharing any browser storage:** browsers increasingly isolate storage inside embedded frames, so the server is the only meeting point.
- **Return to Canvas.** Read `launch_presentation.return_url` from the verified launch and keep it on the completion record. On the last screen in the new tab, offer a "Return to Canvas" button that waits until the grade is `posted` (or says it may take a moment). Confirm with Mir that Canvas sends this value on assignment launches and where it leads.
- **Frame height.** Canvas supports a message from the tool asking it to resize the frame. Use it if the landing page needs more room.
- **Register the new page with the server.** The deployed server serves the student app only for the paths on a short list in `packages/backend/src/app.ts` (the line starting `app.get(/^\/(launch|wizard|error|exit)?$/`). A path that is not on it returns a 404 when it is opened directly or refreshed, even though it works when you navigate to it from inside the app. This happened with `/exit` on 2026-11-23 and was only caught after deployment, because the local dev server serves every path. Add every new page route to that list (or replace the list with a catch-all that leaves out the API paths), and test a direct load of the built app, not just the dev server.
**Done when:** in the dev instance a test student launches the assignment, sees the landing page in the frame, completes the activity in the new tab, and the landing page shows "completed" with the grade in the gradebook. The first version of the screens can be plain.

**Done for Part B when** the steps above work together, a deliberate failure leaves a visible, retryable record, and David has reviewed B3.

## 5. Part C: cost capture (do this first)

**Why.** Kent wants to see what a conversation costs on different models, and to have the estimate stored with every conversation so the realistic runs add up to a forecast for spring (300 to 500 students).

**What the code does today.** All model calls go through `callModel` in `services/assessment/llmProvider.ts`. It sends the request, **throws away the usage figures the provider returns**, and gives back only the text. The model name comes from one setting, `OPENAI_MODEL`, for the whole server. A conversation is made of these calls:
1. one **check-in** call that generates the questions;
2. one **turn** call per student reply, where the whole history and the long system prompt are sent again each time, so the input grows with every turn;
3. one **evaluation** call at the end, which sends the full transcript.

The conversation ends when the model emits the `[PHASE:4]` marker. Admin authoring calls the model too, but those are not student conversations.

**C1. Record usage on every call.** Keep `callModel` working for its five callers. Add a variant that also returns the model name, the prompt and completion token counts the provider reports, and the call time. Record them with the session id and the kind of call (`checkin`, `turn`, `evaluation`, `authoring`). In mock mode record nothing and mark the run as mock.
**Done when:** a test with a stubbed provider response shows the numbers recorded, and a test confirms the recorded data contains **no message content**.

**C2. Store a total with each conversation.** Add the per-call records to the session while it lives. When the conversation completes (where `saveAttempt` is called in `orchestratorService.ts`), copy a summary onto the evaluation record: model, call counts and tokens by kind, estimated cost, and the date of the price table used. The evaluation record is de-identified by design, so keep it that way: no learner key, no session token. Also write one log event per call (counts, model, kind, call time, session id, never content) so that conversations that were abandoned and never completed still show their cost in the logs.
**Done when:** a completed local conversation produces an evaluation record carrying the cost summary, and an abandoned one leaves its per-call events in the log.

**C3. The price table.** Add a small configuration file that maps a model name to its price per million input tokens and per million output tokens, with the date the prices were read and the page they came from. **Fill it in from the provider's published pricing page on the day you do it, and do not rely on memory or on this document: prices change.** A model that is not in the table must give an estimated cost of "unknown", never zero.
**Done when:** the cost maths has tests, including the unknown-model case.

**C4. A report.** Add a script, `packages/backend/scripts/llm-cost-report.ts`, that writes one row per conversation to a CSV file: conversation id, module, model, turns, tokens in and out by call kind, estimated cost, and whether it was a mock run. It should read the local store and, when pointed at DynamoDB, the real table. A sheet built from this CSV is how Kent sees the forecast.

### The cost probe (before the realistic runs)

**Goal:** a quick, repeatable estimate of the cost of one conversation on each model Kent names, without needing a person for every run.

Write `packages/backend/scripts/llm-cost-probe.ts`. For each model in a list it should:
1. build the real prompts for the Sales module the way the app does (`compileContext` with the active recipe and a sample session);
2. run the check-in call, then a scripted conversation of up to about twelve turns, then the evaluation call;
3. stop a conversation when the model emits `[PHASE:4]`, or at the turn limit and say so, because a model that never concludes is itself a finding;
4. report tokens and estimated cost by call kind and in total, over at least three runs per model, since the same prompt gives different lengths each time.

The scripted student needs replies of realistic length. Use three scripts, short (about 25 words a reply), typical (about 80) and long (about 150). **These lengths are guesses**; replace them with the real average once your realistic runs give you transcripts.

**What the probe cannot tell you.** A scripted student cannot react to the model's questions, so the probe measures cost, not quality. Quality is what the realistic runs are for.

**Which models.** Kent supplies the list and the keys. A sensible spread is the model already in use, a middle one and a top one. Two cautions:
- `llmProvider.ts` speaks the OpenAI-style chat completions format only. A model from another company works only if its provider offers a compatible endpoint (check its documentation for the exact address and sign-in style) or if we add a small adapter. An adapter sends student conversation text to another company, so **it needs David's agreement first**.
- Which companies may receive conversation text is a decision for Kent and David, not for the probe. The probe uses synthetic text only.

**Turning the numbers into a forecast.** Put this in the sheet:

`spring cost = cost per conversation x conversations per student x students`

- Use a low, a typical and a high cost per conversation, from the probe and later from the real runs.
- Conversations per student is more than one: the code has a retry path (`createRetry`), so ask Kent what retry policy to assume, and count the abandoned conversations too.
- The system prompt is sent on every turn. If a provider offers a discount for repeated prompt text, say whether the forecast assumes it. Do not assume it unless someone has confirmed it applies.

**Done when:** the probe runs for every model on Kent's list, the results sit in a table next to the price table's date, and the forecast sheet has the three scenarios.

## 6. Part D: realistic test runs and ongoing testing

**What a "realistic run" is.** A person plays a made-up student from the Canvas click to the end of the conversation, with the cost capture on, and writes down what happened.

**Where to run.**
- A few runs go through **Canvas dev** (the "SAP Access" link as the test student), because that is the real path.
- Most can use the dev launchpad on the deployed demo or your local copy. Locally, set your own model key in `.env` (never committed) and `OPENAI_MODEL`. Switching the model on the deployed function means editing its environment in the console, which is Kent's job, so plan runs in batches by model.

**Personas to cover** (invent the names and details, all fictional):

| Persona | What it tests |
|---|---|
| Careful student | The ideal path, as a baseline |
| Rushed student | One-line answers: does the conversation still reach a fair evaluation? |
| Confused student | Wrong discount or a missing material: the failed check message, retrying, whether the message helps without giving the answer |
| Probing student | Tries to get the model to reveal the expected answer or to leave the topic: tests the prompt's security rules and the output filter |
| Interrupted student | Closes the tab midway, comes back from Canvas, and finds the work and conversation where they left them |
| Returning student | Reopens a finished activity to look at their documents |

**For every run record** (one row in the run log, a sheet Kent will give you): run id, date, model, persona, how you entered, time spent in each step, outcome, estimated cost (from the report), and any problem, with the exact text of any error and what you did just before it.

**Transcripts.** Completed conversations are saved de-identified in the evaluation records. Export them with the cost report (add a transcript export if the report does not carry them) and give them to Kent. For each, note whether the model asked good questions, stayed on the rubric, leaked an answer, handled the off-topic attempt, ended cleanly, and whether the score was fair.

**After each deployment,** repeat a short checklist: launch from Canvas, complete the activity, fail a check on purpose, leave and relaunch, reopen a finished activity, finish the conversation, read the cost row. Report anything different from last time.

## 7. Decisions needed from Kent

| # | Decision | Provisional default |
|---|---|---|
| 1 | The models for the cost probe, and who supplies keys | The model now in use, plus one mid-tier and one top-tier |
| 2 | A spending cap and a separate key for test runs | A separate capped key, never the production one |
| 3 | Whether to run the realistic runs on the deployed demo, locally, or both | Both, with a few through Canvas dev |
| 4 | How many realistic runs per model | One per persona, so six per model |
| 5 | The retry policy to assume in the forecast | One retry per student plus 20 percent abandoned (a guess: replace it) |
| 6 | Read access to the function's logs for Aliyah | Yes, read-only |
| 7 | AGS or the scoped Canvas API (with Mir) | Open |
| 8 | What counts as passed | Open |
| 9 | Whether a failed attempt posts 0.0 or posts nothing. Posting nothing leaves the assignment ungraded until the student passes; scores can be overwritten, so a later pass replaces an earlier 0.0 either way | Post only on a pass, and decide with Parand how an unfinished assignment should look to the student |
| 10 | How long the completion record is kept (B3) | Until the end of the semester, with David's agreement |
| 11 | Whether the landing page ships with the first grade-return version or just after it | Grade return first with the plain exit page, landing page second |

## 8. What I could not check

- I did not read how the admin transcript screen works (`getTranscript` is marked as a TODO in `instructorService.ts`), so the cost report is the planned way to get transcripts out.
- I did not check the exact field names a non-OpenAI endpoint returns for usage. The OpenAI-style response carries `usage.prompt_tokens` and `usage.completion_tokens`; confirm the same for each endpoint you try.
- I have not looked at prices. Read them yourself, with the date.
- Whether interrupted conversations are kept or cleared after the stale-session sweep. C2 asks for per-call log events precisely so that their cost is not lost either way.
- **Canvas behavior for Part B is from my understanding of the LTI and AGS standards and of Canvas, not from the dev instance.** Confirm each of these with Mir or in the dev instance before relying on it: the name of the placement that lets a tool be used as an assignment; which scopes Canvas needs to include the line item in the launch; that Canvas sends `launch_presentation.return_url` on assignment launches and where it leads; the exact AGS score path and content type; the token endpoint address for the dev instance; and that a link inside the framed tool can open a new tab.
- I have not tried the framed landing page in a real Canvas frame. The headers that matter (A8) and the cookie-free design are there because of known browser behavior, and they need a real test.
