import type { AppliedCondition, Material } from '@sap-sim/shared';
import { getConditionType } from './seed/conditionTypes';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Per-unit price after active, amount-based item conditions (e.g. K004), floored at 0. */
export function unitPriceAfterItemConditions(basePrice: number, itemConditions: AppliedCondition[]): number {
  const perUnitDiscount = itemConditions
    .filter((c) => c.active && getConditionType(c.conditionCode).calcType === 'amount')
    .reduce((sum, c) => sum + c.amount, 0);
  return Math.max(basePrice - perUnitDiscount, 0);
}

export function computeItemNetValue(basePrice: number, quantity: number, itemConditions: AppliedCondition[]): number {
  return round2(unitPriceAfterItemConditions(basePrice, itemConditions) * quantity);
}

export interface PriceableItem {
  materialId: string;
  quantity: number;
  itemConditions: AppliedCondition[];
}

/**
 * Full document pricing: item net values, then header conditions (e.g. RA00, percent-off)
 * applied to the subtotal. Mirrors docs/architecture-proposal.md §5's pricing engine description.
 */
export function priceDocument(
  items: PriceableItem[],
  headerConditions: AppliedCondition[],
  getMaterial: (id: string) => Material,
): { itemNetValues: number[]; netValue: number } {
  const itemNetValues = items.map((item) =>
    computeItemNetValue(getMaterial(item.materialId).basePrice, item.quantity, item.itemConditions),
  );
  const subtotal = itemNetValues.reduce((a, b) => a + b, 0);
  const percentOff = headerConditions
    .filter((c) => c.active && getConditionType(c.conditionCode).calcType === 'percent')
    .reduce((sum, c) => sum + c.amount, 0);
  const netValue = round2(subtotal * (1 - percentOff / 100));
  return { itemNetValues, netValue };
}
