/**
 * simDb.ts — SimStore implementation for the embedded SAP simulator.
 *
 * Simulator state is keyed by SimScope { learnerKey, activityId } — the
 * opaque learner key (canvasUuid) and the CAP module id — NOT by session.
 * Sessions are deleted at completion; sim state outlives them so students
 * can revisit finished documents. Every learner item carries a `ttl`
 * (SIM_STATE_TTL_DAYS, provisional 120) for semester-end expiry.
 *
 * DynamoDB table `cap-sim-state`:
 *   pk (String) = learnerKey
 *   sk (String) = `<activityId>#<entity>`
 *     `<activityId>#INSTANCE`          — the AssignmentInstance (incl.
 *                                      server-only fields: seed,
 *                                      expectedNetValue — never returned
 *                                      by any route)
 *     `<activityId>#DOC#<docId>`       — one SalesDocument
 *     `<activityId>#EVT#<seq>`         — one event (absolute occurredAt is
 *                                      retained internally for expiry and
 *                                      relativeMs; nothing reads it back)
 *     `<activityId>#CTR#<name>`        — per-scope counters (doc number
 *                                      sequences per docType, event seq)
 *   ttl (Number) = Unix epoch seconds — on every item in the scope.
 *
 * All queries are pk=learnerKey AND begins_with(sk, `<activityId>#…`), so
 * one learner can never see another's documents — including reference
 * searches (contract rule 3).
 *
 * When USE_LOCAL_DB=true, delegates to the JSON-file store in
 * localStore.ts (same pk/sk item shape).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import type {
  AssignmentInstance, DocType, NewSimEvent,
  SalesDocument, SimScope, SimStore,
} from '@cap/sim-shared';
import { SIM_STATE_TTL_DAYS, USE_LOCAL_DB } from '../config/env';
import { localSimDb } from './localStore';

// ── Key helpers ──────────────────────────────────────────────────────────────

const scopePrefix = (scope: SimScope) => `${scope.activityId}#`;
const DOC_PREFIX: Record<DocType, string> = { inquiry: 'INQ', quotation: 'QUO', order: 'ORD' };
/** Hard caps — chain depth is a safety bound against corrupted predecessor
 *  links; the event cap keeps a runaway client from growing a scope
 *  without limit. */
const MAX_CHAIN_DEPTH = 10;
const MAX_EVENTS_PER_SCOPE = 5000;

interface StoredEvent {
  id: string;
  docId: string | null;
  type: NewSimEvent['type'];
  payload: Record<string, unknown>;
  /** Internal only — never leaves the store (contract rule 4). */
  occurredAt: string;
  relativeMs: number;
}

function ttl(): number {
  return Math.floor(Date.now() / 1000) + SIM_STATE_TTL_DAYS * 24 * 3600;
}

/** Strip store-internal keys so a `doc`/`instance`/`event` value is pure model. */
function unwrap<T>(item: Record<string, unknown> | undefined, field: string): T | null {
  return (item?.[field] as T) ?? null;
}

// ── Shared implementation over a minimal item-table adapter ──────────────────
// The same semantics serve the JSON file and DynamoDB: an "item" is a flat
// record with pk/sk plus a payload field (`instance`, `doc`, `event`, `n`).

interface SimItemTable {
  get(pk: string, sk: string): Promise<Record<string, unknown> | undefined>;
  query(pk: string, skPrefix?: string): Promise<Record<string, unknown>[]>;
  /** false when `ifAbsent` was requested and the item already existed. */
  put(item: Record<string, unknown>, opts?: { ifAbsent?: boolean }): Promise<boolean>;
  /**
   * Atomically returns the next value of a per-scope counter (1, 2, 3…)
   * plus the counter item's full attributes. `setIfAbsent` keys are set
   * only when the counter item lacks them (DynamoDB `if_not_exists`).
   */
  nextSeq(
    pk: string, sk: string, setIfAbsent?: Record<string, unknown>,
  ): Promise<{ seq: number; attrs: Record<string, unknown> }>;
  deleteMany(keys: { pk: string; sk: string }[]): Promise<void>;
}

function makeSimStore(items: SimItemTable): SimStore {
  return {
    async getInstance(scope) {
      return unwrap<AssignmentInstance>(
        await items.get(scope.learnerKey, `${scopePrefix(scope)}INSTANCE`), 'instance');
    },

    async putInstance(scope, instance) {
      // Conditional put — two concurrent first-touches must not let the
      // second writer clobber the first. The stored (first) instance wins;
      // getOrCreateSimInstance re-reads after this call.
      await items.put(
        { pk: scope.learnerKey, sk: `${scopePrefix(scope)}INSTANCE`, instance, ttl: ttl() },
        { ifAbsent: true },
      );
    },

    async listDocuments(scope, filter) {
      const rows = await items.query(scope.learnerKey, `${scopePrefix(scope)}DOC#`);
      let docs = rows.map(r => unwrap<SalesDocument>(r, 'doc')!);
      if (filter?.docType) docs = docs.filter(d => d.docType === filter.docType);
      return docs;
    },

    async getDocument(scope, id) {
      return unwrap<SalesDocument>(
        await items.get(scope.learnerKey, `${scopePrefix(scope)}DOC#${id}`), 'doc');
    },

    async findByCustReference(scope, docType, custReference) {
      const docs = await this.listDocuments(scope, { docType });
      return docs.filter(d => d.custReference === custReference);
    },

    async getDocumentChain(scope, id) {
      const first = await this.getDocument(scope, id);
      if (!first) return [];
      const chain = [first];
      const seen  = new Set([first.id]);
      let cursor  = first;
      // Walk predecessors back to the inquiry. The visited set and depth
      // cap are defensive: route-level validation keeps predecessor links
      // strictly earlier-type, so a cycle can only come from corrupted
      // state — and must still terminate here.
      while (cursor.predecessorId && chain.length < MAX_CHAIN_DEPTH) {
        const prev = await this.getDocument(scope, cursor.predecessorId);
        if (!prev || seen.has(prev.id)) break;
        seen.add(prev.id);
        chain.unshift(prev);
        cursor = prev;
      }
      return chain;
    },

    async createDocument(scope, doc) {
      // assignmentId comes from the stored instance (contract §4 note): the
      // route get-or-creates the instance before calling this, so a missing
      // instance here is a bug, not a state to model.
      const instance = await this.getInstance(scope);
      if (!instance) throw new Error('SIM_INSTANCE_MISSING');
      const { seq } = await items.nextSeq(scope.learnerKey, `${scopePrefix(scope)}CTR#DOC#${doc.docType}`);
      const created: SalesDocument = {
        ...doc,
        id:           `${DOC_PREFIX[doc.docType]}-${String(seq).padStart(6, '0')}`,
        assignmentId: instance.assignmentId,
        studentKey:   scope.learnerKey,
        createdAt:    new Date().toISOString(),
      };
      await items.put({
        pk: scope.learnerKey, sk: `${scopePrefix(scope)}DOC#${created.id}`, doc: created, ttl: ttl(),
      });
      return created;
    },

    async updateDocument(scope, id, patch) {
      const existing = await this.getDocument(scope, id);
      if (!existing) return null;
      // Type, owner, id and creation time never change (contract).
      const updated: SalesDocument = { ...existing, ...patch, id: existing.id,
        docType: existing.docType, studentKey: existing.studentKey,
        assignmentId: existing.assignmentId, createdAt: existing.createdAt };
      await items.put({
        pk: scope.learnerKey, sk: `${scopePrefix(scope)}DOC#${id}`, doc: updated, ttl: ttl(),
      });
      return updated;
    },

    async appendEvent(scope, event) {
      const occurredAt = new Date().toISOString();
      // relativeMs is measured from the scope's first event — the counter
      // item sets firstAt atomically on its first update (if_not_exists),
      // so nothing has to re-scan the event list.
      const { seq, attrs } = await items.nextSeq(
        scope.learnerKey, `${scopePrefix(scope)}CTR#EVT`, { firstAt: occurredAt });
      if (seq > MAX_EVENTS_PER_SCOPE) throw new Error('SIM_EVENT_LIMIT');
      const firstAt = (attrs.firstAt as string) ?? occurredAt;
      const stored: StoredEvent = {
        id: uuidv4(), docId: event.docId ?? null, type: event.type,
        payload: event.payload ?? {}, occurredAt,
        relativeMs: Math.max(0, Date.parse(occurredAt) - Date.parse(firstAt)),
      };
      await items.put({
        pk: scope.learnerKey, sk: `${scopePrefix(scope)}EVT#${String(seq).padStart(10, '0')}`,
        event: stored, ttl: ttl(),
      });
    },

    async purge(scope) {
      const rows = await items.query(scope.learnerKey, scopePrefix(scope));
      await items.deleteMany(rows.map(r => ({ pk: r.pk as string, sk: r.sk as string })));
    },
  };
}

// ── DynamoDB adapter ─────────────────────────────────────────────────────────

const ddb   = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE = process.env.DYNAMODB_TABLE_SIM_STATE!;

const ddbItems: SimItemTable = {
  async get(pk, sk) {
    // Strongly consistent — a read right after a save must not miss.
    const r = await ddb.send(new GetCommand({
      TableName: TABLE, Key: { pk, sk }, ConsistentRead: true,
    }));
    return r.Item;
  },
  async query(pk, skPrefix) {
    const out: Record<string, unknown>[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const r = await ddb.send(new QueryCommand({
        TableName: TABLE,
        ConsistentRead: true,
        KeyConditionExpression: skPrefix
          ? 'pk = :pk AND begins_with(sk, :pfx)' : 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk, ...(skPrefix ? { ':pfx': skPrefix } : {}) },
        ExclusiveStartKey,
      }));
      out.push(...(r.Items ?? []));
      ExclusiveStartKey = r.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  },
  async put(item, opts) {
    try {
      await ddb.send(new PutCommand({
        TableName: TABLE, Item: item,
        ...(opts?.ifAbsent
          ? { ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)' }
          : {}),
      }));
      return true;
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  },
  async nextSeq(pk, sk, setIfAbsent) {
    const extraKeys  = Object.keys(setIfAbsent ?? {});
    const setExprs   = extraKeys.map(k => `#s_${k} = if_not_exists(#s_${k}, :s_${k})`);
    const r = await ddb.send(new UpdateCommand({
      TableName: TABLE, Key: { pk, sk },
      UpdateExpression:
        `ADD n :one SET #ttl = :ttl${setExprs.length ? ', ' + setExprs.join(', ') : ''}`,
      ExpressionAttributeNames: {
        '#ttl': 'ttl',
        ...Object.fromEntries(extraKeys.map(k => [`#s_${k}`, k])),
      },
      ExpressionAttributeValues: {
        ':one': 1, ':ttl': ttl(),
        ...Object.fromEntries(extraKeys.map(k => [`:s_${k}`, setIfAbsent![k]])),
      },
      ReturnValues: 'ALL_NEW',
    }));
    return { seq: r.Attributes!.n as number, attrs: r.Attributes! };
  },
  async deleteMany(keys) {
    for (let i = 0; i < keys.length; i += 25) {
      const chunk = keys.slice(i, i + 25);
      await ddb.send(new BatchWriteCommand({
        RequestItems: { [TABLE]: chunk.map(Key => ({ DeleteRequest: { Key } })) },
      }));
    }
  },
};

// Local adapter lives in localStore.ts with the other local tables; it
// implements the same SimItemTable adapter.
export const simStore: SimStore = USE_LOCAL_DB ? makeSimStore(localSimDb) : makeSimStore(ddbItems);
