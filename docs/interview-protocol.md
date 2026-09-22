# CAP Demo — User Testing Interview Protocol

**For:** Aliyah (interviewer)
**Subjects:** Joni (instructional design), Parand (SAP/MIS), David (security),
Arash (analytics/IRB) — all faculty with teaching-practice expertise
**Format:** ~60 minutes, one-on-one, live trial with think-aloud
**Demo URL:** https://gtdqd19poa.execute-api.us-east-1.amazonaws.com/

---

## 1. Purpose

Formative design feedback, not formal evaluation. Find out where the demo matches
or misses each colleague's mental model of the system — *before* real
integrations (LTI, SAP, Credly, OpenAI) are wired in and changes get expensive.

## 2. Interviewer briefing — know what is real and what is a stub

Colleagues will notice gaps. Let them react first, *then* explain the limit —
the reaction is the data. Don't preempt criticism by explaining stubs up front.

| What they see | What's real | What's a placeholder |
|---|---|---|
| "Canvas" launchpad page | Session launch, resume, personas | Not Canvas — real launches will be LTI 1.3 inside Canvas |
| Check-in questions | Real flow, real state machine | Questions come from the seed recipe, not AI-generated yet |
| Activity steps | Real content-block model | Content is demo text, not real SAP exercises |
| "SAP verification" | Real state transitions | Always succeeds — no real SAP connection yet |
| Checkout conversation | Real chat UI and flow, real AI (gpt-4o-mini test key) | Question quality is limited by the small model — the official key may use a larger one |
| Evaluation/summary | Real rubric display, real AI scoring | Same model caveat |
| Badge / grade | Flow exists | Credly and Canvas grade return are stubs |
| Admin login | Real role gating | Dev passwords — real login will be campus SSO |
| Session persistence | Resume works during a session | Sessions are wiped on redeploy — by design for the demo |

If they hit an actual bug (blank page, error, stuck), note it precisely: what
they clicked, what they expected, what happened. Screenshot if possible.

## 3. Session structure

### Segment A — Before (8–10 min): expectations

1. "In your own words, what do you think this system does?"
2. "How are students currently assessed after these SAP exercises?"
3. "What would make a tool like this worth using in your course?"
4. *(One role-specific question — see §4.)*

### Segment B — During (20–25 min): think-aloud tasks

Script to the subject: *"Please say what you're thinking as you go — what you
expect, what surprises you, what confuses you. I'm not testing you; there are no
wrong answers."*

**Student-side tasks (everyone):**

1. "You are a student in a course using Canvas. Open the course and launch the
   Sales Process module." *(They land on the launchpad — watch whether they
   understand it stands in for Canvas.)*
2. "Complete the check-in."
3. "Work through the activity and let the system know you're done."
4. "Have a short conversation at checkout — answer as a student who did the
   work would."
5. "Look at your summary. Is this what you'd expect to see?"

**Admin-side task (everyone):**

6. Log in at `/admin-app/` with the account matching their role (see §4) and
   take the role-specific task listed there.

**Observe and note:**

- Where they hesitate, re-read, or click the wrong thing
- Words they use vs. words the UI uses ("quiz"? "assignment"? "reflection"?)
- Anything they look for that isn't there
- Exact quotes — verbatim

### Segment C — After (10–15 min): debrief

Common questions for everyone — lean on these, since all four colleagues can
speak to teaching practice:

1. "What was the most confusing moment?"
2. "If a colleague described this to you tomorrow, what would you tell them it is?"
3. "As an instructor, would the check-in questions and checkout conversation
   tell you something a quiz can't? What's missing?"
4. "If you were the teacher using this, what would you want to see about your
   students' sessions?"
5. "What's missing that would make you trust it with real students?"
6. "What would you remove or simplify?"

Then the role-specific debrief questions from §4. Close with:

7. "Anything I didn't ask that you expected me to?"

## 4. Role supplements

Each colleague gets the full protocol above. These are the deltas — one pre-
trial question, their admin login and task, and 3–4 debrief questions.

### Joni — instructional design

- **Admin login:** `author@cap.local` / `dev-author-password`
- **Task:** browse the recipe list, open the recipe editor, examine the content
  blocks and check-in questions, try "preview check-in."
- **Pre:** "How do you currently design reflection or follow-up assessment
  after a hands-on exercise?"
- **Debrief:**
  - Does the recipe structure (conceptual / instructional / SAP blocks, gates,
    probing rules) map to how you'd actually author one?
  - Are the check-in questions doing pedagogical work — activating prior
    knowledge, surfacing misconceptions — or just surveying?
  - Is the evaluation assessing understanding or completion? What dimensions
    should it score?
  - Who should author recipes — faculty, IDs, both? What workflow supports that?

### Parand — SAP / MIS

- **Admin login:** `admin@cap.local` / `dev-admin-password`
- **Task:** view the SAP pool status page and integration health page; browse
  the recipe's SAP activity blocks.
- **Pre:** "Walk me through what a student actually does in the SAP
  sales-process exercise today — what documents, in what order?"
- **Debrief:**
  - Does the activity's step structure match the real exercise flow? What's
    missing?
  - What would "verified" actually mean in SAP — which documents/transactions
    should the check confirm, and how would you catch a student who clicked
    through without doing the work?
  - The demo assigns each student a pooled SAP account at launch — how does
    that compare to how accounts work in your class today?
  - What would you want instructors to see when reviewing a session?

### David — security

- **Admin login:** `admin@cap.local` / `dev-admin-password`
- **Task:** view the integration health, SAP pool, and audit log pages; then
  poke at the student flow however you like.
- **Pre:** "As interim ISO, what would have to be true before you'd sign off on
  a student-facing tool like this in a pilot?"
- **Debrief:**
  - Student data is intentionally ephemeral — sessions destroyed on completion,
    no PII in the persistent DB. Does that posture make sense? What would you
    question?
  - LTI launch and campus SSO are stubbed for now — what do you want tested
    before either goes live?
  - Is the audit/integration-health surface showing the right things? What
    would an auditor or IRB reviewer ask for that isn't there?
  - What's the biggest risk you see that we haven't mentioned?

### Arash — analytics / IRB

- **Admin login:** `researcher@cap.local` / `dev-researcher-password`
- **Task:** view the researcher pages (consent config, data browser, export —
  currently skeletons), then walk the student flow as a student would.
- **Pre:** "What questions do you want this project to answer by the end of the
  grant?"
- **Debrief:**
  - Research data lives in a separate de-identified schema, gated on per-module
    IRB approval, with relative rather than wall-clock timestamps. Is that the
    right shape? What would IRB push back on?
    - What data would you actually want to analyze — transcripts, timing, rubric
      scores, check-in answers? What's missing?
    - These feedback sessions themselves: should colleague feedback be treated
      as research data, or kept informal?
    - What would an instructor-facing analytics view need to show to be useful?

## 5. Capture sheet

```
Session: ______ (name/role)   Date: ______   Duration: ______

OBSERVATIONS (during tasks)
Task | What they did | Quote (verbatim) | Severity 1-3
...

TOP FINDINGS
1.
2.
3.

ROLE-SUPPLEMENT NOTES
...

FOLLOW-UPS / BUGS FILED
...
```

Severity: 1 = cosmetic, 2 = confusion/recovered, 3 = blocked or wrong mental model.

## 6. Interviewer tips

- Don't lead. "What do you think this does?" not "This is the launch button."
- Silence is data — let them struggle a few seconds before helping.
- If they propose a feature, ask "what would you use that for?" before writing
  it down.
- Distinguish "I didn't see it" (usability) from "it shouldn't be there"
  (design disagreement) — both matter, differently.
- Write verbatim quotes. "It was confusing" is weak; "I expected the score
  here, not after the conversation" is actionable.
- If they ask how something works, answer after the segment, not during.
