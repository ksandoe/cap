import type { Assignment } from '@sap-sim/shared';
import { CUSTOMERS } from './customers';
import { DELUXE_COLOR_POOL, MATERIALS, PROFESSIONAL_COLOR_POOL } from './materials';

// The pilot assignment — docs/architecture-proposal.md §3b's fully-specified `random` mode.
export const PILOT_ASSIGNMENT: Assignment = {
  id: 'pilot-sales-process',
  title: 'The Sales Process: Inquiry, Quotation, Sales Order',
  customerPool: CUSTOMERS.map((c) => c.id),
  materialPool: MATERIALS.map((m) => m.id),
  variantStrategy: {
    mode: 'random',
    ranges: {
      customerPool: CUSTOMERS.map((c) => c.id),
      materialSlots: [
        { role: 'deluxe', colorPool: DELUXE_COLOR_POOL },
        { role: 'professional', colorPool: PROFESSIONAL_COLOR_POOL },
      ],
      quantity: { min: 2, max: 11 },
      itemDiscount: { conditionCode: 'K004', appliesToRole: 'deluxe', amountMin: 10, amountMax: 80, step: 10 },
      headerDiscount: { conditionCode: 'RA00', amountMin: 2, amountMax: 8, step: 1 },
      orderProbability: 70,
    },
  },
  quirks: {
    postSaveBehavior: 'blank-tab',
  },
};
