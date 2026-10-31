import { describe, expect, it } from 'vitest';
import { resolveVariant } from './variantResolution';
import { PILOT_ASSIGNMENT } from './seed/assignment';
import { CUSTOMERS } from './seed/customers';
import { DELUXE_COLOR_POOL, PROFESSIONAL_COLOR_POOL } from './seed/materials';

describe('resolveVariant (random mode, pilot assignment)', () => {
  it('is deterministic for the same studentKey + assignmentId', () => {
    const a = resolveVariant(PILOT_ASSIGNMENT, 'student-123');
    const b = resolveVariant(PILOT_ASSIGNMENT, 'student-123');
    expect(a).toEqual(b);
  });

  it('differs across students (almost always)', () => {
    const a = resolveVariant(PILOT_ASSIGNMENT, 'student-aaa');
    const b = resolveVariant(PILOT_ASSIGNMENT, 'student-bbb');
    expect(a.resolvedParams).not.toEqual(b.resolvedParams);
  });

  it('picks a valid customer, one deluxe + one professional material, and sane ranges', () => {
    const { resolvedParams } = resolveVariant(PILOT_ASSIGNMENT, 'student-xyz');

    expect(CUSTOMERS.map((c) => c.id)).toContain(resolvedParams.customerId);
    expect(resolvedParams.items).toHaveLength(2);

    const deluxeItem = resolvedParams.items.find((i) => DELUXE_COLOR_POOL.includes(i.materialId));
    const proItem = resolvedParams.items.find((i) => PROFESSIONAL_COLOR_POOL.includes(i.materialId));
    expect(deluxeItem).toBeDefined();
    expect(proItem).toBeDefined();

    for (const item of resolvedParams.items) {
      expect(item.quantity).toBeGreaterThanOrEqual(2);
      expect(item.quantity).toBeLessThanOrEqual(11);
    }

    // K004 only ever targets the deluxe item, and only that one
    expect(resolvedParams.itemConditions).toHaveLength(1);
    expect(resolvedParams.itemConditions[0].materialId).toBe(deluxeItem!.materialId);
    expect(resolvedParams.itemConditions[0].amount).toBeGreaterThanOrEqual(10);
    expect(resolvedParams.itemConditions[0].amount).toBeLessThanOrEqual(80);
    expect(resolvedParams.itemConditions[0].amount % 10).toBe(0);

    expect(resolvedParams.headerConditions).toHaveLength(1);
    expect(resolvedParams.headerConditions[0].amount).toBeGreaterThanOrEqual(2);
    expect(resolvedParams.headerConditions[0].amount).toBeLessThanOrEqual(8);

    expect(resolvedParams.orderProbability).toBe(70);
  });

  it('expected net value: inquiry has no discounts, quotation/order share the discounted value', () => {
    const { expectedNetValue } = resolveVariant(PILOT_ASSIGNMENT, 'student-net-value');
    expect(expectedNetValue.inquiry).toBeGreaterThan(expectedNetValue.quotation);
    expect(expectedNetValue.quotation).toBe(expectedNetValue.order);
    expect(expectedNetValue.order).toBeGreaterThan(0);
  });
});
