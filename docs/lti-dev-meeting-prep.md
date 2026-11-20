# Canvas dev instance meeting: preparation

**For:** Kent and Aliyah, meeting with Mir Lulic (campus Canvas lead, ATEC) on 2026-11-20. David can read it too. Section 3A was added the morning of the meeting for a new requirement (the student's email address at launch) and reworked after Kent clarified it.
**Basis:** a read of CAP's LTI code on `main` (`packages/backend/src/services/lti/ltiService.ts`, `routes/lti.ts`, `services/grade/gradeService.ts`), the agreed decision in `docs/decisions/2026-10-canvas-lti-atec.md`, and a check of Canvas's public documentation. Revised 2026-11-19. I have not seen the real Canvas instance. Canvas details are from search summaries, not the full documentation, so confirm them with the administrator.

## 1. Goal for the meeting

Leave with a **registered developer key for CAP in the dev course**, **test teacher and student logins** for Kent, Aliyah and David, and a **written list of the values Canvas gives us** (the capture sheet in §5). Everything else is a bonus.

The email requirement (§3A) is a **scoping conversation, not a setting to change today.** Register the CAP key with the **anonymous** privacy level first, so the main goal is not held up. The survey gets its own key later. Raise email in the last ten minutes and leave with Mir's answers and an approval path.

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

**Registering the deployed backend with Canvas Dev is acceptable, with limits.** The launch does not verify signatures, so anyone who finds a public address could forge a launch. But the deployed backend already has a public address and an open demo launchpad (§3B), so registering it with a Canvas **Dev** instance (test students, synthetic data) adds no exposure. Before any **real** student launches through it, the hardening in §7 must be done and the demo launchpad switched off. (Revised 2026-11-20; this paragraph used to say to wait.)

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
10. **For production, does ATEC or IT want a campus domain for LTI tools, and who provisions it?** A tool for students on a personally registered domain may raise ownership questions in review. Settle the production address before the production registration, because assignments in a real course store it. For the dev key, the deployed API Gateway address is enough.

### Settings we hand over

- the login initiation address, the launch address and the target link address
- the **redirect addresses**, which are a separate field in the developer key form, not part of the JSON configuration
- the tool's **public key**, pasted in or as a web address (`public_jwk` or `public_jwk_url`, one is required per the [configuration reference](https://canvas.ou.edu/doc/api/file.lti_dev_key_config.html))
- if grade write-back is in scope now, the AGS scopes (the line item scope and the score scope) and the switch that turns AGS on for the key, per the [assignment tools doc](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.assignment_tools)
- a custom parameter `activity_id` on each placement (for example `sales_process`)

## 3A. New requirement: the student's email address at launch

**What was asked.** The research team wants the student's email at launch, at least the first launch, as part of the informed-consent process. The beginning-of-course survey opens through Canvas, hands off to Qualtrics, and ends by sending the student, with the Canvas pseudonymous ID, to a separate consent survey (research participation, FERPA authorization, optional teaching excerpts, typed name and student ID as the signature). Arash Negahban is the data custodian and the only person who can open the consent project. Instructors see completion only.

**Clarified by Kent on 2026-11-20.**

- The campus treats **name and email as directory information**, not PII.
- The email is **not stored on AWS.** It is passed straight to Qualtrics to identify students under controlled research conditions.
- The **survey launch can be a separate application** from the SAP assignment launch.

**What that changes.**

- **It is a privacy-level change on one developer key, not a CAP redesign.** With a separate application, the SAP key stays `anonymous` and only the survey launcher's key gets a broader level. Canvas documents four values: `anonymous`, `email_only`, `name_only` and `public`; `sub` is always sent ([config reference](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_dev_key_config), [privacy summary](https://community.canvaslms.com/t5/Canvas-Resource-Documents/Privacy-implications-of-installing-an-LTI-1-3-tool-in-Canvas/ta-p/637141)). Sources disagree on details, and one community thread says the key form offered only Public or Private, so ask to see the real form.
- **It still reopens the October agreement with ATEC.** Phase 1 was "no name, email or roster", and Mir called it "cleaner" that CAP never handles student email addresses for badges (`docs/decisions/2026-10-canvas-lti-atec.md`). A separate key for a separate placement is the smaller ask, but he may still need to take it to ATEC or IT.
- **Directory information is not a blank cheque.** Under FERPA a student can opt out of its release. Ask whether Canvas withholds the email for those students.
- **There is no "name plus email" level.** `public` sends more than both (username, and more). The consent form already has the student type their name and ID, so ask the research team whether the name is needed from Canvas at all. If only the email is needed, `email_only` is the smaller release.
- **"Not stored on AWS" is a design rule to hold, not a fact yet.** The email passes through AWS memory during the launch request. It must not reach a database, a token, a redirect address or a log line (check Lambda and API Gateway logging before the first real launch). This is the same rule as in `CLAUDE.md`, applied to directory information as a choice.
- **"First launch only" needs memory, and a launcher that stores nothing has none.** The simplest answer is that the launcher passes the email on every launch and Arash's side handles repeats, since the consent survey is keyed on the pseudonymous ID.
- **The launch must be verified before it is trusted.** Today's launch code does not check signatures (§2). A launcher that relays an unverified email into a consent record would let anyone forge another student's consent identity. The hardening in §7 comes first. Until then, use test students only.

**Plan (my suggestion).** A small separate **survey launcher**, with its own developer key and its own placement:

1. Verify the Canvas launch, using the same verification code as §7.
2. Take the email (and the name only if the research needs it) and the pseudonymous research ID.
3. Hand them to Qualtrics and redirect the student to the survey.
4. Keep nothing: no database, no session, no claims in the logs.

CAP and the SAP key stay anonymous and never see the email. It also gives David a small, separate piece to review.

**How it reaches Qualtrics is a question for Arash.** Two routes: a call from our server to Qualtrics with a credential limited to that purpose (a new secret to protect), or a signed value in the redirect. Do not put the plain email in the redirect address, because it lands in browser history and server logs. I have not checked what Qualtrics supports.

**Fallbacks.** The student types the email in the consent survey, which needs no Canvas change. Or the survey launches through Qualtrics's own Canvas integration, in which case nothing touches AWS.

**Guardrails for any route.** The email is never written to the session record, the session token, a redirect address, a log line, an AI prompt, a research or evaluation record or an instructor view. It is held in memory for the launch request only. It is never pasted into chat with Claude (the license allows synthetic data only). If the student declines consent, the research team does not keep it, which the IRB must confirm. The existing IRB 2024-164 does not cover CAP.

**Later, not for Mir.** The consent survey receives "the Canvas pseudonymous ID". Our rule is that raw `sub` never goes to the browser. The clean choice is a separate research ID: a keyed hash with its own secret, so it matches neither `sub` nor CAP's learner key. Settle that with David and Arash.

### What to ask Mir (after the main questions)

1. Is a broader privacy level acceptable on a **separate developer key and placement** for the survey, with the CAP activities staying `anonymous`? What approval does it need (ITPR, HECVAT, a data-sharing review)? Ask, do not assume.
2. Do students with a FERPA directory-information opt-out get their email withheld in the launch?
3. Exactly which address does Canvas put in the `email` claim (the primary or the campus address)? Can we see one real launch for a **test student** to confirm the claim names?
4. Which values does the key form offer, and what does `public` add beyond `email_only`?
5. How does survey completion reach the Canvas gradebook in this design (tool write-back, Qualtrics, by hand)? That decides whether the launcher also needs grade write-back.
6. Does Canvas show students any notice about data released to a tool?

Open with: "Phase 1 was no email. A research requirement now needs one for informed consent, from a separate survey launcher. We want the smallest change that meets it, and we are not asking you to change anything today."

### Not decided in the room

Who may hold the email, how it reaches Qualtrics, whether the IRB needs an amendment, and the research-ID design belong to Arash, David and the IRB. Write "to confirm with Arash/David/IRB" and move on.

## 3B. Privacy level, keys and addresses: what to say and bring

**Privacy level.** Ask for `anonymous` on CAP's key. Suggested words: "We only need the pseudonymous user ID, so please set the privacy level to anonymous. We'll talk separately about a second key for a survey launcher." Do not raise name or email beyond that today. If asked whether it can change later, ask Mir how a key's settings are edited and by whom. One community thread says the privacy setting could not be reached again after the key was created, so plan on a **new key** for the survey, not on editing this one.

**The tool's key pair.** Canvas's key form asks for the tool's **public** key (`public_jwk`, or `public_jwk_url` if we host it), even though Phase 1 only launches. CAP will use the private half later, to sign grade write-back requests. Generate a throwaway **dev** pair before the meeting. This command writes the private key to `%USERPROFILE%\cap-keys` (outside OneDrive and outside any repository) and prints only the public key. It refuses to overwrite an existing private key, so running it twice cannot silently break a registered key:

```powershell
@'
const { generateKeyPairSync, randomUUID } = require('crypto');
const fs = require('fs'), path = require('path'), os = require('os');
const dir = process.env.CAP_KEYS_DIR || path.join(os.homedir(), 'cap-keys');
const privPath = path.join(dir, 'cap-lti-dev-private.pem');
if (fs.existsSync(privPath)) {
  console.log('A private key already exists at ' + privPath + '. Nothing was changed.');
  console.log('To make a new pair, move that file somewhere safe first.');
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: randomUUID(), alg: 'RS256', use: 'sig' };
fs.writeFileSync(path.join(dir, 'cap-lti-dev-public.jwk.json'), JSON.stringify(jwk, null, 2));
console.log('Private key saved to: ' + privPath + '  (keep it; never share or commit it)');
console.log('Public key saved to:  ' + path.join(dir, 'cap-lti-dev-public.jwk.json'));
console.log('Public key (safe to share):');
console.log(JSON.stringify(jwk, null, 2));
'@ | node -
```

- Give Mir the **public** JSON (the `.jwk.json` file). Never share, paste or commit the private `.pem`, and never paste it into chat with Claude.
- The dev pair is disposable. If it leaks or Mir needs a new one, generate another and have the key's public half replaced.
- **Production needs a different pair**, stored in Secrets Manager (`cap/prod/lti-private-key`, see `infra/secrets.md`), ideally published as a hosted key-set address so it can rotate without re-registering. Do not reuse the dev pair.
- The field names (`public_jwk` / `public_jwk_url`) come from the configuration reference; check them against the real form.

**Addresses.** The LTI addresses belong to the **backend** (API Gateway and Lambda in `infra/lambda.md`), not to Amplify. Amplify hosts only the static student app, and it cannot receive the form POST that Canvas sends at launch. The Amplify address matters only as `FRONTEND_URL`, where the backend sends the student after a launch. **Do not give Mir an Amplify address.** The older `sap-sim` Amplify site is a static demo and cannot take part in LTI at all.

**What the deployed backend does today** (read-only GET requests on 2026-11-20; the address is Kent's and is deliberately not written here):

- It is live, and it also serves the student app at its root.
- `/lti/oidc/login` answers 500 "Invalid URL", because the `LTI_*` settings are not configured on it yet. Login initiation therefore fails closed.
- `/dev/modules` answers 200, so the **demo launchpad is switched on** (`ENABLE_DEV_ROUTES`). Anyone with the address can start a session without logging in. That is by design for the demo (see `routes/dev.ts`), but it must be off before real students.
- `/sim/instance` answers 404, so the deployed build is **older than the simulator work** and needs a redeploy before the simulator runs there.
- `/lti/launch` was not tested. From the code it still accepts an unverified token (§2).

**Recommendation: register the deployed backend for the first key.** It is live and `https`, and the deployment is already an open demo, so registering it with Canvas **Dev** (test students only, synthetic data) adds no exposure. Use these values, with the deployed address in place of the placeholder:

| Canvas field | Value |
|---|---|
| OpenID Connect initiation URL | `https://<backend address>/lti/oidc/login` |
| Redirect URI (launch) | `https://<backend address>/lti/launch` |
| Target link URI | `https://<backend address>/lti/launch` |
| Public key | the public JWK above |
| Custom field | `activity_id=sales_process` |

**Which address is which** (checked against `routes/lti.ts` and the deployed backend on 2026-11-20):

| Address | Canvas field | What happens there |
|---|---|---|
| `https://<backend>/lti/oidc/login` | **OpenID Connect initiation URL** | Step 1 of every launch. Canvas sends the student here with a login hint; the backend redirects them back to Canvas's authorization endpoint. It exists on the deployed backend (it answers, with an error until the `LTI_*` settings are set). |
| `https://<backend>/lti/launch` | **Redirect URI** and **Target link URI** | Step 2. Canvas posts the signed launch token here. The backend creates the session and redirects the student into the app. It accepts **POST only**, so opening it in a browser shows "Cannot GET". That is normal. |
| `https://<backend>/` | None of the Canvas fields | The student app's home. It is where the backend sends the student after launch (`FRONTEND_URL`). Do not give Mir this one. |

**Known gap: the login route accepts GET only.** `GET /lti/oidc/login` is the only method the code handles, and a POST to the deployed address answers 404. The LTI standard lets a platform send the login request either way, and Canvas is reported to send a POST, so a real launch may fail at the first step. Registration does not depend on this. Add it to Aliyah's hardening list (§7): accept both methods and read the parameters from the request body as well as the query. Ask Mir whether the dev instance sends GET or POST, if he knows.

**Before any real student launches through it:**

1. Turn the demo launchpad off (`ENABLE_DEV_ROUTES` unset, `NODE_ENV=production`).
2. Finish the launch verification in §7.
3. Replace `?token=` in the redirect.
4. Redeploy the current `main`, so the simulator routes exist.

**After Mir gives you the values,** set these on the backend and redeploy: `LTI_PLATFORM_URL`, `LTI_CLIENT_ID`, `LTI_DEPLOYMENT_ID`, `LTI_PLATFORM_JWKS_URL`, `LTI_OIDC_AUTH_URL`, and `LTI_REDIRECT_URI` (the launch address above). Until they are set, a Canvas launch will fail at login.

- **Local testing for Aliyah.** A key has one initiation address, so launching from Canvas against `localhost` needs a second key or an edit to this one. Ask Mir which is easier. If Canvas insists on `https` for localhost, a short-lived tunnel works, but the local backend serves `/dev/launch` with no login, so use it briefly with synthetic data only.
- **A custom domain is better than the raw API Gateway address** if the stack is ever rebuilt, and the UCC framing request needs a stable address too. Decide that before the production registration.
- Ask Mir **how addresses on a key get edited later** and who can do it.
- Canvas will give back a **client ID** and **deployment ID**. They go in `.env` or the backend's settings only, never in chat or in the repository.

## 4. Decisions to bring up (from the ATEC note)

1. Grade write-back: AGS or a narrowly scoped Canvas API. Open. Kent proposed AGS, and ATEC has more experience with the API route.
2. One tool registration or one per course, and who creates the placements.
3. What has to pass formal review (ITPR, HECVAT) before real students launch it.
4. Student email at launch (§3A): a separate survey launcher with its own key, or a fallback. Decide after Arash, David and the IRB weigh in.

## 5. Capture sheet (for Aliyah's notes)

Fill this in during the meeting. **Do not write or paste private keys, client secrets or passwords here, in chat, or in the repository.** The client ID, deployment ID and Canvas Dev addresses are not secrets, but under the license terms they go only into `.env` or the backend settings, never into chat with Claude. Write them in your own private copy and use placeholders in anything you send on.

```text
Canvas environment (production / test / beta): ____
Issuer: ____
Authorization (login) endpoint: ____
Key set (JWKS) address: ____
Token endpoint: ____
Client ID: ____
Deployment ID: ____
Privacy level set to: ____   Values the key form offers: ____
Email request (section 3A):
  Separate key and placement for the survey OK: ____
  Directory-information opt-out withheld from launch: ____
  Survey completion reaches gradebook via: ____
  Email in the claim is the primary or the campus address: ____
  Approval path for releasing email: ____
  Real launch payload seen for a test student (claim names only): ____
Placement chosen: ____   Opens in new tab? ____
Redirect addresses accepted (localhost OK?): ____
How addresses on a key get edited later, and by whom: ____
Login initiation sent as GET or POST (if known): ____
Campus domain wanted for production LTI tools, and who provisions it: ____
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

**Roles:** Kent leads on decisions and priorities. Aliyah takes the notes on the capture sheet. After the meeting, send the notes to Claude, who updates this document, turns the answers into configuration notes and writes the hardening tasks. **Before sending, replace the client ID, the deployment ID and every Canvas Dev address with a placeholder** such as `<client id>`. Under the license terms those values go straight into `.env` or the backend settings and are never pasted to Claude. Never include passwords, keys or real student data.

## 7. After the meeting: a bounded job for Aliyah

This is a clean subsystem for Aliyah, because it touches only a few files. The work, in order:

0. Let the login initiation accept **POST** as well as GET, reading `login_hint`, `lti_message_hint` and the rest from the body as well as the query (§3B). Without it a Canvas launch may fail at the first step.
1. Replace the unverified token decode with real verification against Canvas's published keys, including state, nonce and the claim checks.
2. Replace `?token=` in the redirect with a safer hand-off.
3. Host the tool's public keys.
4. Implement the AGS token fetch and the score post (to `<line item>/scores`), with retries.
5. Test against the dev course.

It touches identity, so **David reviews it** (pull request, as discussed). Nothing here needs the simulator, so it can run in parallel with the simulator integration. `createSession` is shared with work package 1, so keep any change there small and merge in order.
