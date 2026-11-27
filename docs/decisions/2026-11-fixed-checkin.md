# Decision: a fixed check-in questionnaire per module (stage 1 of a cumulative profile)

**Date:** 2026-11-27. Requested by Kent. **Status:** stage 1 built (this change). Stages 2 and 3 are proposals and need David and the IRB before anyone builds them.

## Decided and built (stage 1)

Each module has its own check-in questionnaire, stored on the recipe (`Recipe.checkinQuestions`). Every student gets exactly those questions, in that order, on every attempt, including a repeat of the module. No model call is made at check-in for such a module.

- **Authoring.** In the admin wizard, Conversation guidance now has a Check-in questions editor: generate a draft with the AI, edit the wording, options, order, theme and type, add or remove questions, publish. "Stop using fixed questions" goes back to the old behavior.
- **Question keys.** A question's key stays the same when its wording is edited, because answers are recorded against the key. The editor says so and advises adding a new question when the meaning changes.
- **Fallback.** A module with no fixed questions still gets questions generated per session, as before. So does a module whose stored questions fail validation, and the server logs `CHECKIN_QUESTIONS_INVALID`.
- **Validation** (`validateCheckinQuestions` in `@cap/shared`): at most 12 questions, unique keys, text up to 300 characters, likert and multiple choice need 2 to 8 distinct options, short text has none. The admin app checks it before publishing, and the server checks it on publish and on recipe save, so a malformed set never reaches students.
- **The Sales module** is seeded with seven drafted questions (past 3, present 2, future 2), using the themes the model used to be asked for. Parand owns the final wording.

**Why.** The generated questions differed between students, so the answers could not be compared. They cost a model call per session, and the model's varying output once caused a white-screen bug. Fixed questions make the data comparable, remove the call, and let Parand review exactly what students see.

**Alternatives rejected.** Defining the questions in code: Parand could not edit them. Generating once and storing it automatically at first use: unreviewed content would reach students.

## Rollout notes

- **Deploying does not change a deployed module.** The deployed Sales recipe has no fixed questions until either (a) Parand publishes a new version with them from the admin app, or (b) someone re-seeds `sim-sales-process` (`SEED_ONLY_MODULE=sim-sales-process`), which overwrites version 1 and does not touch a higher version Parand has published. A local development store that predates this change gets the questions added on the next start.
- **Publishing from the wizard used to drop any field it did not list.** The new field is now carried through, with a test that fails without that.

## Proposed, not built

**Stage 2: a stored, cumulative profile.** Store each learner's answers (pseudonymous, keyed by the learner key) by module and question key. Split the questions into **core** ones asked once (general work experience, software use) and **module-specific** ones asked each time. Later modules skip questions already answered.

**Stage 3: use the profile in later conversations,** so the Billing conversation can draw on what the student said in Sales.

Open points for David and the IRB before stage 2:
- It is persistent per-learner data. Short typed answers can contain anything a student writes.
- Students should be able to see and delete their profile.
- Retention: the semester is the natural limit.
- Typed answers go into the model's instructions, so they must be fenced as untrusted text.
- The profile shapes the conversation only. It must stay out of the evaluation prompt, as it is today.
- Whether to keep a repeater's first answers, the latest, or both.
