# Work package 1: run the Sales simulator inside CAP

**Status:** draft for Kent, 2026-11-18. Written by Claude as the architect; Devin builds the CAP side. Not yet agreed with David.
**Implements:** `docs/decisions/2026-11-one-repo.md` and §2a point 2 and §3 of `docs/cap-integration-design.md` (independent simulations; engine in the backend).
**Basis:** a read of CAP `main` at `d3ae4d6` (`orchestratorService.ts`, `sapConnector.ts`, `sessionDb.ts`, `sessionToken.ts`, `auth.ts`, `routes/session.ts`, `app.ts`, `shared/types/recipe.ts`, `frontend-student/.../blocks.tsx`) and the simulator packages. I did not read the admin authoring UI, `infra/`, or the tests (there are none).

## 1. Goal and definition of done

A student launches the Sales activity from CAP, builds the inquiry, quotation and sales order in the simulated SAP screens inside the CAP student app, presses "I have completed the activity", and CAP checks the result on the server. A correct result moves on to the reflective conversation. An incorrect result shows a message that helps without giving the answer.

Done means all of these are true on a developer's machine with `USE_LOCAL_DB=true`:

1. From CAP's dev launchpad, the Sales activity opens with the simulator in the activity frame and the instructions beside it, taken from a CAP recipe.
2. No SAP pool account is taken for this activity, and `session.parameters` come from the simulator's per-learner assignment.
3. The student can create VA11, VA21 and VA01 documents, leave, relaunch, and find their documents again.
4. Verification checks that each document exists, belongs to this learner, and has the expected net value. A wrong discount or a missing material fails with a student-safe message.
5. **No response from any CAP endpoint ever contains an expected net value.** There is an automated test for this.
6. `npm run typecheck`, the build of all apps and `npm run test:sim` pass. The CAP student, admin and backend apps build as they did before.

## 2. Out of scope (do not start these here)

- The phase refactor (flow as data, separate lifecycle and progress). That is Stage 2.
- Live SAP, framing, the hunt and the integrative exercise.
- Shipping and Billing simulations.
- Moving sim events into reflection evidence (Stage 3). The sim keeps logging events, nothing consumes them yet.
- LTI hardening and grade write-back. That is a separate job (Aliyah, reviewed by David). It touches `createSession`, so see §8.
- Creating real DynamoDB tables. The code is written and the table is documented, but the AWS step is Kent's.

## 3. Facts found in the code that shape the design

| Finding | Consequence |
|---|---|
| The sim server stores documents in SQLite through synchronous functions (`packages/sim-server/src/repo/*`). CAP runs on Lambda with DynamoDB, and `USE_LOCAL_DB=true` uses a JSON file store (`db/localStore.ts`). | The sim needs an async storage interface with a CAP implementation behind it. SQLite stays only for the sim's own standalone dev server. `better-sqlite3` must never be imported by the backend. |
| `GET /api/assignment-instance` and `GET /api/verify` in the sim return `expectedNetValue` to the caller. | Fine for the standalone PoC, an answer-key leak inside CAP. The public instance must omit it, and verification must return only student-safe messages. |
| `createSession` and `createRetry` always call `acquireSapAccount`, and `runSapVerification` always passes `sapUsername` to `verifySapDocuments(…, ['VA11','VA21','VA01'])`. | These need a branch for simulator activities. The required document list is currently hard-coded. |
| Sessions are deleted at completion, but Parand wants students to revisit finished documents. | Simulator state is keyed by learner key and activity, not by session, and expires on its own timer. |
| The session token (a JWT) already carries `canvasUuid` and `moduleId`, and `authMiddleware` puts them on `req.session`. | Simulator routes derive the learner key and activity from the token. The browser never supplies them. |
| The student app's `GuidedTool` block has a ready slot, `guided-frame`, next to a checklist of instructions with `{param}` placeholders. | The simulator plugs into that slot as another `tool` kind, and the recipe supplies the instructions. |
| The sim's own `ActivityLayout`, intro, background and conclusion blocks duplicate what CAP's recipe does. | Embedded mode shows the screens only. |
| `getSession` strips `canvasUuid` before replying, but `issueSessionToken` puts the same value in the JWT, which the browser holds and can decode. | Not part of this work. Flag it for David's review (the comment in the code says the learner key is never sent to the browser). |

## 4. Contracts (agree and write these first, in the first pull request)

**Status: written as code in PR 1.** The contracts are in `packages/sim-shared/src/contracts.ts` (types, the `SimStore` and `SimApi` interfaces, the route table, the parameter keys), and the build fails if a server-only field leaks into a public type. That file is now the source of truth; the notes below explain the reasoning. Writing it changed the draft in these ways:

- The public instance also omits `seed` (for the random strategy it is built from the learner key) and `studentKey`, not only the expected net values. Public documents omit `studentKey` too.
- Searching by customer reference is scoped to the learner. In the PoC it searched every student's documents.
- The browser no longer sends `assignmentId` when creating a document. The server sets it.
- Events carry `relativeMs` only. The PoC's absolute `occurredAt` does not leave the store.
- Document ids need only be unique within a learner's scope.
- `purge(scope)` is part of `SimStore`, for the retention rule and semester-end cleanup.
- A CAP module resolves to a simulator assignment through `simAssignmentId` in module config and the engine's `SimActivityRegistry` (found in Devin's review). `SimScope.activityId` stays the CAP module id. `requiredDocuments` (document type plus transaction) replaces the hard-coded `['VA11','VA21','VA01']`.
- The parameter keys for recipe placeholders are listed in `SIM_PARAMETER_KEYS`. Parand can use them when she edits the recipe text.
- Register `GET /sim/documents/search-by-reference` before `GET /sim/documents/:id`, or Express reads it as an id.
- `frontend-student` has no `typecheck` script, so the root `npm run typecheck` does not cover it. Add one when PR 4 starts.

Everything below is the original reasoning. Where it differs from the code, the code wins.

**4.1 `SimStore` (types in `packages/sim-shared`, async).** All simulator state goes through it, keyed by `learnerKey` and `activityId`:
- `getOrCreateInstance(learnerKey, activityId)`: the assignment instance, including its expected net values (server side only).
- `listDocuments`, `getDocument`, `searchByReference`, `getDocumentChain`
- `createDocument`, `updateDocument` (the server reprices, as `repriceDocument` does in the PoC)
- `logEvent` (relative timestamps only)

Implementations: the CAP implementation (§5, B1) and an adapter over the existing SQLite repo for the standalone sim server.

**4.2 Public assignment instance** (what the browser may see): identifiers, the per-student parameter values the instructions need, and nothing that reveals a net value.

**4.3 HTTP routes in CAP**, mounted with `authMiddleware` (same as `/session`):

| Route | Purpose |
|---|---|
| `GET /sim/instance` | the public instance |
| `GET /sim/documents`, `GET /sim/documents/:id`, `GET /sim/documents/search-by-reference`, `GET /sim/document-flow/:id` | read |
| `POST /sim/documents`, `PATCH /sim/documents/:id` | create and update, repriced on the server |
| `POST /sim/events` | event log |

The browser supplies none of: learner key, activity, assignment id.

**4.4 Verification result.** `VerificationResult` (in `sapConnector.ts`) keeps `allPresent`, `foundDocs`, `missingTypes` unchanged and gains:

```text
passed: boolean
items: [{ key: string, status: 'ok' | 'missing' | 'mismatch', studentMessage: string }]
```

Student-safe messages, for example: missing: "You have not saved a quotation yet"; owner problem (should not happen): "We could not find this document in your account"; mismatch: "The net value of your order does not match what we expected. Recheck the discounts and the quantity." The expected value never appears, not in messages, logs sent to the browser, or errors.

**4.5 Client seam in `sim-web`.** `api.ts` today has module-level functions that pick the network or local implementation. Replace that with a `SimApi` interface supplied through a React context. The three implementations are network (standalone dev), local (the Amplify demo) and CAP (calls `/sim/*` with the session bearer token).

## 5. Tasks

### Simulator side (Claude, packages `sim-*`)

| # | Task | Files |
|---|---|---|
| S1 | Define `SimStore`; add the activity registry (`SimActivityRegistry`: the assignment plus its required documents, with the transaction mapping) and async `verifyActivity(store, scope, activity)` to the engine, returning §4.4; add `toPublicInstance` and `toRecipeParameters(instance)`; unit tests, including "public instance and messages never contain the expected value". | `sim-shared/src`, `sim-engine/src` |
| S2 | `SimApi` interface and provider; adapt the network and local implementations; pass nothing student-identifying from the browser in CAP mode. | `sim-web/src/api.ts`, `networkApi.ts`, `localApi.ts`, `App.tsx`, activity components |
| S3 | Export `SimWorkspace` from `sim-web`: Easy Access menu, VA11, VA21, VA01, Document Flow in any order, no intro, background or conclusion, no instruction pane of its own. Keep the standalone app working. | `sim-web/src` |
| S4 | **Style-scoping spike, first.** Render `SimWorkspace` inside a CAP page and look for clashes in both directions. The sim's `index.css` is 960 lines of global rules. Result: scope everything under one root class, or fall back to an iframe of the standalone app. Decide before S3 is finished. | `sim-web/src/index.css` |

### CAP backend (Devin, `packages/backend`, `packages/shared`)

| # | Task | Files |
|---|---|---|
| B1 | `db/simDb.ts` implementing `SimStore`: the JSON store for `USE_LOCAL_DB`, and DynamoDB (new table, with TTL). Document the table in `infra/dynamodb.md`; Kent creates it. | `db/simDb.ts`, `db/localStore.ts`, `infra/dynamodb.md` |
| B2 | `routes/sim.ts` per §4.3, mounted in `app.ts` under `authMiddleware`. Key derived from `req.session`. Get-or-create the instance on first write (a student can post a document before any read). 403 when the token has no learner key or module (admin and dev tokens); 404 when the module has no `simAssignmentId`. | `routes/sim.ts`, `app.ts` |
| B3 | `SAP_MODE=sim` in the connector; extend `VerificationResult` per §4.4; `runSapVerification` branches on the activity kind and no longer hard-codes the document list for sim. Decide pass or fail from `passed`, not `allPresent`, or a wrong net value would pass. For a failed sim check, `sapVerificationError` carries the student-safe `items`, so F2 can show them. | `services/sap/sapConnector.ts`, `config/env.ts`, `orchestratorService.ts` |
| B4 | Activity kind per module (`sim` or `live`, defaulting from `SAP_MODE`) plus `simAssignmentId` (which simulator assignment the module uses); in `createSession` and `createRetry` skip the pool for `sim`, and take `parameters` from the simulator instance. A retry keeps the documents (decision in §7). | `orchestratorService.ts`, `db/moduleConfigDb.ts` |
| B5 | Seed a sim version of the Sales recipe: a `guided_tool` block with `tool: 'sap_sim'` and instructions converted from `packages/sim-web/src/content/leadIn.ts` and `docs/sim/lead-in-content.md`. Parand owns the final wording. | seed data in `db/localStore.ts` |
| B6 | Test that no `/sim/*` or `/session/*` response contains an expected net value, and that verification passes and fails correctly. CAP has no test setup, so this includes setting one up (the backend's `jest` script is broken today; use vitest like the other packages). | `packages/backend` |

### CAP student app (Devin, `packages/frontend-student`)

| # | Task | Files |
|---|---|---|
| F1 | In `GuidedTool`, render `SimWorkspace` in the frame slot for `tool: 'sap_sim'`, with the CAP `SimApi` that uses the session token. | `components/wizard/blocks.tsx`, `services/` |
| F2 | Show the verification `items` messages when the check fails. | `components/wizard/ActivityPhase.tsx` |
| F3 | Add `@cap/sim-web` as a dependency; fix any Vite or UI5 configuration needed. | `package.json`, `vite.config.ts` |

## 6. Order of work and pull requests

1. **PR 1: contracts.** The types, the `SimStore` interface, the route table and the result shape, with no behavior. Everyone agrees here before building.
2. **PR 2: sim side** (S1, S2, S4 spike result, then S3). Claude.
3. **PR 3: backend** (B1 to B6). Devin. Can start once PR 1 is merged.
4. **PR 4: student app** (F1 to F3). Devin, after PR 2.
5. **PR 5: walkthrough and fixes.**

Each pull request goes to David for review only where it touches identity or data retention: PR 3 (learner key from the token, TTL, no expected values in responses).

## 7. Decisions needed from Kent (provisional defaults in bold)

1. **Retention of simulator state:** **one semester (120 days), purged at semester end.** Parand wants students to revisit documents, which rules out purging at completion. David should confirm. The state includes document `createdAt` timestamps (SAP shows dates in Document Flow). They are never exported to research or evaluation records, which follows CAP's "no absolute timestamps" rule. Flag this to David.
2. **Retry:** **keep the documents** so a student can fix what was wrong. The alternative is a clean slate.
3. **Where the activity kind lives:** **module config, defaulting from `SAP_MODE`.** The same record holds `simAssignmentId`.
4. **Who converts the instructions into recipe text:** I draft, **Parand edits.**

## 8. Risks

- **Style clashes** between the simulator and CAP (S4). The fallback is an iframe, which costs deep integration with the instructions but is simple.
- **`createSession` is touched by this work and by the LTI work.** Keep the changes in B4 small and merge whichever comes first, then rebase.
- **Lambda bundle size and the UI5 packages** are unmeasured. Check the backend bundle (the engine is small) and the student app build size after F3.
- **Production table not created yet.** Until Kent creates it, the DynamoDB path is untested. Local dev is complete without it.

## 9. Notes for Devin

- Standing instructions: `CLAUDE.md` at the repo root, then `packages/sim-web/CLAUDE.md` and `docs/sim/working-conventions.md` before touching `sim-*`.
- Work on a branch per pull request, off `main`. Do not push to `main`. Commit before you stop.
- Commands: `npm run dev:student`, `npm run dev:sim`, `npm run typecheck`, `npm run test:sim`.
- Do not edit outside the files listed for your tasks without asking. Ask if a contract in §4 looks wrong, and change the document before the code.
- Synthetic data only. No real credentials, no real student data, and never read `.env` files.
