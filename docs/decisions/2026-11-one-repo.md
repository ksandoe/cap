# Decision: one repository, with the SAP simulator merged into CAP

**Date:** 2026-11-15
**Status:** Proposed. Drafted by Claude from Kent's direction ("I do not want two repos for the project"). Kent has not yet confirmed the details below, and David has not reviewed them.
**Moves to:** `cap/docs/decisions/` when the merge happens.

## What is proposed

1. **One repository.** The sap-sim PoC is merged into the CAP monorepo, keeping its git history. The PoC repo is archived afterwards with a pointer to the new location, not deleted.
2. **One trunk first.** Before the merge, `main` is fast-forwarded to `redesign-v2`. `redesign-v2` is 38 commits ahead of `main` and `main` has nothing new, so this changes no code. The PR flow and CI need one clear default branch.
3. **Package layout.** The four sim packages move under `packages/` with a `sim-` prefix, to avoid the clash with CAP's own `packages/shared`:

   | Now (sap-sim) | After the merge |
   |---|---|
   | `apps/web` (`@sap-sim/web`) | `packages/sim-web` (`@cap/sim-web`) |
   | `packages/engine` (`@sap-sim/engine`) | `packages/sim-engine` (`@cap/sim-engine`) |
   | `packages/shared` (`@sap-sim/shared`) | `packages/sim-shared` (`@cap/sim-shared`) |
   | `packages/server` (`@sap-sim/server`) | `packages/sim-server` (`@cap/sim-server`), kept for local development only, then retired |

4. **Integration shape (replaces option A in `cap-integration-design.md` §3).** With one repo, the simulator's engine is a package that CAP's backend imports. Documents, events and verification live in CAP's own store, behind CAP's own auth. There is no separate sim deployment and no signed launch token between two services. The simulator's screens are either:
   - a component inside the CAP student app (preferred, because instruction steps can then react to what the student does), or
   - an iframe of `sim-web`, if scoping the simulator's styles into the student app proves too painful.

   A short spike decides between the two before any integration work depends on it.
5. **Two-developer practice.** Changes go through pull requests with one review. CI runs typecheck and build on every PR. A `CONTRIBUTING.md` and `CODEOWNERS` are added. Details in `docs/merge-plan.md`.

## Why

- The team judged the PoC a success, so the reason for keeping it separate (it was an experiment) is gone.
- Two repos would mean two sets of rules for agents, two review flows and a version-skew problem for the shared document and verification types.
- The stacks already match (React 18, Vite 5, TypeScript 5, vitest 1, Express 4, npm workspaces), so the merge is mostly additive.
- The sim's screens can only react to what the student does if they share a React app with the instructions. That is Kent's stated priority.

## Alternatives rejected

- **Two repos joined over HTTP** (the design doc's option A). It was the right call while the repos were separate. It adds a second deployment and datastore, a token between services and cross-origin iframe handling, with no gain once the repos are one.
- **A git submodule or published packages.** This keeps two repos and two review flows, which is what we are trying to end.
- **Copying the files in without history.** The 16 sim commits record the fidelity review against real SAP. They are worth keeping.
- **Rewriting the simulator inside `frontend-student`.** It would discard working, reviewed code and mix two codebases' conventions in one package.

## Risks and open items

- **Style clashes.** The sim's `index.css` is global and uses UI5 web components. CAP's student app uses plain CSS (`index.css`, `react-router-dom`, `zustand`). Scoping the sim's styles is the main technical unknown.
- **The Amplify demo.** The PoC demo's Amplify app is connected to the sap-sim repo, so this merge does not touch it. It keeps building from the old repo until that repo is archived, and archiving freezes it. Before archiving, repoint the demo at the CAP repo with `appRoot: packages/sim-web` and the build `VITE_LOCAL_STORAGE_MODE=true npm run build:sim`, in the Amplify console. CAP has no root `amplify.yml` today (`infra/amplify.md` describes one but it was never added), so the merge does not add one: a root file with an `applications:` list could change how the two existing CAP apps build.
- **CAP's installs now include the sim packages.** CAP's Amplify builds run `npm install` at the repo root, which now also installs the sim's dependencies. The one risky package is `better-sqlite3` (a native module, used only by the local-dev `sim-server`). It is declared as an optional dependency so a failed native build does not fail CAP's builds. Watch the first Amplify build of the CAP apps after the merge reaches `main`.
- **Tests.** CAP has no working tests (no test files, and the backend's `jest` is not installed). The sim's nine engine tests become the only ones. Writing real tests is a work item, not part of the merge.
- **Release cadence.** The sim's code now ships on CAP's cadence. That is acceptable at this stage; revisit if the sim gains outside users.
- **Not yet reviewed by David** (hosting, identity, security).
