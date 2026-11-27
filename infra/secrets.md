# Secrets Manager: moving the sensitive settings out of the function's environment

**Status:** the code is built and tested; it is **off until the function has `APP_SECRETS_ID`**. Nothing changes on a deployed function until you do the steps below. See `lambda.md` for how settings work today.

## Why
Plain environment variables can be read by anyone who can open the function in the console or run `aws lambda get-function-configuration`, including Devin's commands. A Secrets Manager secret has its own access control, every read is logged (CloudTrail), the values never appear in the function's configuration, and a deploy command can no longer wipe them. A private key (the Canvas grade-return key, work package 6 task B4) also may not fit in an environment variable: all of a function's variables together are limited to 4 KB.

## What goes in the secret, and what does not
**One secret**, a JSON object, with only these names (anything else in it is ignored and named in a log line):

| Name | What it is |
|---|---|
| `SESSION_JWT_SECRET` | Signs every session token, student and admin. Rotating signs everyone out. |
| `LEARNER_KEY_SECRET` | Derives each student's permanent ID. **Never change it once real students have launched.** |
| `ADMIN_PASSKEY` | The shared team passkey for the admin app. |
| `OPENAI_API_KEY` | The model provider key. |
| `SAP_CLIENT_SECRET` | SAP OAuth client secret (when live SAP is used). |
| `DATABASE_URL` | Only if it holds a password. |
| `LTI_PRIVATE_KEY` | The tool's private key (PEM, multi-line) for Canvas grade return. Not used yet. |

**Not in the secret:** table names, mode switches, retention days, the Canvas IDs and addresses. They are not secrets, and being able to see and change them in the console is useful. (The secret's own name, `APP_SECRETS_ID`, is a normal variable.)

## One-time setup (you or an AWS admin; about 15 minutes)
1. **Create the secret.** AWS console, Secrets Manager, Store a new secret, "Other type of secret", Key/value, **Plaintext** tab, and paste this JSON with the real values (never put them in chat or in the repository):
   ```json
   {
     "SESSION_JWT_SECRET": "<a long random value>",
     "LEARNER_KEY_SECRET": "<EXACTLY the value the function uses today: do not generate a new one>",
     "ADMIN_PASSKEY": "<the team passkey>",
     "OPENAI_API_KEY": "<the key>"
   }
   ```
   Name it `cap/prod/app`. No rotation. Encryption: the default key is fine.
2. **Let the function read it.** Lambda console, the function, Configuration, Permissions, click the execution role's name, Add permissions, Create inline policy, JSON:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ReadCapAppSecret",
         "Effect": "Allow",
         "Action": "secretsmanager:GetSecretValue",
         "Resource": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:cap/prod/app-*"
       }
     ]
   }
   ```
   Replace `<ACCOUNT_ID>` with the 12-digit account number. The `-*` covers the random suffix AWS adds to a secret's ARN. If the secret uses a customer-managed encryption key instead of the default, the role also needs `kms:Decrypt` on that key.
3. **Point the function at it.** Lambda console, Configuration, Environment variables, Edit, add `APP_SECRETS_ID` = `cap/prod/app` (use Edit; do not use the `--environment` command, which replaces every variable). Then ask Devin to redeploy this code (`update-function-code` only).
4. **Check the first start.** In CloudWatch the first request logs `[secrets] from Secrets Manager: ...` and, because the variables are still set, a warning `also set as environment variables, which win: ...`. Nothing has changed yet: a variable on the function wins over the secret. If it logs `Secrets Manager: could not read the secret ... (AccessDeniedException)` the permission in step 2 is wrong; the function does not serve requests until it is fixed, and the next request tries again without a redeploy.

## Moving the values, one at a time
Delete one sensitive variable from the function (Environment variables, Edit), then test. The log line moves that name from "also set as environment variables" to "from Secrets Manager". Suggested order, easiest to check first:
1. `OPENAI_API_KEY`: test a check-in or conversation.
2. `ADMIN_PASSKEY`: sign in to the admin app.
3. `SESSION_JWT_SECRET`: everyone is signed out (harmless now); launch from Canvas again.
4. `LEARNER_KEY_SECRET` last: relaunch as the same Canvas test user and confirm the saved session still resumes. A different key would start a fresh, empty session: that is the sign the value in the secret differs from the old one. Put the old variable back and fix the secret.

When none of the sensitive names are left as variables, `aws lambda get-function-configuration --query "Environment.Variables | keys(@)"` shows only non-secret names.

## Changing or rotating later
- Edit the secret's value in the Secrets Manager console. A running function keeps the old value until a new instance starts. To make every instance reload, make any harmless configuration change to the function (for example edit a non-secret variable). New instances read the secret.
- Rotating `SESSION_JWT_SECRET` signs everyone out. **Do not rotate `LEARNER_KEY_SECRET`** after real launches.

## Rolling back
Put the values back as environment variables (they win over the secret), then remove `APP_SECRETS_ID`. With `APP_SECRETS_ID` unset the loader is off and the function behaves as before this feature existed.

## Cost
About $0.40 a month for the one secret, plus a few cents per 10,000 reads. The function reads it once when a new instance starts.

## Other notes
- The database password for Aurora (only if Aurora is used) is already a Secrets Manager secret, referenced by `AURORA_SECRET_ARN`; it is separate from this one.
- Locally and in tests `APP_SECRETS_ID` is unset, so nothing is loaded and `.env` works as before.
