/**
 * handler.ts — AWS Lambda entry point
 *
 * Loads the secrets from Secrets Manager (when APP_SECRETS_ID is set), then imports the
 * Express app and wraps it with serverless-http. The app is imported only AFTER the secrets
 * are loaded, because it reads settings and checks the secrets as soon as it is imported.
 * See bootstrap.ts and config/secretsManager.ts.
 */
import serverless from 'serverless-http';
import { loadSecretsIntoEnv } from '../config/secretsManager';
import { makeHandler } from './bootstrap';

export const handler = makeHandler({
  loadSecrets: () => loadSecretsIntoEnv(),
  build: async () => {
    const { app } = await import('../app');
    return serverless(app, { binary: ['image/*'] }) as any;
  },
});
