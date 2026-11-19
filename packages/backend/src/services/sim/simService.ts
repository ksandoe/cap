/**
 * simService.ts — CAP-side composition of the simulator contracts.
 *
 * The contracts (packages/sim-shared/src/contracts.ts) type the seam; the
 * sim engine owns the long-lived implementations of the activity registry,
 * `verifyActivity`, `toPublicInstance` and `toRecipeParameters` (task S1,
 * PR 2). Until S1 lands, those helpers live here — keep them small and
 * free of HTTP so they can move to the engine unchanged.
 *
 * Two security rules are load-bearing (contract header):
 *   - The public projections below are the ONLY shapes routes may return;
 *     expectedNetValue, seed and learnerKey never leave the server.
 *   - Verification failure messages name what to recheck, never the
 *     expected value.
 */
import type {
  ActivityVerification, AssignmentInstance, DocType, PublicAssignmentInstance,
  PublicSalesDocument, SalesDocument, SalesDocumentItem, SimActivityDefinition,
  SimActivityRegistry, SimRecipeParameters, SimScope, SimStore, VerificationItem,
} from '@cap/sim-shared';
import { v4 as uuidv4 } from 'uuid';
import {
  CUSTOMERS, PILOT_ASSIGNMENT, Rng, formatPoNumber, getMaterial, priceDocument,
  resolveVariant,
} from '@cap/sim-engine';
import { SAP_MODE } from '../../config/env';
import { simStore } from '../../db/simDb';
import { moduleConfigDb } from '../../db/moduleConfigDb';

// ── Activity registry (until S1's engine version exists) ─────────────────────

const SIM_DEFINITIONS: Record<string, SimActivityDefinition> = {
  [PILOT_ASSIGNMENT.id]: {
    assignment: PILOT_ASSIGNMENT,
    requiredDocuments: [
      { docType: 'inquiry',    transactionId: 'VA11' },
      { docType: 'quotation',  transactionId: 'VA21' },
      { docType: 'order',      transactionId: 'VA01' },
    ],
  },
};

export const simActivityRegistry: SimActivityRegistry = (id) => SIM_DEFINITIONS[id];

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

// ── Instance lifecycle ───────────────────────────────────────────────────────

/**
 * The learner's PO number, derived deterministically from the scope. A
 * per-assignment sequence (the PoC approach) would need a global counter;
 * a scoped, deterministic value gives the same learner the same PO number
 * on every resolution and needs no extra state. Collisions across learners
 * don't matter — the store is fully scoped.
 */
function custPoNumberFor(scope: SimScope, assignmentId: string): string {
  const rng = new Rng(`${scope.learnerKey}:${assignmentId}:po`);
  return formatPoNumber(rng.intInRange(0, 89_999));
}

/** Resolve once, persist, never re-roll on resume (sim doc §3a). */
export async function getOrCreateSimInstance(
  scope: SimScope,
  definition: SimActivityDefinition,
  store: SimStore = simStore,
): Promise<AssignmentInstance> {
  const existing = await store.getInstance(scope);
  if (existing) return existing;
  const resolved = resolveVariant(definition.assignment, scope.learnerKey);
  const instance: AssignmentInstance = {
    id: uuidv4(),
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
  // putInstance is a conditional put — if a concurrent first-touch won,
  // return the canonical stored instance, not our local copy.
  return (await store.getInstance(scope)) ?? instance;
}

// ── Public projections (the only shapes that may reach the browser) ──────────

export function toPublicInstance(instance: AssignmentInstance): PublicAssignmentInstance {
  const { studentKey: _sk, seed: _s, expectedNetValue: _e, ...pub } = instance;
  return pub;
}

export function toPublicDocument(doc: SalesDocument): PublicSalesDocument;
export function toPublicDocument(doc: SalesDocument[]): PublicSalesDocument[];
export function toPublicDocument(doc: SalesDocument | SalesDocument[]) {
  const strip = (d: SalesDocument): PublicSalesDocument => {
    const { studentKey: _sk, ...pub } = d;
    return pub;
  };
  return Array.isArray(doc) ? doc.map(strip) : strip(doc);
}

// ── Repricing (server-side, like the PoC's repriceDocument) ──────────────────

export function repriceDocument(
  doc: { items: SalesDocumentItem[]; headerConditions: SalesDocument['headerConditions'] },
): { items: SalesDocumentItem[]; netValue: number } {
  const { itemNetValues, netValue } = priceDocument(
    doc.items.map(i => ({ materialId: i.materialId, quantity: i.quantity, itemConditions: i.itemConditions })),
    doc.headerConditions,
    getMaterial,
  );
  return { items: doc.items.map((item, idx) => ({ ...item, itemNetValue: itemNetValues[idx] })), netValue };
}

// ── Recipe parameters (the {key} placeholders for the sim recipe) ────────────

export function toRecipeParameters(instance: AssignmentInstance): SimRecipeParameters {
  const p = instance.resolvedParams;
  const [item1, item2] = p.items; // slot order is fixed: deluxe, professional
  const itemDiscount   = p.itemConditions[0];
  const headerDiscount = p.headerConditions[0];
  return {
    customerId:            String(p.customerId),
    customerName:          CUSTOMERS.find(c => c.id === p.customerId)?.name ?? String(p.customerId),
    poNumber:              instance.custPoNumber,
    item1MaterialId:       String(item1.materialId),
    item1Description:      getMaterial(item1.materialId).description,
    item1Quantity:         String(item1.quantity),
    item2MaterialId:       String(item2.materialId),
    item2Description:      getMaterial(item2.materialId).description,
    item2Quantity:         String(item2.quantity),
    itemDiscountMaterialId: String(itemDiscount?.materialId ?? ''),
    itemDiscountAmount:    String(itemDiscount?.amount ?? ''),
    headerDiscountPercent: String(headerDiscount?.amount ?? ''),
    orderProbability:      String(p.orderProbability),
  };
}

// ── Verification ─────────────────────────────────────────────────────────────

const DOC_LABEL: Record<DocType, string> = {
  inquiry: 'inquiry', quotation: 'quotation', order: 'sales order',
};

function missingItem(docType: DocType): VerificationItem {
  return { key: docType, status: 'missing',
    studentMessage: `You have not saved a ${DOC_LABEL[docType]} yet — save it in the corresponding transaction (a document that is still in progress does not count).` };
}

function mismatchItem(docType: DocType): VerificationItem {
  return { key: docType, status: 'mismatch',
    studentMessage: `The net value of your ${DOC_LABEL[docType]} does not match what we expected. Recheck the discounts and the quantities.` };
}

/**
 * Check the activity: for each required document type, a *complete*
 * document must exist in the learner's scope and its net value must match
 * the instance's expected value. Student-safe output only — no expected
 * values in items, statuses, or messages.
 */
export async function verifySimActivity(
  scope: SimScope,
  definition: SimActivityDefinition,
  store: SimStore = simStore,
): Promise<ActivityVerification> {
  const instance = await store.getInstance(scope);
  const items: VerificationItem[] = [];
  const foundDocs: string[] = [];
  const missingTypes: DocType[] = [];

  for (const { docType } of definition.requiredDocuments) {
    if (!instance) { items.push(missingItem(docType)); missingTypes.push(docType); continue; }
    const docs = await store.listDocuments(scope, { docType });
    const doc  = docs.find(d => d.status === 'complete');
    if (!doc) { items.push(missingItem(docType)); missingTypes.push(docType); continue; }
    foundDocs.push(doc.id);
    const expected = instance.expectedNetValue[docType];
    items.push(Math.abs(doc.netValue - expected) < 0.005
      ? { key: docType, status: 'ok', studentMessage: `${DOC_LABEL[docType]} verified.` }
      : mismatchItem(docType));
  }

  return {
    passed:      items.length > 0 && items.every(i => i.status === 'ok'),
    allPresent:  missingTypes.length === 0,
    foundDocs,
    missingTypes,
    items,
  };
}
