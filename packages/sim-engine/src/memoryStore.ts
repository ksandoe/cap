import type { AssignmentInstance, DocType, SalesDocument, SimScope, SimStore } from '@cap/sim-shared';

const DOC_PREFIX: Record<DocType, string> = { inquiry: 'INQ', quotation: 'QUO', order: 'ORD' };
const MAX_CHAIN_DEPTH = 10;

interface ScopeState {
  instance: AssignmentInstance | null;
  documents: Map<string, SalesDocument>;
  counters: Record<DocType, number>;
  events: { type: string; docId: string | null; payload: Record<string, unknown>; relativeMs: number }[];
  firstEventAt: number | null;
}

const keyOf = (scope: SimScope) => `${scope.learnerKey}\u0000${scope.activityId}`;

/**
 * A `SimStore` kept in memory. It follows the same rules as CAP's stores (scoping, pinned fields,
 * chain safety, first instance wins), so the engine's tests and a standalone demo can run without a
 * database. Nothing is persisted.
 */
export function createMemorySimStore(): SimStore {
  const scopes = new Map<string, ScopeState>();
  const state = (scope: SimScope): ScopeState => {
    const key = keyOf(scope);
    let s = scopes.get(key);
    if (!s) {
      s = { instance: null, documents: new Map(), counters: { inquiry: 0, quotation: 0, order: 0 }, events: [], firstEventAt: null };
      scopes.set(key, s);
    }
    return s;
  };

  const store: SimStore = {
    async getInstance(scope) {
      return state(scope).instance;
    },

    async putInstance(scope, instance) {
      const s = state(scope);
      if (!s.instance) s.instance = instance; // the first instance wins
    },

    async listDocuments(scope, filter) {
      const docs = [...state(scope).documents.values()];
      return filter?.docType ? docs.filter((d) => d.docType === filter.docType) : docs;
    },

    async getDocument(scope, id) {
      return state(scope).documents.get(id) ?? null;
    },

    async findByCustReference(scope, docType, custReference) {
      return [...state(scope).documents.values()].filter(
        (d) => d.docType === docType && d.custReference === custReference,
      );
    },

    async getDocumentChain(scope, id) {
      const first = await store.getDocument(scope, id);
      if (!first) return [];
      const chain = [first];
      const seen = new Set([first.id]);
      let cursor = first;
      while (cursor.predecessorId && chain.length < MAX_CHAIN_DEPTH) {
        const previous = await store.getDocument(scope, cursor.predecessorId);
        if (!previous || seen.has(previous.id)) break;
        seen.add(previous.id);
        chain.unshift(previous);
        cursor = previous;
      }
      return chain;
    },

    async createDocument(scope, doc) {
      const s = state(scope);
      if (!s.instance) throw new Error('SIM_INSTANCE_MISSING');
      s.counters[doc.docType] += 1;
      const created: SalesDocument = {
        ...doc,
        id: `${DOC_PREFIX[doc.docType]}-${String(s.counters[doc.docType]).padStart(6, '0')}`,
        assignmentId: s.instance.assignmentId,
        studentKey: scope.learnerKey,
        createdAt: new Date().toISOString(),
      };
      s.documents.set(created.id, created);
      return created;
    },

    async updateDocument(scope, id, patch) {
      const s = state(scope);
      const existing = s.documents.get(id);
      if (!existing) return null;
      const updated: SalesDocument = {
        ...existing,
        ...patch,
        id: existing.id,
        docType: existing.docType,
        studentKey: existing.studentKey,
        assignmentId: existing.assignmentId,
        createdAt: existing.createdAt,
      };
      s.documents.set(id, updated);
      return updated;
    },

    async appendEvent(scope, event) {
      const s = state(scope);
      const now = Date.now();
      if (s.firstEventAt === null) s.firstEventAt = now;
      s.events.push({ type: event.type, docId: event.docId, payload: event.payload, relativeMs: now - s.firstEventAt });
    },

    async purge(scope) {
      scopes.delete(keyOf(scope));
    },
  };
  return store;
}
