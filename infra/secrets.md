# Secrets Manager: moving the sensitive settings out of the function's environment

**Status:** the code is built and tested; it is **off until the function has `APP_SECRETS_ID`**. Nothing changes on a deployed function until you do the steps below. See `lambda.md` for how settings work today, and `access.md` for who can see what.

## Why
Plain environment variables can be read by anyone who can open the function in the console or run `aws lambda get-function-configuration`, including Devin's commands. A Secrets Manager secret has its own access control, every read is logged (CloudTrail), the values never appear in the function's configuration, and a deploy command can no longer wipe them. A private key (the Canvas grade-return key, work package 6 task B4) also may not fit in an environment variable: all of a function's variables together are limited to 4 KB.

## Two secrets, split by who may read them
One secret is one permission boundary: whoever can read any of it reads all of it. So the values are split by audience.

| Secret | Holds | Who can read it |
|---|---|---|
| **`cap/prod/app`** (the runtime secrets) | `SESSION_JWT_SECRET`, `LEARNER_KEY_SECRET`, `ADMIN_PASSKEY`, `OPENAI_API_KEY`, `SAP_CLIENT_SECRET`, `DATABASE_URL` (only if it holds a password) | The function's role, and Kent and Devin. **Nobody else.** |
| **`cap/lti-dev`** (the Canvas key) | `LTI_PRIVATE_KEY`: the tool's **private key for the dev Canvas instance** (a PEM, multi-line), for grade return | The function's role, and **Aliyah** (read-only), because she builds the grade-return code |

- Production Canvas will get its own key pair and its own deployment, so its key will be a separate secret (for example `cap/lti-prod`) that Aliyah does not read.
- The function names both: `APP_SECRETS_ID` = `cap/prod/app,cap/lti-dev` (comma-separated, names or ARNs).
- **Not in any secret:** table names, mode switches, retention days, the Canvas IDs and addresses. They are not secrets, and being able to see and change them in the console is useful. (`APP_SECRETS_ID` itself is a normal variable.)
- `SESSION_JWT_SECRET` rotating signs everyone out. **Never change `LEARNER_KEY_SECRET` once real students have launched.**

## The rules the loader follows
- Only these names are accepted from a secret: `SESSION_JWT_SECRET`, `LEARNER_KEY_SECRET`, `ADMIN_PASSKEY`, `OPENAI_API_KEY`, `SAP_CLIENT_SECRET`, `DATABASE_URL`, `LTI_PRIVATE_KEY`. Anything else is ignored and named in a log line, so a secret can never switch on `USE_LOCAL_DB` or repoint a table.
- **A name may be in only one secret.** The same name in two is applied from neither, and logged naming both, so it is never unclear which value is used.
- A variable already set on the function wins over a secret, so you can move values one at a time. A stale one is reported by name.
- **A broken secret does not stop the app, unless the app cannot start safely without it.** A secret that cannot be read, is not text, is not valid JSON or is not an object is skipped. A single value that is not a non-empty text value (a key stored as a nested object, a `null`, an empty string) is skipped on its own, and the rest of its secret still applies. A name found in two secrets is applied from neither. Each is logged as `[secrets] ERROR: ...`, naming the secret or setting and the problem.
- **The exception is the two settings a deployed function must have:** `SESSION_JWT_SECRET` and `LEARNER_KEY_SECRET` (they have public defaults in the source, so they must never be missing). If either is still missing from the function's environment after loading, requests fail with an error naming it, until it is fixed. The next request tries again, so no redeploy is needed. Everything else (`LTI_PRIVATE_KEY`, `OPENAI_API_KEY`, `ADMIN_PASSKEY`, `SAP_CLIENT_SECRET`, `DATABASE_URL`) has no public default and fails clearly where it is used, so a problem there never takes the site down.
- **A skipped secret is fixed by a new function instance.** After correcting a secret that was skipped, make any harmless configuration change to the function (edit a non-secret variable) so new instances read it.
- Only names are logged, never values, and AWS's own error text is never echoed.

## One-time setup (Kent or an AWS admin; about 20 minutes)
1. **Create `cap/prod/app`.** AWS console, Secrets Manager, Store a new secret, "Other type of secret", Key/value, **Plaintext** tab, and paste this JSON with the real values (never in chat or the repository):
   ```json
   {
     "SESSION_JWT_SECRET": "<a long random value>",
     "LEARNER_KEY_SECRET": "<EXACTLY the value the function uses today: do not generate a new one>",
     "ADMIN_PASSKEY": "<the team passkey>",
     "OPENAI_API_KEY": "<the key>"
   }
   ```
   No rotation; the default encryption key is fine.
2. **Create `cap/lti-dev`** with the dev private key. Build the JSON without ever displaying the key, in your own PowerShell, and paste the clipboard into the Plaintext tab:
   ```powershell
   $ErrorActionPreference = 'Stop'
   $pem = [System.IO.File]::ReadAllText("$env:USERPROFILE\cap-keys\cap-lti-dev-private.pem")
   if ($pem -notmatch 'BEGIN .*PRIVATE KEY') { throw 'The key file is empty or is not a PEM private key.' }
   @{ LTI_PRIVATE_KEY = $pem } | ConvertTo-Json -Compress | Set-Clipboard
   "Copied $($pem.Length) characters to the clipboard."
   ```
   Use exactly this. **Do not use `Get-Content -Raw`:** in Windows PowerShell 5.1 it returns a string with hidden extra properties, and `ConvertTo-Json` then writes the key as an object, `{"LTI_PRIVATE_KEY": {"value": "...", "PSPath": ...}}`, instead of as text. The loader refuses that, and (before the loader tolerated a bad optional secret) it stopped the function answering requests. `[System.IO.File]::ReadAllText` returns a plain string, and the `if` line makes the snippet stop with an error rather than produce an empty value if the file is missing. PEM line breaks must be written out in JSON; `ConvertTo-Json` does that. Clear the clipboard afterwards.
   **Check what was stored:** in Secrets Manager, open the secret, Retrieve secret value, Plaintext. It must read `{"LTI_PRIVATE_KEY":"-----BEGIN PRIVATE KEY-----\n...` with the text **directly after the colon**. A second `{` after the colon means the wrong snippet was used. Do not copy or share the value.
3. **Let the function read both.** Lambda console, the function, Configuration, Permissions, click the execution role, Add permissions, Create inline policy, JSON (replace `<ACCOUNT_ID>`; the `-??????` matches the six random characters AWS adds to a secret's ARN):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ReadCapSecrets",
         "Effect": "Allow",
         "Action": "secretsmanager:GetSecretValue",
         "Resource": [
           "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:cap/prod/app-??????",
           "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:cap/lti-dev-??????"
         ]
       }
     ]
   }
   ```
   If a secret uses a customer-managed encryption key instead of the default, the reader also needs `kms:Decrypt` on that key.
4. **Point the function at them.** Lambda console, Configuration, Environment variables, Edit, add `APP_SECRETS_ID` = `cap/prod/app,cap/lti-dev` (Edit, never the `--environment` command, which replaces every variable). Then ask Devin to redeploy (`update-function-code` only).
5. **Check the first start.** CloudWatch shows `[secrets] from "cap/prod/app": ...` and `[secrets] from "cap/lti-dev": LTI_PRIVATE_KEY`, plus, while the old variables still exist, a warning that those variables win. **Look for `[secrets] ERROR:` lines.** Each names the secret or setting that is wrong. `Could not read the secret "..." (AccessDeniedException)` means the permission in step 3 is wrong; `... is not a non-empty text value` means a value was stored as something other than text (see the Canvas-key snippet in step 2). A broken Canvas-key secret is logged and skipped and the site keeps working. If a **required** secret (session or learner-key) cannot be loaded and the environment does not hold it, requests fail with an error naming it until it is fixed, and the next request retries without a redeploy.

## Moving the values, one at a time
Delete one sensitive variable from the function (Environment variables, Edit), then test. The log line moves that name from "also set as environment variables" to "from ...". Suggested order, easiest to check first:
1. `OPENAI_API_KEY`: test a check-in or conversation.
2. `ADMIN_PASSKEY`: sign in to the admin app.
3. `SESSION_JWT_SECRET`: everyone is signed out (harmless now); launch from Canvas again.
4. `LEARNER_KEY_SECRET` last: relaunch as the same Canvas test user and confirm the saved session still resumes. A fresh, empty session means the value in the secret differs from the old one: put the variable back and fix the secret.

When none of the sensitive names are left as variables, `aws lambda get-function-configuration --query "Environment.Variables | keys(@)"` shows only non-secret names.

## For a developer: using the Canvas key locally (Aliyah)
Her own sign-in can read **only** `cap/lti-dev` (policy in `access.md`). The key goes into memory and never into a file:
1. Sign in with her own AWS profile (for example `aws sso login --profile <her profile>`, or her IAM user's keys in her own AWS config, never in the repository).
2. In her own `.env` (never committed): `APP_SECRETS_ID=cap/lti-dev`, with `USE_LOCAL_DB=true` as usual.
3. Start the app as usual (`npm run dev`). The log shows `[secrets] from "cap/lti-dev": LTI_PRIVATE_KEY`, and the code reads `process.env.LTI_PRIVATE_KEY`. Everything else (the session secret, the passkey) stays the local development defaults, which a deployed function never accepts.
She cannot read, and the loader never requests, `cap/prod/app`.

## Changing or rotating later
- Edit a secret's value in the console. A running function keeps the old value until a new instance starts. To make every instance reload, make any harmless configuration change to the function (edit a non-secret variable). New instances read the secrets.
- Replacing the Canvas key means a new key pair: Mir updates the public key on the dev developer key in Canvas, then update `cap/lti-dev`.

## Rolling back
Put the values back as environment variables (they win over a secret), then remove `APP_SECRETS_ID`. With it unset the loader is off and the function behaves as before this feature existed.

## Cost
About $0.40 a month per secret (so about $0.80 for two), plus a few cents per 10,000 reads. The function reads each once when a new instance starts.

## Other notes
- The database password for Aurora (only if Aurora is used) is already a Secrets Manager secret, referenced by `AURORA_SECRET_ARN`; it is separate from these.
- In tests and for a developer who does not set `APP_SECRETS_ID`, nothing is loaded and `.env` works as before.
