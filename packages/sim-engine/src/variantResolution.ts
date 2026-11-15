import type { Assignment, ScenarioParams, AppliedCondition } from '@sap-sim/shared';
import { Rng } from './rng';
import { priceDocument } from './pricing';
import { getMaterial } from './seed/materials';

export interface ResolvedVariant {
  source: 'fixed' | 'table' | 'random';
  variantIndex: number | null;
  seed: string | null;
  resolvedParams: ScenarioParams;
  expectedNetValue: { inquiry: number; quotation: number; order: number };
}

/**
 * Resolve one student's variant for an assignment — docs/architecture-proposal.md §3a/§3b.
 * Deterministic from `studentKey + assignmentId`: calling this twice for the same pair always
 * returns the same result, so the caller (packages/server) can safely call it again on resume
 * without re-rolling, though in practice the server persists the result after the first call.
 */
export function resolveVariant(assignment: Assignment, studentKey: string): ResolvedVariant {
  const strategy = assignment.variantStrategy;

  if (strategy.mode === 'fixed') {
    return {
      source: 'fixed',
      variantIndex: null,
      seed: null,
      resolvedParams: strategy.scenario,
      expectedNetValue: computeExpectedNetValue(strategy.scenario),
    };
  }

  if (strategy.mode === 'table') {
    const rng = new Rng(`${studentKey}:${assignment.id}`);
    const index = Math.floor(rng.float() * strategy.variants.length);
    const scenario = strategy.variants[index];
    return {
      source: 'table',
      variantIndex: index,
      seed: null,
      resolvedParams: scenario,
      expectedNetValue: computeExpectedNetValue(scenario),
    };
  }

  // mode === 'random' — the pilot assignment's generation rules (§3b)
  const seed = `${studentKey}:${assignment.id}`;
  const rng = new Rng(seed);
  const ranges = strategy.ranges;

  // 1. customer
  const customerId = rng.pick(ranges.customerPool);

  // 2 & 3. one material per slot, with its own randomized quantity
  const slotPicks = ranges.materialSlots.map((slot) => ({
    role: slot.role,
    materialId: rng.pick(slot.colorPool),
    quantity: rng.intInRange(ranges.quantity.min, ranges.quantity.max),
  }));

  // 4. item discount, always on the configured role (e.g. "deluxe"), amount randomized
  const discountedSlot = slotPicks.find((s) => s.role === ranges.itemDiscount.appliesToRole);
  if (!discountedSlot) {
    throw new Error(`itemDiscount.appliesToRole "${ranges.itemDiscount.appliesToRole}" matches no material slot`);
  }
  const itemDiscountAmount = rng.intInRangeStep(
    ranges.itemDiscount.amountMin,
    ranges.itemDiscount.amountMax,
    ranges.itemDiscount.step,
  );

  // 5. header discount
  const headerDiscountAmount = rng.intInRangeStep(
    ranges.headerDiscount.amountMin,
    ranges.headerDiscount.amountMax,
    ranges.headerDiscount.step,
  );

  const resolvedParams: ScenarioParams = {
    customerId,
    items: slotPicks.map((s) => ({ materialId: s.materialId, quantity: s.quantity })),
    itemConditions: [
      { materialId: discountedSlot.materialId, conditionCode: ranges.itemDiscount.conditionCode, amount: itemDiscountAmount },
    ],
    headerConditions: [{ conditionCode: ranges.headerDiscount.conditionCode, amount: headerDiscountAmount }],
    // 6. order probability is fixed, not randomized
    orderProbability: ranges.orderProbability,
  };

  return {
    source: 'random',
    variantIndex: null,
    seed,
    resolvedParams,
    // 7. price once, for inquiry (no discounts yet) and quotation/order (discounts applied+active)
    expectedNetValue: computeExpectedNetValue(resolvedParams),
  };
}

function computeExpectedNetValue(params: ScenarioParams): { inquiry: number; quotation: number; order: number } {
  const noConditions: AppliedCondition[] = [];
  const { netValue: inquiryNetValue } = priceDocument(
    params.items.map((i) => ({ ...i, itemConditions: noConditions })),
    noConditions,
    getMaterial,
  );

  const activeItemConditionsByMaterial = new Map<string, AppliedCondition[]>();
  for (const ic of params.itemConditions) {
    const list = activeItemConditionsByMaterial.get(ic.materialId) ?? [];
    list.push({ conditionCode: ic.conditionCode, amount: ic.amount, active: true });
    activeItemConditionsByMaterial.set(ic.materialId, list);
  }
  const activeHeaderConditions: AppliedCondition[] = params.headerConditions.map((hc) => ({
    conditionCode: hc.conditionCode,
    amount: hc.amount,
    active: true,
  }));
  const { netValue: discountedNetValue } = priceDocument(
    params.items.map((i) => ({ ...i, itemConditions: activeItemConditionsByMaterial.get(i.materialId) ?? [] })),
    activeHeaderConditions,
    getMaterial,
  );

  // Order copies the quotation's already-discounted pricing forward unchanged (§1).
  return { inquiry: inquiryNetValue, quotation: discountedNetValue, order: discountedNetValue };
}
