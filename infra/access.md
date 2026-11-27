# Who can see what in AWS

Written 2026-12. It records decisions and gives the exact policies, so access is granted the same way each time. People change; the principle does not: **give each person the smallest access that lets them do their part**, and give it to their own sign-in, never a shared one.

| Who | Can | Cannot |
|---|---|---|
| **Kent** (owner) | Creates the secret and the policies in the console. | His own command-line profile could not read the function's logs when last tried; confirm what it can do before relying on it. |
| **Devin** (deploys) | Deploy the code (`update-function-code`), read the function's configuration (variable **names**, version, runtime) and the function's logs. | Read the DynamoDB tables (no permission, found 2026-11). Should not print variable values. |
| **The function** (its execution role) | Read and write its DynamoDB tables; **read the one Secrets Manager secret** (`infra/secrets.md`); write its own logs. | Anything else. |
| **Aliyah** (orchestration, testing) | **Read the function's logs** (read-only, below), run the app locally, work in the repository. | Read Secrets Manager. Change the function. Deploy. See the production secrets. |

## Why Aliyah does not read the secret
The secret holds the session signing secret, the learner-key secret, the admin passkey and the model key, and also (for Canvas grade return) the tool's private key. One secret is one permission boundary, so reading any of it means reading all of it, and those four together are control over production identity. Kent chose one secret for now. The work needs her to read logs, not secrets: tests use a throwaway key pair, and a real-Canvas check goes through a deploy (`wp6` task B4).

**If that proves too slow:** split the Canvas key into its own small secret and let her read only that one. The loader change is small (let `APP_SECRETS_ID` name more than one secret). Do it then, not before.

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
