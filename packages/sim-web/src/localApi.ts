import type {
  AppEvent,
  AssignmentInstance,
  DocType,
  EventType,
  FlowProgress,
  SalesDocument,
  SalesDocumentItem,
} from '@sap-sim/shared';
import { PILOT_ASSIGNMENT, resolveVariant, formatPoNumber, priceDocument, getMaterial } from '@sap-sim/engine';

/**
 * A client-side stand-in for packages/server, used for the shared/deployed build where there's no
 * backend to host (Amplify Hosting is static-only) — see docs/decisions for the 2026-11-02 call to
 * keep the demo zero-infrastructure rather than stand up a separate API. Mirrors api.ts's function
 * signatures exactly, backed by localStorage instead of SQLite. Each browser gets its own data;
 * losing it on a cache clear or new device is expected and fine for a reviewer demo, not a pilot.
 */

const KEYS = {
  instances: 'sap-sim:assignmentInstances',
  documents: 'sap-sim:documents',
  events: 'sap-sim:events',
  flowProgress: 'sap-sim:flowProgress',
  poCounters: 'sap-sim:poCounters',
  docCounters: 'sap-sim:docCounters',
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private window, quota) — degrade silently, same as the networked
    // version's "fire and forget" event logging.
  }
}

const assignment = PILOT_ASSIGNMENT;

function nextPoNumber(assignmentId: string): string {
  const counters = readJSON<Record<string, number>>(KEYS.poCounters, {});
  const sequence = counters[assignmentId] ?? 1;
  counters[assignmentId] = sequence + 1;
  writeJSON(KEYS.poCounters, counters);
  return formatPoNumber(sequence);
}

export function getAssignmentInstance(studentKey: string): Promise<AssignmentInstance> {
  const instances = readJSON<AssignmentInstance[]>(KEYS.instances, []);
  const existing = instances.find((i) => i.assignmentId === assignment.id && i.studentKey === studentKey);
  if (existing) return Promise.resolve(existing);

  const resolved = resolveVariant(assignment, studentKey);
  const instance: AssignmentInstance = {
    id: crypto.randomUUID(),
    assignmentId: assignment.id,
    studentKey,
    source: resolved.source,
    variantIndex: resolved.variantIndex,
    seed: resolved.seed,
    resolvedParams: resolved.resolvedParams,
    expectedNetValue: resolved.expectedNetValue,
    custPoNumber: nextPoNumber(assignment.id),
    createdAt: new Date().toISOString(),
  };
  instances.push(instance);
  writeJSON(KEYS.instances, instances);
  return Promise.resolve(instance);
}

const DOC_PREFIX: Record<DocType, string> = { inquiry: 'INQ', quotation: 'QUO', order: 'ORD' };

function nextDocNumber(docType: DocType): string {
  const counters = readJSON<Record<string, number>>(KEYS.docCounters, {});
  const n = (counters[docType] ?? 0) + 1;
  counters[docType] = n;
  writeJSON(KEYS.docCounters, counters);
  return `${DOC_PREFIX[docType]}-${String(n).padStart(6, '0')}`;
}

function repriceDocument(doc: Pick<SalesDocument, 'items' | 'headerConditions'>): { items: SalesDocumentItem[]; netValue: number } {
  const { itemNetValues, netValue } = priceDocument(
    doc.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, itemConditions: i.itemConditions })),
    doc.headerConditions,
    getMaterial,
  );
  return {
    items: doc.items.map((item, idx) => ({ ...item, itemNetValue: itemNetValues[idx] })),
    netValue,
  };
}

export function listDocuments(studentKey: string, docType?: DocType): Promise<SalesDocument[]> {
  const docs = readJSON<SalesDocument[]>(KEYS.documents, []);
  const filtered = docs
    .filter((d) => d.studentKey === studentKey && d.assignmentId === assignment.id && (!docType || d.docType === docType))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return Promise.resolve(filtered);
}

export function getDocument(id: string): Promise<SalesDocument> {
  const docs = readJSON<SalesDocument[]>(KEYS.documents, []);
  const doc = docs.find((d) => d.id === id);
  if (!doc) return Promise.reject(new Error(`GET /documents/${id} failed: 404`));
  return Promise.resolve(doc);
}

export function searchByReference(docType: DocType, custReference: string): Promise<SalesDocument[]> {
  const docs = readJSON<SalesDocument[]>(KEYS.documents, []);
  return Promise.resolve(
    docs.filter((d) => d.assignmentId === assignment.id && d.docType === docType && d.custReference === custReference),
  );
}

export function createDocument(doc: Omit<SalesDocument, 'id' | 'createdAt' | 'netValue'>): Promise<SalesDocument> {
  const priced = repriceDocument(doc);
  const newDoc: SalesDocument = {
    ...doc,
    assignmentId: assignment.id,
    items: priced.items,
    netValue: priced.netValue,
    id: nextDocNumber(doc.docType),
    createdAt: new Date().toISOString(),
  };
  const docs = readJSON<SalesDocument[]>(KEYS.documents, []);
  docs.push(newDoc);
  writeJSON(KEYS.documents, docs);
  return Promise.resolve(newDoc);
}

export function updateDocument(id: string, patch: Partial<SalesDocument>): Promise<SalesDocument> {
  const docs = readJSON<SalesDocument[]>(KEYS.documents, []);
  const idx = docs.findIndex((d) => d.id === id);
  if (idx < 0) return Promise.reject(new Error(`PATCH /documents/${id} failed: 404`));
  const merged = { ...docs[idx], ...patch };
  const priced = repriceDocument(merged);
  const updated: SalesDocument = { ...merged, items: priced.items, netValue: priced.netValue };
  docs[idx] = updated;
  writeJSON(KEYS.documents, docs);
  return Promise.resolve(updated);
}

export function getDocumentFlow(id: string): Promise<SalesDocument[]> {
  const docs = readJSON<SalesDocument[]>(KEYS.documents, []);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const chain: SalesDocument[] = [];
  let current = byId.get(id) ?? null;
  while (current) {
    chain.unshift(current);
    current = current.predecessorId ? (byId.get(current.predecessorId) ?? null) : null;
  }
  return Promise.resolve(chain);
}

export function getFlowProgress(studentKey: string): Promise<FlowProgress> {
  const all = readJSON<FlowProgress[]>(KEYS.flowProgress, []);
  const existing = all.find((p) => p.studentKey === studentKey && p.assignmentId === assignment.id);
  return Promise.resolve(existing ?? { studentKey, assignmentId: assignment.id, currentBlockIndex: 0, furthestBlockIndex: 0 });
}

export function saveFlowProgress(progress: FlowProgress): Promise<FlowProgress> {
  const all = readJSON<FlowProgress[]>(KEYS.flowProgress, []);
  const idx = all.findIndex((p) => p.studentKey === progress.studentKey && p.assignmentId === assignment.id);
  const current = idx >= 0 ? all[idx] : { studentKey: progress.studentKey, assignmentId: assignment.id, currentBlockIndex: 0, furthestBlockIndex: 0 };
  const merged: FlowProgress = {
    ...progress,
    assignmentId: assignment.id,
    furthestBlockIndex: Math.max(current.furthestBlockIndex, progress.furthestBlockIndex),
  };
  if (idx >= 0) all[idx] = merged;
  else all.push(merged);
  writeJSON(KEYS.flowProgress, all);
  return Promise.resolve(merged);
}

const sessionStartByKey = new Map<string, number>();

function sessionStartMs(studentKey: string, assignmentId: string): number {
  const key = `${studentKey}:${assignmentId}`;
  let start = sessionStartByKey.get(key);
  if (start === undefined) {
    const events = readJSON<AppEvent[]>(KEYS.events, []);
    const mine = events.filter((e) => e.studentKey === studentKey && e.assignmentId === assignmentId);
    start = mine.length > 0 ? Math.min(...mine.map((e) => new Date(e.occurredAt).getTime())) : Date.now();
    sessionStartByKey.set(key, start);
  }
  return start;
}

export function logEvent(studentKey: string, type: EventType, payload?: Record<string, unknown>, docId?: string | null): void {
  try {
    const occurredAt = new Date().toISOString();
    const event: AppEvent = {
      id: crypto.randomUUID(),
      studentKey,
      assignmentId: assignment.id,
      docId: docId ?? null,
      type,
      payload: payload ?? {},
      occurredAt,
      relativeMs: new Date(occurredAt).getTime() - sessionStartMs(studentKey, assignment.id),
    };
    const events = readJSON<AppEvent[]>(KEYS.events, []);
    events.push(event);
    writeJSON(KEYS.events, events);
  } catch {
    // non-critical, same as the networked version
  }
}

export type { AppEvent };
