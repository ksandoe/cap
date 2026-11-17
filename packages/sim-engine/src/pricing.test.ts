import { describe, expect, it } from 'vitest';
import { priceDocument } from './pricing';
import { getMaterial } from './seed/materials';

describe('priceDocument', () => {
  it('prices items with no conditions as plain qty * basePrice', () => {
    const { netValue } = priceDocument(
      [{ materialId: 'DXTR1999', quantity: 5, itemConditions: [] }],
      [],
      getMaterial,
    );
    expect(netValue).toBe(4500); // 5 * $900
  });

  it('applies an active per-unit K004 discount before summing', () => {
    const { netValue } = priceDocument(
      [
        { materialId: 'DXTR1999', quantity: 5, itemConditions: [{ conditionCode: 'K004', amount: 50, active: true }] },
      ],
      [],
      getMaterial,
    );
    expect(netValue).toBe(4250); // 5 * (900 - 50)
  });

  it('ignores an inactive condition', () => {
    const { netValue } = priceDocument(
      [
        { materialId: 'DXTR1999', quantity: 5, itemConditions: [{ conditionCode: 'K004', amount: 50, active: false }] },
      ],
      [],
      getMaterial,
    );
    expect(netValue).toBe(4500);
  });

  it('applies an active header RA00 percent discount to the subtotal', () => {
    const { netValue } = priceDocument(
      [
        { materialId: 'DXTR1999', quantity: 5, itemConditions: [{ conditionCode: 'K004', amount: 50, active: true }] },
        { materialId: 'PRTR1999', quantity: 2, itemConditions: [] },
      ],
      [{ conditionCode: 'RA00', amount: 5, active: true }],
      getMaterial,
    );
    // subtotal = 5*(900-50) + 2*1200 = 4250 + 2400 = 6650; 5% off -> 6317.5
    expect(netValue).toBe(6317.5);
  });

  it('does not apply RA00 until it is active', () => {
    const { netValue } = priceDocument(
      [{ materialId: 'PRTR1999', quantity: 2, itemConditions: [] }],
      [{ conditionCode: 'RA00', amount: 5, active: false }],
      getMaterial,
    );
    expect(netValue).toBe(2400);
  });
});
