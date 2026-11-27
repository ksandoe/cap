# Who can see what in AWS

Written 2026-12. It records decisions and gives the exact policies, so access is granted the same way each time. People change; the principle does not: **give each person the smallest access that lets them do their part**, and give it to their own sign-in, never a shared one.

| Who | Can | Cannot |
|---|---|---|
| **Kent** (owner) | Creates the secret and the policies in the console. | His own command-line profile could not read the function's logs when last tried; confirm what it can do before relying on it. |
| **Devin** (deploys) | Deploy the code (`update-function-code`), read the function's configuration (variable **names**, version, runtime) and the function's logs. | Read the DynamoDB tables (no permission, found 2026-11). Should not print variable values. |
| **The function** (its execution role) | Read and write its DynamoDB tables; **read the two Secrets Manager secrets** (`cap/prod/app` and `cap/lti-dev`, see `secrets.md`); write its own logs. | Anything else. |
| **Aliyah** (orchestration, testing) | **Read the function's logs** and **read the one small secret `cap/lti-dev`** (the dev Canvas key), both read-only (policies below); run the app locally; work in the repository. | Read `cap/prod/app` (the session, learner-key, passkey and model secrets). Change the function or either secret. Deploy. |

## Why the secrets are split
One secret is one permission boundary: whoever can read any of it reads all of it. The runtime secrets (the session signing secret, the learner-key secret, the admin passkey, the model key) together are control over production identity, and only the function and its owners should read them. The Canvas key is different: grade return is Aliyah's work, and she needs the **dev** key to test against the dev Canvas instance. So the values are split (`secrets.md`):

- **`cap/prod/app`**: the runtime secrets. The function's role, Kent and Devin.
- **`cap/lti-dev`**: the dev Canvas private key only. The function's role and Aliyah, read-only.

The production Canvas key will be its own secret that Aliyah does not read.

**What Aliyah's access is, and is not.** It is read-only and on her own sign-in, so every read is logged under her name. It lets her run the app locally with the loader and `APP_SECRETS_ID=cap/lti-dev`, which puts the key in memory without ever writing it to a file. It does not let her read `cap/prod/app`, change either secret, change the function or deploy. A dev key is also the least damaging key to share: it only works against the dev Canvas instance. Tests still use a throwaway key pair (`wp6` task B4); the real key is for checking against the real dev Canvas.

## Read-only access to the Canvas key secret
Attach this inline policy to the developer's own sign-in. Replace `<ACCOUNT_ID>`; `-??????` matches the six random characters AWS adds to a secret's ARN, so it cannot match any other secret.
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadCanvasDevKeyOnly",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:cap/lti-dev-??????"
    }
  ]
}
```
She must not be given `secretsmanager:*`, a wildcard resource, or `cap/prod/app`. If the secret uses a customer-managed encryption key, she also needs `kms:Decrypt` on that key only. Revoke by removing the policy.

## Read-only log access for a developer
Give the person their own sign-in (an IAM user with MFA, or SSO if the account uses it) and attach this inline policy. Replace `<ACCOUNT_ID>`; the log group name is `/aws/lambda/<function name>`.
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadCapFunctionLogs",
      "Effect": "Allow",
      "Action": ["logs:DescribeLogStreams", "logs:GetLogEvents", "logs:FilterLogEvents"],
      "Resource": [
        "arn:aws:logs:us-east-1:<ACCOUNT_ID>:log-group:/aws/lambda/cap-demo-api",
        "arn:aws:logs:us-east-1:<ACCOUNT_ID>:log-group:/aws/lambda/cap-demo-api:*"
      ]
    },
    {
      "Sid": "FindTheLogGroup",
      "Effect": "Allow",
      "Action": "logs:DescribeLogGroups",
      "Resource": "*"
    }
  ]
}
```
It cannot change or delete anything. Revoke it by removing the policy or the user.

## What the logs contain
- Each request's **method and path**. Never the query string, so session tokens that travel in addresses (`?token=`) are not logged.
- **Event names with the session ID** that goes with them (for example `SESSION_CREATED`), module IDs, and error text.
- **No secrets**: the loader and the secret checks log names only, never values.
- Session IDs are random identifiers, not credentials. They are still worth treating as sensitive, because the session routes do not yet check that the ID in an address belongs to the caller's token (on the hardening list). Anyone who can read the logs can see IDs, so keep log access to people who need it.
- Do not paste log lines into a chat without replacing IDs and addresses with placeholders.

## Reviewing access
David reviews identity and privacy changes. Tell him when access is granted or removed, and keep the table above current.
