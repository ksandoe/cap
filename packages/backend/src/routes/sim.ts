/**
 * sim.ts — Simulator routes (work package 1, contract §4.3).
 *
 * Mounted at /sim behind authMiddleware. The learner key and activity come
 * from the session JWT only — the browser never supplies them (contract
 * rule 1). Every response is a Public* projection: no learnerKey, no seed,
 * no expectedNetValue (rule 2).
 *
 *   403 SIM_SCOPE_REQUIRED — token has no learner key / module, or is an
 *      admin token (role claim). Unknown ids and foreign-scope ids answer
 *   404 NOT_FOUND with the same body.
 *   404 SIM_NOT_CONFIGURED — the module is not a sim activity or its
 *      simAssignmentId doesn't resolve in the registry.
 *   400 INVALID_*        — malformed document/event bodies: only whitelisted
 *      fields are accepted, values are validated, and predecessor links
 *      must point at an existing in-scope document of an earlier type
 *      (inquiry < quotation < order).
 *   429 SIM_EVENT_LIMIT  — the scope's event cap is reached.
 *
 * Register search-by-reference before /documents/:id or Express reads
 * "search-by-reference" as an id.
 */
import { Request, Response, NextFunction } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import type {
  AppliedCondition, ConditionCode, DocType, EventType, NewSalesDocumentInput,
  NewSimEvent, SalesDocumentItem, SalesDocumentPatch, SimActivityDefinition,
  SimScope,
} from '@cap/sim-shared';
import { MATERIALS } from '@cap/sim-engine';
import { simStore } from '../db/simDb';
import {
  getOrCreateSimInstance, repriceDocument, resolveActivity, toPublicDocument,
  toPublicInstance,
} from '../services/sim/simService';

export const simRouter = asyncRouter();

const DOC_TYPES: DocType[]       = ['inquiry', 'quotation', 'order'];
const DOC_ORDER                  = new Map(DOC_TYPES.map((t, i) => [t, i]));
const CONDITION_CODES: ConditionCode[] = ['K004', 'RA00'];
const MATERIAL_IDS               = new Set(MATERIALS.map(m => m.id));
const EVENT_TYPES = new Set<EventType>([
  'assignment_started', 'step_viewed', 'field_error_shown', 'warning_shown',
  'warning_acknowledged', 'document_saved', 'document_save_blocked',
  'document_resumed', 'search_dialog_opened', 'search_dialog_selected',
  'create_with_reference_used', 'document_flow_viewed', 'block_entered',
  'menu_navigated',
]);
const MAX_ITEMS              = 20;
const MAX_CONDITIONS         = 10;
const MAX_EVENT_PAYLOAD_BYTES = 2048;

class BadRequest extends Error {}

const bad = (msg: string) => new BadRequest(msg);

const optStr = (v: unknown, name: string, maxLen = 200): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length > maxLen) throw bad(`${name} must be a string (≤${maxLen})`);
  return v;
};

const reqStr = (v: unknown, name: string, maxLen = 200): string => {
  const s = optStr(v, name, maxLen);
  if (s === null || !s.trim()) throw bad(`${name} is required`);
  return s;
};

function parseCondition(raw: unknown, name: string): AppliedCondition {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw bad(`${name}: condition must be an object`);
  const c = raw as Record<string, unknown>;
  if (!CONDITION_CODES.includes(c.conditionCode as ConditionCode))
    throw bad(`${name}: conditionCode must be one of ${CONDITION_CODES.join(', ')}`);
  if (!Number.isFinite(c.amount)) throw bad(`${name}: amount must be a finite number`);
  if (typeof c.active !== 'boolean') throw bad(`${name}: active must be a boolean`);
  return { conditionCode: c.conditionCode as ConditionCode, amount: c.amount as number, active: c.active };
}

function parseConditions(raw: unknown, name: string): AppliedCondition[] {
  if (!Array.isArray(raw) || raw.length > MAX_CONDITIONS)
    throw bad(`${name} must be an array of at most ${MAX_CONDITIONS} conditions`);
  return raw.map((c, i) => parseCondition(c, `${name}[${i}]`));
}

function parseItems(raw: unknown): SalesDocumentItem[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_ITEMS)
    throw bad(`items must be an array of 1–${MAX_ITEMS} entries`);
  return raw.map((it, i) => {
    if (typeof it !== 'object' || it === null || Array.isArray(it))
      throw bad(`items[${i}] must be an object`);
    const item = it as Record<string, unknown>;
    if (typeof item.materialId !== 'string' || !MATERIAL_IDS.has(item.materialId))
      throw bad(`items[${i}].materialId is not a known material`);
    if (!Number.isInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 9999)
      throw bad(`items[${i}].quantity must be an integer from 1 to 9999`);
    const op = item.orderProbability;
    if (op !== undefined && op !== null &&
        (!Number.isFinite(op) || (op as number) < 0 || (op as number) > 100))
      throw bad(`items[${i}].orderProbability must be null or a number from 0 to 100`);
    return {
      lineNumber:      Number.isInteger(item.lineNumber) ? item.lineNumber as number : (i + 1) * 10,
      materialId:      item.materialId,
      quantity:        item.quantity as number,
      orderProbability: op === undefined ? null : op as number | null,
      itemConditions:  item.itemConditions === undefined
        ? [] : parseConditions(item.itemConditions, `items[${i}].itemConditions`),
      itemNetValue:    0, // repriced server-side
    };
  });
}

/** Whitelist + validate a POST body into a NewSalesDocumentInput. */
function parseNewDocument(body: unknown): NewSalesDocumentInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw bad('request body must be a document object');
  const b = body as Record<string, unknown>;
  if (!DOC_TYPES.includes(b.docType as DocType))
    throw bad(`docType must be one of ${DOC_TYPES.join(', ')}`);
  const status = b.status ?? 'in_progress';
  if (status !== 'in_progress' && status !== 'complete')
    throw bad("status must be 'in_progress' or 'complete'");
  if (!Array.isArray(b.headerConditions))
    throw bad('headerConditions must be an array');
  return {
    docType:               b.docType as DocType,
    predecessorId:         optStr(b.predecessorId, 'predecessorId'),
    customerId:            reqStr(b.customerId, 'customerId'),
    custReference:         reqStr(b.custReference, 'custReference'),
    custReferenceDate:     reqStr(b.custReferenceDate, 'custReferenceDate'),
    validFrom:             optStr(b.validFrom, 'validFrom'),
    validTo:               optStr(b.validTo, 'validTo'),
    requestedDeliveryDate: optStr(b.requestedDeliveryDate, 'requestedDeliveryDate'),
    items:                 parseItems(b.items),
    headerConditions:      parseConditions(b.headerConditions, 'headerConditions'),
    status,
    savedAt:               optStr(b.savedAt, 'savedAt'),
  };
}

/**
 * Predecessor links may only point backward in the flow (quotation →
 * inquiry, order → quotation or inquiry). The referenced document must
 * exist in this scope — a foreign-scope id is indistinguishable from an
 * unknown one, and either way it is a client error.
 */
async function checkPredecessor(
  scope: SimScope, docType: DocType, predecessorId: string | null,
): Promise<void> {
  if (predecessorId === null) return;
  const pred = await simStore.getDocument(scope, predecessorId);
  if (!pred) throw bad('predecessorId does not reference an existing document');
  if (DOC_ORDER.get(pred.docType)! >= DOC_ORDER.get(docType)!)
    throw bad('predecessorId must reference an earlier document type (inquiry < quotation < order)');
}

/** Whitelist + validate a PATCH body into a SalesDocumentPatch. */
async function parsePatch(
  body: unknown, scope: SimScope, docType: DocType,
): Promise<SalesDocumentPatch> {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw bad('request body must be an object');
  const b      = body as Record<string, unknown>;
  const patch: SalesDocumentPatch = {};
  if ('items' in b)             patch.items = parseItems(b.items);
  if ('headerConditions' in b) {
    if (!Array.isArray(b.headerConditions)) throw bad('headerConditions must be an array');
    patch.headerConditions = parseConditions(b.headerConditions, 'headerConditions');
  }
  if ('predecessorId' in b) {
    patch.predecessorId = optStr(b.predecessorId, 'predecessorId');
    await checkPredecessor(scope, docType, patch.predecessorId);
  }
  if ('customerId' in b)            patch.customerId = reqStr(b.customerId, 'customerId');
  if ('custReference' in b)         patch.custReference = reqStr(b.custReference, 'custReference');
  if ('custReferenceDate' in b)     patch.custReferenceDate = reqStr(b.custReferenceDate, 'custReferenceDate');
  if ('validFrom' in b)             patch.validFrom = optStr(b.validFrom, 'validFrom');
  if ('validTo' in b)               patch.validTo = optStr(b.validTo, 'validTo');
  if ('requestedDeliveryDate' in b) patch.requestedDeliveryDate = optStr(b.requestedDeliveryDate, 'requestedDeliveryDate');
  if ('savedAt' in b)               patch.savedAt = optStr(b.savedAt, 'savedAt');
  if ('status' in b) {
    if (b.status !== 'in_progress' && b.status !== 'complete')
      throw bad("status must be 'in_progress' or 'complete'");
    patch.status = b.status;
  }
  return patch;
}

function parseEvent(body: unknown): NewSimEvent {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw bad('request body must be an event object');
  const b = body as Record<string, unknown>;
  if (!EVENT_TYPES.has(b.type as EventType)) throw bad('type must be a known event type');
  if (b.docId !== undefined && b.docId !== null && typeof b.docId !== 'string')
    throw bad('docId must be a string or null');
  const payload = (b.payload ?? {}) as Record<string, unknown>;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    throw bad('payload must be an object');
  if (JSON.stringify(payload).length > MAX_EVENT_PAYLOAD_BYTES)
    throw bad(`payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`);
  return { type: b.type as EventType, docId: (b.docId as string | null) ?? null, payload };
}

interface SimLocals { scope: SimScope; definition: SimActivityDefinition }

/** Derive the scope from the token and resolve the module's sim activity. */
async function simContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const claims = req.session;
  if (!claims || claims.role || !claims.canvasUuid || !claims.moduleId) {
    res.status(403).json({ error: 'SIM_SCOPE_REQUIRED' });
    return;
  }
  const { kind, definition } = await resolveActivity(claims.moduleId);
  if (kind !== 'sim' || !definition) {
    res.status(404).json({ error: 'SIM_NOT_CONFIGURED' });
    return;
  }
  res.locals.sim = { scope: { learnerKey: claims.canvasUuid, activityId: claims.moduleId }, definition } satisfies SimLocals;
  next();
}

/** Map a BadRequest to 400; anything else goes to the error handler. */
const wrap400 = (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try { await fn(req, res); }
    catch (err) {
      if (err instanceof BadRequest) { res.status(400).json({ error: 'INVALID_INPUT', message: err.message }); return; }
      if (err instanceof Error && err.message === 'SIM_EVENT_LIMIT') {
        res.status(429).json({ error: 'SIM_EVENT_LIMIT' }); return;
      }
      next(err);
    }
  };

simRouter.use(simContext);
const locals = (res: Response): SimLocals => res.locals.sim;

// NOTE: search-by-reference must precede /documents/:id.
simRouter.get('/instance', wrap400(async (_req, res) => {
  const { scope, definition } = locals(res);
  const instance = await getOrCreateSimInstance(scope, definition);
  res.json(toPublicInstance(instance));
}));

simRouter.get('/documents', wrap400(async (req, res) => {
  const { scope } = locals(res);
  const docType = req.query.docType as DocType | undefined;
  if (docType && !DOC_TYPES.includes(docType)) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'docType must be one of ' + DOC_TYPES.join(', ') });
    return;
  }
  const docs = await simStore.listDocuments(scope, docType ? { docType } : undefined);
  res.json(toPublicDocument(docs));
}));

simRouter.get('/documents/search-by-reference', wrap400(async (req, res) => {
  const { scope } = locals(res);
  const docType       = req.query.docType as DocType | undefined;
  const custReference = req.query.custReference as string | undefined;
  if (!docType || !DOC_TYPES.includes(docType) || !custReference) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'docType and custReference are required' });
    return;
  }
  res.json(toPublicDocument(await simStore.findByCustReference(scope, docType, custReference)));
}));

simRouter.get('/documents/:id', wrap400(async (req, res) => {
  const { scope } = locals(res);
  const doc = await simStore.getDocument(scope, req.params.id);
  if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json(toPublicDocument(doc));
}));

simRouter.get('/document-flow/:id', wrap400(async (req, res) => {
  const { scope } = locals(res);
  res.json(toPublicDocument(await simStore.getDocumentChain(scope, req.params.id)));
}));

simRouter.post('/documents', wrap400(async (req, res) => {
  const { scope, definition } = locals(res);
  const input = parseNewDocument(req.body);
  await checkPredecessor(scope, input.docType, input.predecessorId);
  // A student can post a document before any read — the instance must exist
  // so the store can bind assignmentId (contract §4 note).
  await getOrCreateSimInstance(scope, definition);
  const priced = repriceDocument(input);
  const doc = await simStore.createDocument(scope, {
    ...input, items: priced.items, netValue: priced.netValue,
  });
  res.status(201).json(toPublicDocument(doc));
}));

simRouter.patch('/documents/:id', wrap400(async (req, res) => {
  const { scope } = locals(res);
  const current = await simStore.getDocument(scope, req.params.id);
  if (!current) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  const patch  = await parsePatch(req.body, scope, current.docType);
  const merged = { ...current, ...patch };
  const priced = repriceDocument(merged);
  const doc = await simStore.updateDocument(scope, req.params.id, {
    ...patch, items: priced.items, netValue: priced.netValue,
  });
  res.json(toPublicDocument(doc!));
}));

simRouter.post('/events', wrap400(async (req, res) => {
  const { scope } = locals(res);
  const event = parseEvent(req.body);
  await simStore.appendEvent(scope, event);
  res.status(201).json({ ok: true });
}));
