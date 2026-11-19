# Canvas dev instance meeting: preparation

**For:** Kent and Aliyah, meeting with the Canvas administrator on 2026-11-20.
**Basis:** a read of CAP's LTI code on `main` (`packages/backend/src/services/lti/ltiService.ts`, `routes/lti.ts`, `services/grade/gradeService.ts`) and the agreed decision in `cap/docs/decisions/2026-10-canvas-lti-atec.md`. Draft, 2026-11-18. I have not seen Canvas, and Canvas-specific details below are marked where I am unsure.

## 1. Where CAP's LTI code actually stands

It is a working outline, not a secure implementation. It must not be reachable by real students in this state.

| Area | State today |
|---|---|
| Login initiation (`GET /lti/oidc/login`) | Redirects to Canvas correctly, but `state` and `nonce` are the literal placeholders `TODO_generate_state` and `TODO_generate_nonce`. No replay protection. |
| Launch (`POST /lti/launch`) | **Decodes the token without verifying its signature.** No Canvas keys are fetched, and `iss`, `aud`, `exp`, `nonce` and `deployment_id` are not checked. Anyone who can post to this URL could forge a launch. |
| What it reads | `iss` + `sub` (hashed into the learner key), context id, resource link id, the grade-service address, `lis` result id, and the custom parameter `activity_id` (falls back to the older `module_id`). No name, email or roster. This matches the Phase 1 decision. |
| Hand-off to the app | Redirects the browser to `/launch?token=<session token>`, which puts the token in the address bar, browser history and logs. Should change. |
| Configuration | One platform only, via environment variables (`LTI_OIDC_AUTH_URL`, `LTI_CLIENT_ID`, `LTI_REDIRECT_URI`). No registry of platforms or deployments. |
| Grade write-back | A stub. The Canvas token fetch is a TODO. The score is posted to the line item address itself; I believe AGS needs `<line item>/scores` and the content type `application/vnd.ims.lis.v1.score+json`. Worth checking against the spec. |
| Tool's own keys | Not present. Grade write-back needs CAP to hold a key pair and publish the public half at a web address (a JWKS endpoint). Canvas also needs that address when the tool is registered. |

## 2. What to ask the administrator for

**To register CAP as a tool (a "developer key" in Canvas) we give them:**
- the login initiation URL, the launch (redirect) URL and the target link URL
- a public key set address (this means we must host a JWKS endpoint soon, or use a public key pasted in for the first test)
- the scopes, if grade write-back is in scope already (Phase 2)
- the privacy level: the ATEC decision says no name or email, so ask for the setting Canvas calls **anonymous**, and confirm `sub` is still sent

**They give us back:** the client ID, the deployment ID, Canvas's issuer value, and the addresses for its login (authorization), its public keys and its token endpoint. Please ask for these in writing and do not assume them: the values differ between Canvas environments.

**Placement and launch behavior:**
- Which placement: I would suggest an assignment placement, so the activity is graded and points possible is 1 (all or nothing).
- **Open in a new tab or window, not inside a Canvas frame.** CAP is a full-page wizard, and the SAP window needs to sit beside it. Our test also showed that SAP's framing protection looks at the page around it, so keeping Canvas out of the chain helps. Ask if the placement can be set to launch in a new tab.
- A custom parameter `activity_id` on each placement (for example `sales_process`), set by whoever creates the link.

**Environment and people:**
- A dev course with test accounts for a teacher and a student (Kent, David and Aliyah, per ATEC's earlier commitment), and **test students only, no real student data**.
- Which Canvas environment is the dev one, and how a registration later moves to test and production (ATEC installs and registers).
- Will Canvas accept `http://localhost` as a redirect address for development? If not, we need an `https` dev address. I am unsure; please ask.

## 3. Decisions to bring up (from the ATEC note)

1. Grade write-back: AGS or a narrowly scoped Canvas API. Open. Kent proposed AGS, and ATEC has more experience with the API route.
2. One tool registration or one per course, and who creates the placements.
3. What has to pass formal review (ITPR, HECVAT) before real students launch it.

## 4. Homework before the meeting

- Choose the dev address for CAP that we will register. Stable and `https` is best.
- List the `activity_id` values (for example `sales_process`, and later the others).
- Decide who holds the tool's private key. It is a secret, so it never goes into the repository or into chat.
- Aliyah: read the ATEC decision note and the LTI section of `CLAUDE.md`, so questions come from both of you.

## 5. After the meeting: a good bounded job

This is a clean subsystem for Aliyah, because it touches only a few files. The work, in order:

1. Replace the unverified token decode with real verification against Canvas's published keys, including state, nonce and the claim checks.
2. Replace `?token=` in the redirect with a safer hand-off.
3. Host the tool's public keys.
4. Implement the AGS token fetch and the score post, with retries.
5. Test against the dev course.

It touches identity, so **David reviews it** (pull request, as discussed). Nothing here needs the simulator, so it can run in parallel with the simulator integration.
