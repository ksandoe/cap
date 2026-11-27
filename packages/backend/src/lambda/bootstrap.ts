/**
 * bootstrap.ts — Start the app only after the secrets are loaded.
 *
 * The app module reads settings and checks the secrets as soon as it is imported
 * (config/secrets.ts, assertProductionSecrets in app.ts), so the secrets must already be
 * in place. This builds a Lambda handler that, on the first request:
 *   1. loads the secrets (config/secretsManager.ts),
 *   2. then builds the app,
 * and reuses the result for every later request in the same warm instance.
 *
 * Two different failures are handled differently on purpose:
 *   - Loading the secrets fails (not readable yet, a permission missing): that request fails
 *     and the NEXT request tries again, so fixing a permission needs no redeploy.
 *   - Building the app fails (a required secret is missing, a bug at import): that failure is
 *     kept and every later request in this instance gets the same error. The app cannot be
 *     imported a second time: the bundler does not re-run a module that threw while loading,
 *     so a retry would return a half-built app and a misleading error. A fixed environment
 *     variable starts a fresh instance anyway.
 *
 * Concurrent first requests share one start-up. Kept free of AWS and Express imports so it
 * can be tested with plain functions.
 */
export interface BootstrapDeps<Event, Context, Result> {
  /** Load secrets into the environment. Throws if it cannot. */
  loadSecrets: () => Promise<unknown>;
  /** Import and build the app; called only after loadSecrets has finished. */
  build: () => Promise<(event: Event, context: Context) => Promise<Result>>;
}

export function makeHandler<Event, Context, Result>(
  deps: BootstrapDeps<Event, Context, Result>,
): (event: Event, context: Context) => Promise<Result> {
  let secrets: Promise<unknown> | undefined;
  let app: Promise<(event: Event, context: Context) => Promise<Result>> | undefined;

  return async (event, context) => {
    if (!secrets) {
      const loading = deps.loadSecrets();
      secrets = loading;
      // Forget a failed load so the next request tries again. The failure itself still
      // reaches this request through the await below.
      loading.catch(() => { if (secrets === loading) secrets = undefined; });
    }
    await secrets;

    // Not retried after a failure: see the note at the top of this file.
    if (!app) app = deps.build();
    const inner = await app;
    return inner(event, context);
  };
}
