import { describe, expect, it } from 'vitest';
import type { AssignmentInstance, DocType, NewSalesDocumentInput, SimScope, SimStore } from '@cap/sim-shared';
import { SIM_PARAMETER_KEYS } from '@cap/sim-shared';
import { getSimActivity } from './activities';
import { repriceDocument, toPublicDocument } from './documents';
import { getOrCreateInstance, toPublicInstance, toRecipeParameters } from './instance';
import { createMemorySimStore } from './memoryStore';
import { PILOT_ASSIGNMENT } from './seed/assignment';
import { verifyActivity } from './verify';

const activity = getSimActivity(PILOT_ASSIGNMENT.id)!;
const scopeOf = (learner: string): SimScope => ({ learnerKey: learner, activityId: 'sim-sales-process' });

/** The documents that satisfy an instance, built the way a student following the instructions would. */
function docsFor(instance: AssignmentInstance, opts: { withDiscounts?: boolean } = {}) {
  const withDiscounts = opts.withDiscounts ?? true;
  const p = instance.resolvedParams;
  const discountByMaterial = new Map(p.itemConditions.map((c) => [c.materialId, c]));
  const items = (discounts: boolean, probability: number | null) =>
    p.items.map((it, i) => {
      const c = discounts ? discountByMaterial.get(it.materialId) : undefined;
      return {
        lineNumber: (i + 1) * 10,
        materialId: it.materialId,
        quantity: it.quantity,
        orderProbability: probability,
        itemConditions: c ? [{ conditionCode: c.conditionCode, amount: c.amount, active: true }] : [],
        itemNetValue: 0,
      };
    });
  const header = (discounts: boolean) =>
    discounts ? p.headerConditions.map((h) => ({ conditionCode: h.conditionCode, amount: h.amount, active: true })) : [];
  const common = {
    customerId: p.customerId,
    custReference: instance.custPoNumber,
    custReferenceDate: '2026-11-20',
    validFrom: null,
    validTo: null,
    requestedDeliveryDate: null,
    status: 'complete' as const,
    savedAt: null,
  };
  const make = (docType: DocType, predecessorId: string | null, discounts: boolean, probability: number | null): NewSalesDocumentInput => ({
    ...common,
    docType,
    predecessorId,
    items: items(discounts, probability),
    headerConditions: header(discounts),
  });
  return {
    inquiry: make('inquiry', null, false, p.orderProbability),
    quotation: make('quotation', 'INQ-000001', withDiscounts, null),
    order: make('order', 'QUO-000001', withDiscounts, null),
  };
}

async function save(store: SimStore, scope: SimScope, doc: NewSalesDocumentInput) {
  const priced = repriceDocument(doc);
  return store.createDocument(scope, { ...doc, items: priced.items, netValue: priced.netValue });
}

async function saveCorrectSet(store: SimStore, scope: SimScope) {
  const instance = await getOrCreateInstance(store, scope, activity);
  const docs = docsFor(instance);
  await save(store, scope, docs.inquiry);
  await save(store, scope, docs.quotation);
  await save(store, scope, docs.order);
  return instance;
}

describe('activity registry', () => {
  it('resolves the pilot assignment with its three required documents', () => {
    expect(activity.requiredDocuments.map((d) => d.transactionId)).toEqual(['VA11', 'VA21', 'VA01']);
    expect(getSimActivity('no-such-assignment')).toBeUndefined();
  });
});

describe('instances', () => {
  it('are created once per scope and never re-rolled', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const [first, second] = await Promise.all([
      getOrCreateInstance(store, scope, activity),
      getOrCreateInstance(store, scope, activity),
    ]);
    expect(second.id).toBe(first.id);
    const later = await getOrCreateInstance(store, scope, activity);
    expect(later.resolvedParams).toEqual(first.resolvedParams);
    expect(later.custPoNumber).toBe(first.custPoNumber);
  });

  it('give the same learner the same values in a fresh store (nothing is stored in the engine)', async () => {
    const a = await getOrCreateInstance(createMemorySimStore(), scopeOf('learner-a'), activity);
    const b = await getOrCreateInstance(createMemorySimStore(), scopeOf('learner-a'), activity);
    expect(b.resolvedParams).toEqual(a.resolvedParams);
    expect(b.expectedNetValue).toEqual(a.expectedNetValue);
    expect(b.custPoNumber).toBe(a.custPoNumber);
  });

  it('expose no learner key, seed or expected net value to the browser', async () => {
    const instance = await getOrCreateInstance(createMemorySimStore(), scopeOf('learner-secret-key'), activity);
    const json = JSON.stringify(toPublicInstance(instance));
    for (const forbidden of ['expectedNetValue', 'studentKey', '"seed"', 'learner-secret-key']) {
      expect(json).not.toContain(forbidden);
    }
    expect(toPublicInstance(instance).resolvedParams).toEqual(instance.resolvedParams);
  });

  it('fill every recipe placeholder with a non-empty string', async () => {
    const instance = await getOrCreateInstance(createMemorySimStore(), scopeOf('learner-a'), activity);
    const params = toRecipeParameters(instance);
    expect(Object.keys(params).sort()).toEqual([...SIM_PARAMETER_KEYS].sort());
    for (const key of SIM_PARAMETER_KEYS) expect(params[key], key).not.toBe('');
  });
});

describe('verifyActivity', () => {
  it('fails an empty scope with a "missing" item for every document', async () => {
    const result = await verifyActivity(createMemorySimStore(), scopeOf('nobody'), activity);
    expect(result.passed).toBe(false);
    expect(result.allPresent).toBe(false);
    expect(result.missingTypes).toEqual(['inquiry', 'quotation', 'order']);
    expect(result.items.every((i) => i.status === 'missing')).toBe(true);
  });

  it('passes a correct, complete, referenced set', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    await saveCorrectSet(store, scope);
    const result = await verifyActivity(store, scope, activity);
    expect(result.passed).toBe(true);
    expect(result.allPresent).toBe(true);
    expect(result.items.map((i) => i.status)).toEqual(['ok', 'ok', 'ok']);
    expect(result.foundDocs).toEqual(['INQ-000001', 'QUO-000001', 'ORD-000001']);
  });

  it('does not count a document that is still in progress', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const instance = await getOrCreateInstance(store, scope, activity);
    const docs = docsFor(instance);
    await save(store, scope, docs.inquiry);
    await save(store, scope, docs.quotation);
    await save(store, scope, { ...docs.order, status: 'in_progress', custReference: '', custReferenceDate: '' });
    const result = await verifyActivity(store, scope, activity);
    expect(result.passed).toBe(false);
    expect(result.missingTypes).toEqual(['order']);
  });

  it('fails a wrong net value without revealing the expected value', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const instance = await getOrCreateInstance(store, scope, activity);
    const docs = docsFor(instance);
    const noDiscounts = docsFor(instance, { withDiscounts: false });
    await save(store, scope, docs.inquiry);
    await save(store, scope, docs.quotation);
    await save(store, scope, { ...noDiscounts.order, predecessorId: 'QUO-000001' }); // forgot the discounts
    const result = await verifyActivity(store, scope, activity);
    expect(result.passed).toBe(false);
    expect(result.allPresent).toBe(true);
    expect(result.items.find((i) => i.key === 'order')?.status).toBe('mismatch');
    const json = JSON.stringify(result);
    for (const value of Object.values(instance.expectedNetValue)) {
      expect(json).not.toContain(String(value));
      expect(json).not.toContain(value.toFixed(2));
    }
    expect(json).not.toContain('expectedNetValue');
  });

  it('passes when a student saves a corrected document after a wrong one', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const instance = await getOrCreateInstance(store, scope, activity);
    const docs = docsFor(instance);
    const wrong = docsFor(instance, { withDiscounts: false });
    await save(store, scope, docs.inquiry);
    await save(store, scope, docs.quotation);
    await save(store, scope, { ...wrong.order, predecessorId: 'QUO-000001' });
    expect((await verifyActivity(store, scope, activity)).passed).toBe(false);
    await save(store, scope, docs.order); // the correction
    expect((await verifyActivity(store, scope, activity)).passed).toBe(true);
  });

  it('fails an order that was not created with reference to the quotation', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const instance = await getOrCreateInstance(store, scope, activity);
    const docs = docsFor(instance);
    await save(store, scope, docs.inquiry);
    await save(store, scope, docs.quotation);
    await save(store, scope, { ...docs.order, predecessorId: null }); // typed in by hand
    const result = await verifyActivity(store, scope, activity);
    expect(result.passed).toBe(false);
    const order = result.items.find((i) => i.key === 'order')!;
    expect(order.status).toBe('mismatch');
    expect(order.studentMessage).toContain('Create with Reference');
  });

  it("never counts another learner's documents", async () => {
    const store = createMemorySimStore();
    await saveCorrectSet(store, scopeOf('learner-a'));
    await getOrCreateInstance(store, scopeOf('learner-b'), activity);
    const result = await verifyActivity(store, scopeOf('learner-b'), activity);
    expect(result.passed).toBe(false);
    expect(result.missingTypes).toEqual(['inquiry', 'quotation', 'order']);
  });
});

describe('memory store rules', () => {
  it('terminates a document chain that points at itself', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const instance = await getOrCreateInstance(store, scope, activity);
    const doc = await save(store, scope, { ...docsFor(instance).order, predecessorId: 'ORD-000001' });
    const chain = await store.getDocumentChain(scope, doc.id);
    expect(chain).toHaveLength(1);
  });

  it('never changes a document’s id, type, owner or creation time on update', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const instance = await getOrCreateInstance(store, scope, activity);
    const doc = await save(store, scope, docsFor(instance).inquiry);
    const updated = await store.updateDocument(scope, doc.id, {
      ...({ id: 'X', docType: 'order', studentKey: 'someone-else', createdAt: 'then' } as object),
      custReference: 'changed',
    });
    expect(updated).toMatchObject({ id: doc.id, docType: 'inquiry', studentKey: 'learner-a', createdAt: doc.createdAt, custReference: 'changed' });
  });

  it('keeps the first instance when two are stored', async () => {
    const store = createMemorySimStore();
    const scope = scopeOf('learner-a');
    const first = await getOrCreateInstance(store, scope, activity);
    await store.putInstance(scope, { ...first, id: 'a-different-id' });
    expect((await store.getInstance(scope))?.id).toBe(first.id);
  });

  it('hides a document from other scopes, strips the owner for the browser, and purges', async () => {
    const store = createMemorySimStore();
    const a = scopeOf('learner-a');
    const instance = await getOrCreateInstance(store, a, activity);
    const doc = await save(store, a, docsFor(instance).inquiry);
    expect(await store.getDocument(scopeOf('learner-b'), doc.id)).toBeNull();
    expect(JSON.stringify(toPublicDocument(doc))).not.toContain('studentKey');
    await store.purge(a);
    expect(await store.listDocuments(a)).toEqual([]);
    expect(await store.getInstance(a)).toBeNull();
  });
});
