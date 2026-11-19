/**
 * simService.ts — CAP-side wiring of the simulator engine.
 *
 * The engine (packages/sim-engine) owns the activity registry, instance creation, the public projections,
 * repricing, recipe parameters and verification. This file only binds them to CAP's store and to module
 * config, and keeps the names the routes, the orchestrator and the tests already use.
 *
 * Two security rules are load-bearing (contract header):
 *   - The public projections are the ONLY shapes routes may return; expectedNetValue, seed and learnerKey
 *     never leave the server.
 *   - Verification failure messages name what to recheck, never the expected value.
 */
import type {
  ActivityVerification, AssignmentInstance, SimActivityDefinition, SimScope, SimStore,
} from '@cap/sim-shared';
import {
  getOrCreateInstance, getSimActivity, repriceDocument, toPublicDocument, toPublicInstance,
  toRecipeParameters, verifyActivity,
} from '@cap/sim-engine';
import { SAP_MODE } from '../../config/env';
import { simStore } from '../../db/simDb';
import { moduleConfigDb } from '../../db/moduleConfigDb';

export const simActivityRegistry = getSimActivity;
export { repriceDocument, toPublicDocument, toPublicInstance, toRecipeParameters };

export type ActivityKind = 'sim' | 'live';

/**
 * Resolve a CAP module to its activity kind and, for sim, its activity
 * definition. The link is `moduleConfig.simAssignmentId` (§7.3); kind
 * defaults from SAP_MODE so an unconfigured module behaves like the rest
 * of the deployment.
 */
export async function resolveActivity(
  moduleId: string,
): Promise<{ kind: ActivityKind; definition?: SimActivityDefinition }> {
  const cfg = await moduleConfigDb.getConfig(moduleId);
  const kind: ActivityKind =
    cfg.activityKind ?? (SAP_MODE === 'sim' ? 'sim' : 'live');
  if (kind !== 'sim') return { kind };
  const definition = cfg.simAssignmentId
    ? simActivityRegistry(cfg.simAssignmentId)
    : undefined;
  return { kind, definition };
}

/** The learner's instance, created on first use and stored under their scope. */
export function getOrCreateSimInstance(
  scope: SimScope,
  definition: SimActivityDefinition,
  store: SimStore = simStore,
): Promise<AssignmentInstance> {
  return getOrCreateInstance(store, scope, definition);
}

/** Checks the learner's documents. Pass or fail comes from `passed`, never from `allPresent`. */
export function verifySimActivity(
  scope: SimScope,
  definition: SimActivityDefinition,
  store: SimStore = simStore,
): Promise<ActivityVerification> {
  return verifyActivity(store, scope, definition);
}
