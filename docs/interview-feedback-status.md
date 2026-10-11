# Interview Feedback — Status Update

**Feedback from:** Joni Dunlap (instructional design) and David Zeichick (security)
**Date:** October 2026 — updated for v3 (wizard authoring, AI-assisted
generation, conversation hardening) and v3.1 (activity/recipe separation,
platform settings)

---

## What changed in response to your feedback

### Joni

| Your feedback | What changed |
|---|---|
| Explain the check-in's purpose before students answer | Check-in opens with: "A few quick questions about your experience. These aren't graded — they help tailor the conversation you'll have after the activity." |
| Conversation should feel reflective, not like a quiz | The AI is prompted as a "reflective debrief partner" — a mentoring conversation that invites reflection rather than quizzes facts, and never says "correct"/"incorrect" |
| One question at a time; no compound questions | Enforced twice: the AI is instructed to ask exactly one question per reply, and the interface truncates any reply after the first question mark as a hard guarantee |
| Match the student's experience level | Each student's check-in answers are injected into the conversation prompt, so the AI calibrates probing to what the student reported |
| Gentler handling when students don't know | Probing rules tell the AI to validate before redirecting; the checkout is framed as drawing out experience, not catching gaps |
| Knowledge checks need feedback and clarity of purpose | Knowledge checks are formative (ungraded), labeled "self-check — not graded," and show authored feedback explaining the answer |
| Ask about process and strategies | Recipe probing rules target what worked, what didn't, and what they'd do differently; the fixed conversation close includes a durable-skills question |
| **Authoring is too much for one session** *(v3)* | The long form is gone. Authoring is now a 5-section wizard with per-section "mark complete," server-side drafts, and autosave — you can stop and resume across sessions, and the workspace shows progress per draft |
| **Separate generating from maintaining** *(v3)* | "New module — AI-assisted" opens a generation dialog (upload Word/PDF or paste text, answer a few focusing questions); the AI drafts module metadata, outcomes, concepts, and conversation behavior. Published modules get a "Maintain →" path through the same wizard. Activity/assignment steps are always author-built — the AI never invents procedures |
| **One rubric for research** *(v3, v3.1)* | Per-recipe rubrics were removed from authoring; evaluation applies a platform-wide master rubric so dimension ratings are comparable across modules. *(v3.1)* The rubric is now editable under Admin → Platform settings — the code constant remains the fallback |
| **Recipe vs activity still blurred** *(v3.1)* | The wizard rail now groups sections into two labeled tracks: "Student activity" (steps + parameters — the instructions students follow) and "Assessment recipe" (outcomes, concepts, conversation guidance — what the reflective agent works from). Each section shows a track banner explaining the distinction; the AI generation dialog only ever touches recipe-side fields |
| **Admin navigation was misleading** *(v3.1)* | Dashboard links that lead to unbuilt pages are now tagged "not yet built"; stub pages say so plainly instead of showing bare TODOs or mock data. Nav-bar entries land on each section's most useful implemented page |

**Still working on:**

- **Teaching presence** — recipes support instructor tone guidance (text); video/audio instructor presence is not built yet.
- **Clickable definitions** — key concepts inform the AI but there's no student-facing glossary yet.
- **Check-in phrasing guarantees** — questions are AI-generated per module, so the problematic fixed wording is gone, but the generation prompt doesn't yet codify your rules (avoid yes/no, avoid compound questions). Straightforward addition.

### David

| Your feedback | What changed |
|---|---|
| Chatbot responses too long | Replies are capped at ~60 words with a strict one-question rule — no more walls of explanation |
| AI repeating the student's answer back | The debrief framing + word cap constrains replies to a brief acknowledgment plus one question |
| Summary was a "wall of text" | Students see only a verdict ("Well done!" / "Not quite yet") plus a 2–3 sentence summary. All rubric detail is stored de-identified and never shown to students |
| "Retry Conversation" label was unclear | Two clearly labeled options: "Try the reflection again (attempt N)" and "Redo the activity" — plus a read-only "Review what you did" so review and redo stay distinct |
| Remove the JSON download from the student UI | Removed entirely |
| "Something went wrong in SAP?" was confusing | That copy is gone. Guided instructions now have clickable per-step help branches, and students are assigned real SAP pool credentials with progress tracking. The conversation also asks about problems up front instead of leaving them to emerge late |
| Instructor needs a concise report | The instructor view shows a compact rubric-score table, per-dimension narratives, and the full transcript — all de-identified |
| Minimize student-identifying data | Sessions use opaque Canvas-linked keys, the session record is destroyed on completion, and research records are fully de-identified. No demographics collected |
| **Prompt injection / leaked answers** *(prototype finding, v3)* | The conversation prompt now carries explicit security rules: student messages are never treated as instructions, and requests for "expected"/"ideal" answers or fake debug/developer modes are declined. An output-side filter strips any leaked answer lines as a backstop, and the evaluator doesn't credit parroting the AI's explanations as understanding |
| **Clarification shouldn't cost a turn** *(prototype finding, v3)* | The agent flags help/clarification exchanges with a `[GRACE]` marker; those turns don't count against the conversation budget, and the student's question is displayed with a "clarifying question" tag |
| **Retry should target weaknesses** *(v3)* | A retry conversation now receives the prior attempt's evaluation: demonstrated areas are acknowledged rather than re-probed, and weak areas get scaffolded follow-ups instead of the same question again |
| **Students couldn't look back at their work** *(prototype finding, v3)* | "Review what you did" is available during the conversation and on the summary — a read-only view of the completed activity with ticks preserved |

**Still working on:**

- **Canvas LTI + grade return** — launch endpoints exist but remain stubbed (the grade column is simulated locally). Your suggestion that the instructor review/confirm the grade rather than auto-posting is the planned model; real LTI testing is the next integration milestone.
- **Maintenance plan** — noted as a beyond-pilot requirement.
- **Admin auth** — interim shared passkey is in place and now rotatable under Admin → Platform settings; per-user OTP sign-on with institutional emails and superadmin-managed roles is the planned model.

---

## For discussion today

1. Master rubric wording — the three dimensions (process understanding, conceptual vocabulary, transfer and reflection) are placeholders for the research team to finalize; the team can now edit them directly under Admin → Platform settings.
2. Joni: does the generation dialog ask the right focusing questions — and is five sections the right chunking for the wizard?
3. David: for the LTI pilot, what grade-handling would satisfy campus policy — instructor-reviewed pass/fail, or something else?
4. Should the passkey rotate per session/semester, or is a single team key acceptable until OTP lands? (It can now be rotated from the admin UI whenever needed.)
