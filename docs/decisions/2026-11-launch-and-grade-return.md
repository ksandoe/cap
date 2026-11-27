# Decision (proposed): launch in the Canvas frame, work in a new tab, grade returned by the server

**Date:** 2026-11-23. Written by Claude for Kent. **Status: proposed.** Not yet agreed with David, Mir or Aliyah.
**Follows:** `docs/decisions/2026-10-canvas-lti-atec.md` (phase 2 is the write-back of completion to Canvas).
**Basis:** the first successful Canvas dev launch (2026-11-22) and a read of `ltiService.ts`, `gradeService.ts`, `orchestratorService.ts` (`completeSession`, `createRetry`), `sessionDb.ts` and `app.ts` at `main`. Facts about Canvas are from my understanding of the standards and of Canvas, not from the dev instance; section 7 lists what to confirm.

## 1. What is proposed

The sequence Kent described:

1. **Launch to a landing page inside the Canvas frame.** The student opens an assignment in Canvas. The tool shows a short page in the frame: status and a button.
2. **The button opens CAP in a new browser tab.** The activity gets a full window. The new tab is signed in with a one-time code from the landing page, not by a second LTI launch.
3. **On completion the server posts the grade to Canvas (AGS)** and the landing page shows the result. The new tab's last screen offers "Return to Canvas".

Grade return does not depend on steps 1 and 2. It needs only an assignment launch (so there is a gradebook line) and the server. The landing page is a better experience on top of it, and it can come second.

## 2. Why this works

| Step | Mechanism |
|---|---|
| In-frame landing page | Canvas shows a tool launched from an assignment in an iframe. The launch is the same as today's, with a different placement. |
| New tab from the frame | A link with `target="_blank"` clicked in a frame is allowed. The new tab is first-party to CAP, so cookie rules do not bite. |
| Signing the new tab in | A short-lived, single-use code is placed on the link. The new tab exchanges it for the session token. This also replaces the session token that is currently placed in the address after launch. |
| Status in the Canvas frame | The landing page polls a status endpoint on our server with a short-lived token issued at launch. It returns a status only. |
| Grade | The server calls Canvas directly (AGS), using the line item address that arrives with each assignment launch. The browser is not involved. |
| "Return to Canvas" | The launch carries a return address that leads back to the Canvas page. Reaching it relaunches the tool and the landing page shows the new status. |

Two choices come from how browsers behave:
- **The two tabs do not talk to each other.** Browsers increasingly isolate storage inside embedded frames, so the frame and the new tab may not share anything. The server is the only meeting point.
- **No cookies for login state.** The OIDC login now runs inside the frame, where third-party cookies are often blocked. The `state` and `nonce` must live on the server or be signed values.

## 3. What is missing today

1. **Grade failures are lost.** `completeSession` posts the grade in a call whose errors are ignored, then deletes the session, including the grade address and the student's `sub`. A short Canvas outage loses the grade permanently.
2. **There is no completion record for a learner.** Only de-identified research records survive. A landing page has nothing to read, and a retry has nothing to retry from.
3. **A security gap.** The grade address comes from the launch token, which is not yet verified. A forged launch could point it at another server, and our server would send its Canvas access token there. Launch verification must come before grade posting, and the address must also be checked to belong to Canvas.
4. **The stub posts to the wrong address,** as I understand the AGS standard (scores go to the line item address with `/scores` added).
5. **No return address is read** from the launch.
6. **No framing policy.** The app sends no framing headers, so anyone can frame it. It should allow only Canvas.

## 4. Proposed design

- **Completion record (new, persistent).** One per learner and activity: learner key, activity id, status, attempt count, last result, grade state (`pending`, `posted`, `failed`), post attempts, and what is needed to post (line item address, raw `sub`, context id, return address). Server-side only; never returned to a browser. A time-to-live purges it at semester end.
- **Retry.** A completion writes the record as `pending` and tries to post. A failure leaves it pending and it is retried on the student's next launch and by an admin-only action. A scheduled job is a later option.
- **Token and key.** The tool's private key lives in AWS Secrets Manager. The server requests a Canvas token with a signed assertion and caches it.
- **Idempotent posting.** Posting the same result twice must not create two scores. Scores can be overwritten by a later one.
- **Placement.** Tool launched from an assignment. The key gets the score scope and, probably, the read-only line item scope. Kent is asking Mir.

## 5. Alternatives considered

| Alternative | Why not (for now) |
|---|---|
| **Canvas's own new-window behavior with no landing page** | Simplest and it works for grading, because an assignment can be set to open the tool in a new window. The Canvas frame shows nothing about status. It is a sensible first version of grade return, and the landing page can replace it. |
| **Scoped Canvas API instead of AGS** | ATEC knows it better. It means holding a Canvas credential with reach beyond this tool, and finding each student's assignment ourselves. AGS gives the right address in every launch and scopes the tool to its own line item. Kent proposes AGS. Mir's view is wanted. |
| **Tabs talking to each other (storage or messaging)** | Unreliable inside embedded frames because of storage isolation. |
| **Cookies for login state** | Blocked in many browsers inside an iframe. |
| **Keeping the session after completion** | Sessions are deleted on purpose (FERPA). A small purpose-built record is easier to explain and to purge. |

## 6. Consequences

- **David reviews** the completion record (new persistent per-learner data, including the raw `sub` already held server-side), the one-time code and the removal of the address token.
- **Launch verification comes first.** It is already the first item in Aliyah's package, and it now also protects the grade path.
- **Infrastructure for Kent:** a Secrets Manager secret for the private key, and permission for the function to read it. A scheduled retry would need more.
- **Work package:** `docs/work-packages/wp6-orchestration-testing-costs.md`, Part B (tasks B1 to B5) and task A8.
- **Order:** verified launch, completion record and retry, AGS client, then landing page and "Return to Canvas".

## 7. To confirm with Mir or in the dev instance

1. The placement that lets the tool be used as an assignment, and whether the key needs anything else to do so.
2. Which scopes Canvas needs to put the line item in the launch and to accept a score.
3. That Canvas sends `launch_presentation.return_url` on assignment launches, and where it leads.
4. The exact AGS score path and content type (from the specification), and the dev instance's token endpoint address.
5. That a link inside the framed tool can open a new tab, that a later score overwrites an earlier one, and how the posting policy (automatic or manual) affects when the student sees the grade.
6. AGS or the scoped API, and the production approval path.

## 7a. Progress

**Landing page, first version (2026-11-30).** Built on the current sign-in mechanism, before the one-time code, the completion record and the grade client exist.
- A verified launch goes to `/landing` (switch `LTI_LANDING_PAGE=off` sends it to the activity directly, as before). The page checks whether it is inside a frame. In a frame, it shows the activity, the student's stage, and a link with `target="_blank"` that opens the activity in a new tab. As a whole window, it passes straight on to the activity.
- Status comes from `GET /session/status`, which reads the session from the token and always answers 200, including for a finished or deleted session. The shared API client sends the whole page elsewhere on a 404, so a polled endpoint must never return one.
- The page asks the host to resize the frame with the standard `lti.frameResize` message.
- **Not yet possible:** showing "completed", a score or "Return to Canvas". They need the completion record (B3), the grade client (B4) and the return address (B0 confirms it is sent).
- **Not decided by anyone yet:** whether Canvas reports an assignment launch as framed. The page does not depend on it, because it checks the frame itself. B0's log line (`launch_presentation.document_target`) is still worth reading.
- **Found while building:** the session routes under `/session/:id` do not check that the id in the address belongs to the token's session, so any valid token can read any session whose id it knows. Ids are random, which limits the risk, but the check should be added (Aliyah's list, David to review). The new status route avoids it by using the token's own session.

## 8. Open decisions

- What counts as passed, and whether a failed attempt posts 0.0 or nothing.
- Retention period for the completion record.
- Whether the landing page ships with the first version of grade return or just after it.
