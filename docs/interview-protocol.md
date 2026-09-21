# CAP Demo — User Testing Interview Protocol

**For:** Aliyah (interviewer)
**Subjects:** Joni (instructional design), Parand (SAP/MIS), David (security), Arash (analytics/IRB)
**Format:** ~60 minutes, one-on-one, screen-shared or in-person live trial
**Demo URL:** https://gtdqd19poa.execute-api.us-east-1.amazonaws.com/

---

## 1. Purpose

This is formative design feedback, not formal evaluation. The goal is to find out
where the demo matches or misses each colleague's mental model of what the system
should do — *before* real integrations (LTI, SAP, Credly, OpenAI) are wired in.
Feedback at this stage is cheap to act on; after integration it is not.

## 2. Interviewer briefing — know what is real and what is a stub

Colleagues will notice gaps. Your job is to let them react first, *then* explain
the limit. Do not preempt criticism by explaining stubs up front — the reaction
is the data. Use this cheat sheet when they ask:

| What they see | What's real | What's a placeholder |
|---|---|---|
| "Canvas" launchpad page | Session launch, resume, personas | Not Canvas — real launches will be LTI 1.3 inside Canvas |
| Check-in questions | Real flow, real state machine | Questions come from the seed recipe, not AI-generated yet |
| Activity steps | Real content-block model | Content is demo text, not real SAP exercises |
| "SAP verification" | Real state transitions | Always succeeds — no real SAP connection yet |
| Checkout conversation | Real chat UI and flow | **Scripted mock responses — not a real AI.** Ask them to imagine it responds like a thoughtful TA |
| Evaluation/summary | Real rubric display | Mock scores — no real LLM grading yet |
| Badge / grade | Flow exists | Credly and Canvas grade return are stubs |
| Admin login | Real role gating | Dev passwords — real login will be campus SSO |
| Session persistence | Resume works during a session | Sessions are wiped on redeploy — by design for the demo |

If they hit an actual bug (blank page, error, stuck), note it precisely: what they
clicked, what they expected, what happened. Screenshot if possible.

## 3. Session structure

### Segment A — Before (8–10 min): expectations

Ask, and let them talk:

1. "In your own words, what do you think this system does?"
2. "How are students currently assessed after these SAP exercises?"
3. "What would make a tool like this worth using in your course — or worth
   recommending for others?"
4. *(Role question — see role module for each colleague's pre-trial question.)*

### Segment B — During (20–25 min): think-aloud tasks

Instructions to the subject: *"Please say what you're thinking as you go — what
you expect, what surprises you, what confuses you. I'm not testing you, and there
are no wrong answers."*

**Student-side tasks (all four colleagues):**

1. "You are a student in a course using Canvas. Open the course and launch the
   Sales Process module." *(They land on the launchpad — watch whether they
   understand it stands in for Canvas.)*
2. "Complete the check-in."
3. "Work through the activity and let the system know you're done."
4. "Have a short conversation at checkout — answer as a student who did the work
   would."
5. "Look at your summary. Is this what you'd expect to see?"

**Admin-side tasks (tailor per role — see modules):**

6. Log in at `https://gtdqd19poa.execute-api.us-east-1.amazonaws.com/admin-app/`
   with the account for their role.
7. Role-specific task from the module below.

**Observe and note:**

- Where they hesitate, re-read, or click the wrong thing
- Words they use vs. words the UI uses ("quiz"? "assignment"? "reflection"?)
- Anything they look for that isn't there
- Exact quotes — write them verbatim

### Segment C — After (10–15 min): debrief

Common questions for everyone:

1. "What was the most confusing moment?"
2. "If a colleague described this to you tomorrow, what would you tell them it is?"
3. "What's missing that would make you trust it with real students?"
4. "What would you remove or simplify?"

Then run the role module's debrief questions. Close with:

5. "Anything I didn't ask that you expected me to?"

## 4. Role modules

### Joni — instructional design

*Login as `author@cap.local` / `dev-author-password`.* Tasks: browse the recipe
list, open the recipe editor, look at a recipe's content blocks and check-in
questions, try the "preview check-in" action.

- Pre: "How do you currently design reflection or follow-up assessment after a
  hands-on exercise?"
- Does the recipe structure (conceptual / instructional / SAP blocks, gates,
  check-in questions, probing rules) map to how you'd actually author one?
- Are the check-in questions pedagogically doing what you'd want — activating
  prior knowledge, surfacing misconceptions — or just surveying?
- In the checkout conversation: what would a *good* probing question look like
  for a student who did the exercise but can't explain it? Would the mock
  questions have caught that student?
- Is the rubric/evaluation assessing understanding, or completion? What
  dimensions would you want it to score?
- Who should author these recipes — faculty, IDs, both? What would the workflow
  need to support that?

### Parand — SAP / MIS

*Login as `author@cap.local` or just observe; optionally `admin@cap.local` /
`dev-admin-password` to see the SAP pool status page.*

- Pre: "Walk me through what a student actually does in the SAP sales-process
  exercise today — what documents do they create, in what order?"
- Does the activity's step structure match the real exercise flow? What's wrong
  or missing?
- What would "verified" actually mean for SAP? Which documents/transactions
  should the check confirm exist, and how would you know a student did the work
  vs. clicked through?
- The demo assigns each student a pooled SAP account at launch — how does that
  compare to how accounts work in your class today? Any problems you foresee?
- If the platform could pull real SAP data, what would you want it to check or
  record?
- What would you want instructors to see when reviewing a student's session?

### David — security

*Login as `admin@cap.local` / `dev-admin-password`.* Tasks: view the integration
health page, the SAP pool page, the audit log page (stub), then poke at the
student flow.

- Pre: "As interim ISO, what would have to be true before you'd sign off on a
  student-facing tool like this in a pilot?"
- Student data is intentionally ephemeral (sessions destroyed on completion,
  no PII in the persistent DB) — does that posture make sense? What would you
  add or question?
- The real launch will be LTI 1.3 and admin login will be campus SSO — both are
  stubbed. What do you want tested before either goes live?
- Browse the admin pages: is the audit/integration-health surface showing the
  right things? What's missing that an auditor or IRB reviewer would ask for?
- API keys/secrets will live in AWS Secrets Manager, never in the repo — any
  concerns with that arrangement, or with the stub/live integration switches?
- What's the biggest risk you see that we haven't mentioned?

### Arash — analytics / IRB

*Login as `researcher@cap.local` / `dev-researcher-password`.* Tasks: view the
researcher pages (consent config, data browser, export — currently skeletons),
then the student flow.

- Pre: "What questions do you want this project to be able to answer at the end
  of the grant?"
- The design keeps research data in a separate de-identified schema, gated on
  IRB approval per module, with relative (not wall-clock) timestamps — is that
  the right shape? What would IRB push back on?
- What data would you actually want to analyze: transcripts, timing, rubric
  scores, check-in answers? What's missing?
- Who should be able to see what — and does the consent configuration concept
  match how you'll describe it to the IRB?
- These feedback sessions themselves: as IRB coordinator, do you want colleagues'
  feedback treated as research data, or kept informal?
- What would an instructor-facing analytics view need to show for you to
  consider it useful?

## 5. Capture sheet

For each session, fill in:

```
Session: ______ (name/role)   Date: ______   Duration: ______

OBSERVATIONS (during tasks)
Task | What they did | Quote (verbatim) | Severity 1-3
...

TOP FINDINGS
1.
2.
3.

ROLE-MODULE NOTES
...

FOLLOW-UPS / BUGS FILED
...
```

Severity: 1 = cosmetic, 2 = confusion/recovered, 3 = blocked or wrong mental model.

## 6. Interviewer tips

- Don't lead. "What do you think this does?" not "This is the launch button."
- Silence is data — let them struggle for a few seconds before helping.
- If they propose a feature, ask "what would you use that for?" before writing
  it down.
- Distinguish "I didn't see it" (usability) from "it shouldn't be there"
  (design disagreement) — both matter, differently.
- Write verbatim quotes. "It was confusing" is weak evidence; "I expected the
  score here, not after the conversation" is actionable.
- If they ask how something works, answer after the segment, not during.
