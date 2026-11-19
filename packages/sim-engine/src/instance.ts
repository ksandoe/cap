import type {
  AssignmentInstance,
  PublicAssignmentInstance,
  SimActivityDefinition,
  SimRecipeParameters,
  SimScope,
  SimStore,
} from '@cap/sim-shared';
import { formatPoNumber } from './poNumber';
import { Rng } from './rng';
import { CUSTOMERS } from './seed/customers';
import { getMaterial } from './seed/materials';
import { resolveVariant } from './variantResolution';

/**
 * The learner's PO number is derived from the scope, so the same learner always gets the same one and no
 * global counter is needed. Two learners may share a number, which does not matter because every read is
 * scoped to one learner.
 */
function custPoNumberFor(scope: SimScope, assignmentId: string): string {
  const rng = new Rng(`${scope.learnerKey}:${assignmentId}:po`);
  return formatPoNumber(rng.intInRange(0, 89_999));
}

function newId(): string {
  // Node 20+ and every current browser provide this; the engine's TypeScript lib does not declare it.
  return (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();
}

/**
 * The learner's instance, created once and stored. Resolving it again for the same scope always gives
 * the same values, so a resume never re-rolls the assignment. If two first requests race, the stored
 * (first) instance wins and both callers get it.
 */
export async function getOrCreateInstance(
  store: SimStore,
  scope: SimScope,
  definition: SimActivityDefinition,
): Promise<AssignmentInstance> {
  const existing = await store.getInstance(scope);
  if (existing) return existing;
  const resolved = resolveVariant(definition.assignment, scope.learnerKey);
  const instance: AssignmentInstance = {
    id: newId(),
    assignmentId: definition.assignment.id,
    studentKey: scope.learnerKey,
    source: resolved.source,
    variantIndex: resolved.variantIndex,
    seed: resolved.seed,
    resolvedParams: resolved.resolvedParams,
    expectedNetValue: resolved.expectedNetValue,
    custPoNumber: custPoNumberFor(scope, definition.assignment.id),
    createdAt: new Date().toISOString(),
  };
  await store.putInstance(scope, instance);
  return (await store.getInstance(scope)) ?? instance;
}

/** The instance as the browser may see it: no learner key, seed or expected net value. */
export function toPublicInstance(instance: AssignmentInstance): PublicAssignmentInstance {
  const { studentKey: _studentKey, seed: _seed, expectedNetValue: _expected, ...pub } = instance;
  return pub;
}

/**
 * The `{key}` values for the recipe's placeholders. In the pilot assignment item 1 is the Deluxe bike and
 * item 2 the Professional one. Every value is an input the exercise gives the student, never a result.
 */
export function toRecipeParameters(instance: AssignmentInstance): SimRecipeParameters {
  const p = instance.resolvedParams;
  const [item1, item2] = p.items;
  const itemDiscount = p.itemConditions[0];
  const headerDiscount = p.headerConditions[0];
  return {
    customerId: String(p.customerId),
    customerName: CUSTOMERS.find((c) => c.id === p.customerId)?.name ?? String(p.customerId),
    poNumber: instance.custPoNumber,
    item1MaterialId: String(item1.materialId),
    item1Description: getMaterial(item1.materialId).description,
    item1Quantity: String(item1.quantity),
    item2MaterialId: String(item2.materialId),
    item2Description: getMaterial(item2.materialId).description,
    item2Quantity: String(item2.quantity),
    itemDiscountMaterialId: String(itemDiscount?.materialId ?? ''),
    itemDiscountAmount: String(itemDiscount?.amount ?? ''),
    headerDiscountPercent: String(headerDiscount?.amount ?? ''),
    orderProbability: String(p.orderProbability),
  };
}
