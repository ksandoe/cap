# Decision: Canvas LTI integration path with ATEC

**Meeting:** week of 2026-10-19. Kent Sandoe, David Zeichick, Miroslav (Mir) Lulic (campus Canvas lead, ATEC).
**Record of meeting:** Mir's follow-up email to Chris. Kent and his assistant reviewed it against the transcript and found it accurate. This note adds implementation detail the email leaves out.
**Status:** Agreed at the working level. Production use still needs formal IT review.

## What was decided

1. **Support boundary.** Kent, David and the College of Business own the application, its hosting and its maintenance. ATEC owns the Canvas-side LTI registration and placement. The long-term model is the same as for any third-party LTI tool. Mir said this boundary removed his main concern.
2. **Phased integration.**
   - **Phase 1: authentication and launch only.** No name, email, roster (NRPS) or other student information is requested.
   - **Phase 2: write-back of completion to Canvas.** Whether to use AGS or narrowly scoped Canvas API access is **still open**. Kent proposed AGS; ATEC has more experience with scoped API access.
3. **Completion is graded.** The activity awards **all-or-nothing points** in Canvas. David asked about this explicitly, and Kent confirmed it.
4. **Credly stays out of CAP.** Canvas acts as the intermediary for badges, so CAP never handles student email addresses. Mir called this "cleaner" because the completion record stays in Canvas.
5. **Governance gate: a dev pilot is not production approval.** Experimentation happens in Canvas Dev now. Formal review (possibly ITPR/HECVAT, as Chris directs) comes before real students use the tool. Production can be limited to selected courses.

## Phase 1 launch data (implementation detail not in Mir's email)

| Purpose | Source | Notes |
|---|---|---|
| Learner identity | `iss` + `sub` | `sub` is unique only per issuer, so key on the pair. Pseudonymous but **still linkable by Canvas admins**, so treat it as an identifier. Never send it to the browser or the LLM; hash it (HMAC with a server secret) before using it in any research or eval record. |
| Course / context | LTI `context` claim | |
| Activity identity | LIFT-owned custom parameter, e.g. `activity_id=sales_process` | Separate from learner identity. |

## Commitments from ATEC (Mir)

- A Canvas Dev course and environment
- Installing and registering the LTI in Canvas Dev
- Working out the minimum permissions and the right placement together
- Test student and instructor roles for Kent, David and Aliyah
- Initial Canvas-side troubleshooting during development
- Help with the Credly ITPR process if needed

## Action items

| Owner | Item | When |
|---|---|---|
| Kent / Parand | Find out whether Credly is already covered by the Pearson relationship. If not, **start an ITPR request**. Mir estimates 2–6 weeks for that process. | **Within ~2 weeks of the meeting** (by mid-November 2026) |
| Kent / David | Phase 1 LTI implementation against Canvas Dev | After ATEC provisions Dev |
| Team + ATEC | Choose AGS or Canvas API for write-back | Phase 2 |
| Chris / IT | Decide whether ITPR/HECVAT is needed for production | Before real students use it |

## Consequences for the code

- **Done 2026-10-30:** learner identity.
  - `ltiService.ts` derives an opaque learner key, an HMAC of `iss`+`sub` (`identity/learnerKey.ts`, secret `LEARNER_KEY_SECRET`).
  - The raw `sub` is kept only in the server-side session record for grade write-back. It is stripped from the browser session response and no longer appears in the session JWT.
  - The activity comes from `custom.activity_id`; `module_id` is still accepted as a fallback.
- **Done 2026-10-30:** grading.
  - The score is now **1.0 if passed, else 0.0**. The threshold that defines "pass" is still a team decision.
  - `gradeService.ts` now sends `sub` as the AGS `userId`; it previously sent `lis_result_sourcedid`, which was a bug.
- `badgeService.ts` (direct Credly issuance with recipient email) is **superseded**. Badges are issued through Canvas. Keep the stub disabled and remove it once the Canvas-side badge path is confirmed.
- **Research identity:** a stable `iss`+`sub` from LTI makes Arash's stable pseudonymous ID feasible, through a keyed hash held server-side. It is still subject to the IRB and consent design. The master PRD's cohort-only model would need to change.
- **License terms:** Canvas Dev URLs, client IDs and keys go in `.env` only. They are never pasted into Claude.
