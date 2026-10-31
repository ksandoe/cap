# LIFT Drive Review: Documents vs. Current Build

**Reviewed:** 2026-10-30. All files in the LIFT shared drive, including the IRB and Ghost Lock subfolders, compared against the `redesign-v2` branch. The "CAP demo site links and credentials" doc was deliberately not opened.
**Companion:** [interview-feedback-status.md](interview-feedback-status.md) covers Joni's and David's round 1 and was last updated Oct 10. This doc picks up from there.

---

## 1. Dates that matter

| Date | What | Source |
|---|---|---|
| **Feb 1, 2027** | LIFT interim progress report due | CSU LIFT CFP |
| **Spring 2027** | Pilot in MINS 301. The proposal promises 5 modules: Navigation, Sales, Shipping, Billing, Integrated Fulfillment | LIFT proposal, CCF proposal |
| **Jun 30, 2027** | Final report and deliverables due; all funds spent | CFP |

LIFT also requires the following:
- A **Creative Commons license** on the materials developed.
- The **common LIFT pre/post survey**.
- **Evidence on learning, engagement and equity** outcomes.
- **Scaling deliverables:** implementation guide, sample student responses, prompts and rubrics, badge criteria.

The budget is $19,000 in total, of which $3,000 is for software development.

---

## 2. Gaps from the newer interviews

None of these appear in the Oct 10 tracker. The interviews are Parand ×2, Joni round 2 and Arash.

### Blocking for the pilot

| # | Gap | Who | Code today |
|---|---|---|---|
| 1 | **SAP "Check My Work" must validate real work.** That means: the sales order exists, it belongs to the student's SAP user, and it has the expected **net value**. Existence alone is not enough. | Parand | `sapConnector.ts` is a stub that reports success. The design (master PRD, `VerificationResult`) only checks that documents exist. |
| 2 | **SAP account model.** The UCC/SAP group may no longer allow random pooled accounts that are reused. Students also need to come back to the *same* account (crashes, unfinished work, reviewing earlier documents). | Parand | Random pool assignment, released on exit (`localStore.ts`, `sapPool.ts`). The superseded IIO PRD had a 1:1 Canvas→SAP map, which may need to come back. |
| 3 | **Canvas LTI + grade return** is still stubbed. Campus guidelines make it a **"Category B" integration**, which needs an IT and data-owner design review before deployment. | David, campus DoIT | Stubbed |

### Research and privacy (conflicts the team needs to resolve)

| # | Gap | Who | Code today |
|---|---|---|---|
| 4 | **Stable pseudonymous student ID** linking attempts across modules. The LIFT proposal's *primary impact measure* is a within-student, early-vs-late comparison of reflections. It also needs an equity breakdown by first-gen, transfer and Pell status, so the key must link to institutional data. | Arash, LIFT proposal | Only `attemptNumber`. The master PRD deliberately keeps cohort-level IDs only, so **the PRD and the research plan disagree.** |
| 5 | **Re-identification through timestamps and scores.** An instructor could match exact scores and times against Canvas. Don't promise anonymity until this is solved. | Joni | `EvalRecord.completedAt` is an absolute ISO timestamp. The PRD calls for relative offsets. |
| 6 | **Session duration** and time spent per section | Arash, Parand | The `research.interaction_timing` table exists in the migration but nothing writes to it. No duration is stored. |
| 7 | **Warn students not to type identifying information** in the conversation | Arash | None |
| 8 | **IRB.** The existing IRB 2024-164 covers an anonymous CoI/self-efficacy survey and **does not cover CAP**. CAP needs its own protocol or an amendment. Precedent from the Lecture Companion IRB (2026-101): a consent coordinator holds the code key, the instructor sees only coded data after grades are final, and **full transcripts are excluded from research data**. CAP's research plan depends on transcripts, so this has to be negotiated. | IRB docs | Consent UI and IRB pages are stubs |
| 9 | **Student data sent to the LLM.** Campus guidance prohibits FERPA data and PII in AI prompts (written for coding assistants, but it shows the campus position). The code already supports Azure OpenAI and institutional gateways, which is a good fit for an approved enterprise endpoint. | Campus guidelines | Provider-neutral, ready to repoint |
| 10 | Research export as CSV/Excel | Arash | `exportCsv` and the researcher export are `TODO`s |

### Rubric decision

The rubric is defined in three different ways:
- **Code** (`MASTER_RUBRIC`): process understanding, conceptual vocabulary, transfer & reflection.
- **LIFT proposal and architecture diagram:** systems thinking, problem solving, skill articulation, transfer awareness.
- **Joni (round 2):** split "transfer" and "reflection" into separate dimensions.

The rubric is editable under Platform settings, so this needs a team decision, not code. It should be settled before the pilot so that research ratings are comparable.

### Instructor view and engagement signals

- **Count of "I don't know" answers**, unusual time spent per section, and problems students report (Parand). None of these are captured.
- **Aggregate class-wide patterns** rather than reading every transcript (Joni). The draft paper also says the PoC "lacks an instructor view" and that the pilot needs one, plus a way for students to dispute an evaluation and for instructors to override it.
- **Completion policy:** the draft paper flags the "Completed" threshold as still open. The architecture diagram says *Module Complete = SAP PASS AND assessment ≥ threshold*. `overallMin` 60 and `dimensionFloor` 40 exist in the code but need to be justified and explained. The per-dimension floor confused both Parand and Joni.

### Authoring polish (Parand round 2, Joni round 2)

- Explain the difference between **student-visible instructions and AI assessment context** more clearly.
- **Copy or duplicate an existing module.** Not available today.
- **Multiple screenshots per step.** The image cap is 280 KB (`adminService.ts`). Parand uses 2–3 screenshots per substep.
- **Upload limit.** Parand hit it on an "11 MB" Word doc; the cap is 5 MB per file (`authoringService.ts`). Show the limit up front.
- **Fixed vs per-student parameters.** Discount and quantity are fixed per assignment; IDs and materials vary by SAP user.
- Explain **probing rules vs vague-answer triggers vs tone**.
- **Show where the problem is** when a publish check flags something.
- **Guidance for setting thresholds,** tied to grading standards faculty already use.
- **Preview while authoring**, not only at the end.

### Student UI quick fixes

- The check-in short-answer field is a single-line `<input>` → make it about 3 lines (Arash).
- **Label every Likert point**, not only the ends (Arash). The uncommitted `normalizeCheckinOptions` work is partly related.
- SAP instruction content: required-field asterisks, where the document number appears, the blank-tab-after-save behavior, the VA03 Document Flow path, Enter/Continue on warning messages (Parand). This is content for the authored recipe, not code.
- Consider an early "How did the activity go? Any problems?" turn. The tracker says this is already in place, so check it against the live prompt.

---

## 3. Document conflicts

| Topic | Master PRD | Elsewhere |
|---|---|---|
| SAP accounts | Random pool, reset on exit | IIO PRD: 1:1 map. Parand: pooled reuse may not be allowed |
| Session expiry | 8 h | IIO PRD: 72 h. Code marks sessions INTERRUPTED after more than 24 h |
| Research identity | Cohort ID only, no linking across attempts | LIFT proposal and Arash need within-student linking |
| Rubric | 2–6 dimensions per recipe | Code: 3 platform-wide. Proposal: 4. Joni: split transfer and reflection |
| Grade mapping | 1.0 / 0.5 / 0.0 | Draft paper: Completed / Still in progress (completion credit). David: instructor confirms in Canvas |
| Enrollment | n/a | 300–400 (paper) vs 400–500 (proposal) vs about 1,000/yr (CCF). Affects LLM cost |
| Transcripts in research | Stored after de-identification | Lecture Companion IRB precedent excludes them |

---

## 4. Other files

- **Ghost Lock**: a VICEROY cybersecurity CTF challenge set (Georgia Cyber Range). Its "answer checking scripts" verify what the student actually did by watching filesystem state, which is the same pattern Parand wants for SAP verification. The walkthrough is an answer key and must never go into student-facing AI context.
- **AI Agent/Chatbot Open-ended Questions**: draft student survey items (pre, after each assessment, end of course). One item asks "what do students want professors to see", which ties into the transparency notice.
- **IJDL article** (published MINS 301 design case) and **draft commentary** ("When the Chatbot Asks the Questions…"). The draft needs screenshots of the instructor view and the evaluation card; it says to label them "proposed" if they aren't built.
- **CCF Grant Proposal**: $10k/yr for Credly badges, about 1,000 students × 5 badges.
- **ABDC journal list**: reference only.

## 5. Suggested order of work

1. **Ask UCC:** pooled vs 1:1 SAP accounts, and whether OData can read a sales order's net value and creating user. This unblocks #1–2.
2. **Team decisions:** the rubric dimensions, the completion rule, and the research identity model. Settle identity with the IRB/consent design (#4, #5, #8).
3. **Request the IT Category B review** for Canvas LTI and the LLM data flow (#3, #9).
4. **Build:** session duration and engagement signals, a minimal instructor aggregate view, the student PII notice, and CSV export.
5. **Quick UI fixes and authoring polish** (Section 2, last two subsections).
