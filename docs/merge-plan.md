# Merge plan: sap-sim into the CAP repository

**Status:** draft for Kent, 2026-11-15. Implements `docs/decisions/2026-11-one-repo.md`, which is still only proposed. Nothing in `../cap` has been changed.

The merge is one pull request containing only the move, so it is easy to review and easy to revert. No feature work rides along.

## Before the merge (gates)

| # | Gate | Who |
|---|---|---|
| 1 | Devin commits the seven check-in files and pushes `redesign-v2` | Devin, on Kent's go-ahead |
| 2 | Fast-forward `main` to `redesign-v2` so there is one trunk | Kent decides; either of us can run it |
| 3 | Kent and David confirm the decision note | Kent, David |
| 4 | Pause other work on `redesign-v2` for the length of the merge PR | Kent tells Devin |

## The merge itself

Work on a new branch off `redesign-v2`, for example `merge-sim`.

1. **Import with history.** Bring the sap-sim history into the CAP repo under the new paths. `git subtree add` is the simplest route. If the path layout needs rewriting first, `git filter-repo` in a throwaway clone of sap-sim does it before the import. Check afterwards that `git log -- packages/sim-engine` shows the original commits.
2. **Move into the new layout** (table in the decision note): `apps/web` to `packages/sim-web`, and the other three to `packages/sim-engine`, `packages/sim-shared` and `packages/sim-server`.
3. **Rename the packages and imports.** `@sap-sim/*` becomes `@cap/sim-*` in every `package.json` and every import. Check `apps/web` for aliases in `vite.config.ts` and `tsconfig.json`.
4. **Root `package.json`.** Add the four packages to `workspaces`. Add scripts such as `dev:sim`, `build:sim` and `test:sim` that mirror the existing `dev:student` style. Keep `npm run test` working across workspaces.
5. **One lockfile.** Delete the sim's `package-lock.json` and regenerate the root one. Look for version drift: both repos pin React 18, Vite 5 and TypeScript 5, so I expect only minor differences.
6. **Instructions for agents.** Keep CAP's root `CLAUDE.md`. Put the sim's `CLAUDE.md` content in `packages/sim-web/CLAUDE.md` (a nested file, read when working in that folder), and add a short pointer from the root. The constraints section (synthetic data only, no real SAP, no answer keys near student-facing AI) is already CAP's too, so merge duplicates instead of repeating them.
7. **Docs.** Move `docs/` into `cap/docs/sim/`. `cap-integration-design.md` goes to the top level of `cap/docs/`. Decision notes go to `cap/docs/decisions/`. Move the reference PDF, and check that it is fine to commit.
8. **Amplify.** The demo's Amplify app is connected to the sap-sim repo, so the merge does not affect it. CAP has no root `amplify.yml`, so none is added (it could change how the existing CAP apps build). The demo is repointed in the Amplify console after the merge: new source repo CAP, `appRoot: packages/sim-web`, build `VITE_LOCAL_STORAGE_MODE=true npm run build:sim`, output `dist`. Do that before archiving the old repo. Also make `better-sqlite3` an optional dependency of `sim-server`, so CAP's root `npm install` on Amplify cannot fail on a native build. Then watch the first CAP Amplify build after the merge reaches `main`.
9. **Verify.** From a clean checkout: install, typecheck all workspaces, build all, run the nine engine tests, start `dev:sim` and walk the Sales activity once, start `dev:student` and `dev:admin` and confirm CAP still loads.
10. **Open the PR.** Review focuses on the diff outside the moved folders: root `package.json`, lockfile, `CLAUDE.md`, `amplify.yml`.

## After the merge

- Archive the sap-sim repo on GitHub, with a README pointing to the new location.
- Copy the notes that matter from my sap-sim memory into the repo (they are keyed to the old folder): the icon-source reference, the fidelity-review workflow and the deployment state.
- Start future sim sessions from the CAP repo folder.

## Two-developer setup (separate small PRs, after the merge)

1. **CI** on every pull request: install, typecheck and build. Add tests when there are any beyond the sim's nine. A GitHub Actions workflow in `.github/workflows/`.
2. **Branch protection** on `main`: PR required, one approval, CI must pass.
3. **`CONTRIBUTING.md`**: setup, branch naming, what a good PR looks like, the data rules (synthetic data only, no secrets).
4. **`CODEOWNERS`**: who reviews which package.
5. **Tests:** a work item to give CAP a real test setup (the backend's `jest` script is currently broken), seeded from the sim's engine tests.
6. **Aliyah:** her Claude license is requested separately. Update the "students can't use Claude" line in `CLAUDE.md` once it is approved. The sim's data-driven configs are a low-risk first area for her to work in.

## What I would not do

- Rewrite history in the CAP repo.
- Delete the PoC repo or its Amplify app before the merged build is verified.
- Bundle any integration work (the token, `SAP_MODE=sim`, the phase refactor) into the merge PR.
