# Canvas dev instance meeting: preparation

**For:** Kent and Aliyah, meeting with the Canvas administrator on 2026-11-20. David can read it too.
**Basis:** a read of CAP's LTI code on `main` (`packages/backend/src/services/lti/ltiService.ts`, `routes/lti.ts`, `services/grade/gradeService.ts`), the agreed decision in `docs/decisions/2026-10-canvas-lti-atec.md`, and a check of Canvas's public documentation. Revised 2026-11-18. I have not seen the real Canvas instance. Canvas details are from search summaries, not the full documentation, so confirm them with the administrator.

## 1. Goal for the meeting

Leave with a **registered developer key for CAP in the dev course**, **test teacher and student logins** for Kent, Aliyah and David, and a **written list of the values Canvas gives us** (the capture sheet in §5). Everything else is a bonus.

## 2. Where CAP's LTI code actually stands

It is a working outline, not a secure implementation. It must not be reachable by real students in this state.

| Area | State today |
|---|---|
| Login initiation (`GET /lti/oidc/login`) | Redirects to Canvas correctly, but `state` and `nonce` are the literal placeholders `TODO_generate_state` and `TODO_generate_nonce`. No replay protection. |
| Launch (`POST /lti/launch`) | **Decodes the token without verifying its signature.** No Canvas keys are fetched, and `iss`, `aud`, `exp`, `nonce` and `deployment_id` are not checked. Anyone who can post to this URL could forge a launch. |
| What it reads | `iss` + `sub` (hashed into the learner key), context id, resource link id, the grade-service address, `lis` result id, and the custom parameter `activity_id` (falls back to the older `module_id`). No name, email or roster. This matches the Phase 1 decision. |
| Hand-off to the app | Redirects the browser to `/launch?token=<session token>`, which puts the token in the address bar, browser history and logs. Should change. |
| Configuration | One platform only, via environment variables (`LTI_OIDC_AUTH_URL`, `LTI_CLIENT_ID`, `LTI_REDIRECT_URI`). No registry of platforms or deployments. |
| Grade write-back | A stub. The Canvas token fetch is a TODO. The score is posted to the line item address itself; AGS expects `<line item>/scores` with the score content type `application/vnd.ims.lis.v1.score+json`. |
| Tool's own keys | Not present. Grade write-back needs CAP to hold a key pair, and Canvas needs the public half in the key's configuration (pasted in, or as a web address CAP hosts). |

**Do not register against the deployed backend yet.** Because the launch does not verify signatures, registering a real Canvas key against a public address would let someone forge launches. For the first test, use `localhost` if Canvas allows it, or a temporary tunnel address. Register the real address once the hardening in §7 is done.

## 3. What to ask the administrator

### Questions, in order of importance

1. **Which Canvas environment is the dev course in** (production, test or beta)? Instructure-hosted Canvas has separate environments, and the issuer and endpoint addresses differ between them. Every value below belongs to one environment.
2. **What are its issuer, login (authorization), key set and token addresses?** Ask for them from this administrator's own developer key page. For cloud-hosted Canvas the endpoints have moved to `sso.canvaslms.com` (with `sso.test` and `sso.beta` equivalents) while the issuer is still `https://canvas.instructure.com`, but older guides list other addresses. See Instructure's [launch overview](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_launch_overview) and this [community thread](https://community.canvaslms.com/t5/Developers-Group/How-to-determine-LTI-1-3-login-oauth-authorize-jwks-URLs/td-p/444286).
3. **Can you register CAP as a developer key** with our addresses and the **anonymous** privacy level? The setting is called `privacy_level`. A community answer says "public" makes Canvas send name and email in the launch ([thread](https://community.canvaslms.com/t5/Canvas-Developers-Group/Regarding-LTI-1-3-Developer-Key-Configuration/m-p/563064)), and the ATEC decision says no name or email. Confirm the exact allowed values and ask to see the key's settings page afterward.
4. **Which placement should we use,** given the activity is a graded assignment, and **can it open in a new tab or window?** Canvas calls the setting `windowTarget` (if it is available for the placement). CAP is a full-page wizard and the SAP window has to sit beside it.
5. **Does the launch include the line item address** when the assignment is a graded external tool? Our code reads it, so we need to see one real launch.
6. **What are the client ID and deployment ID,** and does one registration cover several courses?
7. **Which test accounts do we get?** A teacher and a student each, for Kent, Aliyah and David. Test students only, no real student data.
8. **Does Canvas accept `http://localhost` as a redirect address** for the dev key? If not, what `https` address should we use?
9. **What is the path from dev to test to production, and who approves it** (ITPR, HECVAT)?

### Settings we hand over

- the login initiation address, the launch address and the target link address
- the **redirect addresses**, which are a separate field in the developer key form, not part of the JSON configuration
- the tool's **public key**, pasted in or as a web address (`public_jwk` or `public_jwk_url`, one is required per the [configuration reference](https://canvas.ou.edu/doc/api/file.lti_dev_key_config.html))
- if grade write-back is in scope now, the AGS scopes (the line item scope and the score scope) and the switch that turns AGS on for the key, per the [assignment tools doc](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.assignment_tools)
- a custom parameter `activity_id` on each placement (for example `sales_process`)

## 4. Decisions to bring up (from the ATEC note)

1. Grade write-back: AGS or a narrowly scoped Canvas API. Open. Kent proposed AGS, and ATEC has more experience with the API route.
2. One tool registration or one per course, and who creates the placements.
3. What has to pass formal review (ITPR, HECVAT) before real students launch it.

## 5. Capture sheet (for Aliyah's notes)

Fill this in during the meeting. **Do not write or paste private keys or client secrets here, in chat, or in the repository.**

```text
Canvas environment (production / test / beta): ____
Issuer: ____
Authorization (login) endpoint: ____
Key set (JWKS) address: ____
Token endpoint: ____
Client ID: ____
Deployment ID: ____
Privacy level set to: ____
Placement chosen: ____   Opens in new tab? ____
Redirect addresses accepted (localhost OK?): ____
Test accounts provided (teacher / student / for whom): ____
Dev course name and where the assignments are: ____
Who registers production, and approval needed: ____
Follow-ups and who owns them: ____
```

## 6. If the administrator cannot answer something

- Ask them to **export or screenshot the developer key's settings page** once it exists. It holds most of the values and no secrets.
- Ask who at ATEC owns the question, and agree a follow-up date.
- Do not improvise credentials, and do not agree to anything that needs real student data.
- Write "unknown" and move on. A missing answer is fine; a wrong one costs days.

**Roles:** Kent leads on decisions and priorities. Aliyah takes the notes on the capture sheet. After the meeting, send the notes (no secrets) to Claude, who updates this document, turns the answers into configuration notes and writes the hardening tasks.

## 7. After the meeting: a bounded job for Aliyah

This is a clean subsystem for Aliyah, because it touches only a few files. The work, in order:

1. Replace the unverified token decode with real verification against Canvas's published keys, including state, nonce and the claim checks.
2. Replace `?token=` in the redirect with a safer hand-off.
3. Host the tool's public keys.
4. Implement the AGS token fetch and the score post (to `<line item>/scores`), with retries.
5. Test against the dev course.

It touches identity, so **David reviews it** (pull request, as discussed). Nothing here needs the simulator, so it can run in parallel with the simulator integration. `createSession` is shared with work package 1, so keep any change there small and merge in order.
