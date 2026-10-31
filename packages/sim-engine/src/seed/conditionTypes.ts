import type { ConditionTypeDef } from '@sap-sim/shared';

export const CONDITION_TYPES: ConditionTypeDef[] = [
  { code: 'K004', name: 'Material Discount', level: 'item', calcType: 'amount', requiresActivation: false },
  { code: 'RA00', name: 'Net Discount (%)', level: 'header', calcType: 'percent', requiresActivation: true },
];

export function getConditionType(code: string): ConditionTypeDef {
  const def = CONDITION_TYPES.find((c) => c.code === code);
  if (!def) throw new Error(`Unknown condition type: ${code}`);
  return def;
}
