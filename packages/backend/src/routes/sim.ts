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
 *
 * Register search-by-reference before /documents/:id or Express reads
 * "search-by-reference" as an id.
 */
import { Request, Response, NextFunction } from 'express';
import { asyncRouter } from '../middleware/asyncRouter';
import type {
  DocType, NewSalesDocumentInput, NewSimEvent, SalesDocumentPatch,
  SimActivityDefinition, SimScope,
} from '@cap/sim-shared';
import { simStore } from '../db/simDb';
import {
  getOrCreateSimInstance, repriceDocument, resolveActivity, toPublicDocument,
  toPublicInstance,
} from '../services/sim/simService';

export const simRouter = asyncRouter();

const DOC_TYPES: DocType[] = ['inquiry', 'quotation', 'order'];

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

simRouter.use(simContext);
const locals = (res: Response): SimLocals => res.locals.sim;

// NOTE: search-by-reference must precede /documents/:id.
simRouter.get('/instance', async (_req, res) => {
  const { scope, definition } = locals(res);
  const instance = await getOrCreateSimInstance(scope, definition);
  res.json(toPublicInstance(instance));
});

simRouter.get('/documents', async (req, res) => {
  const { scope } = locals(res);
  const docType = req.query.docType as DocType | undefined;
  if (docType && !DOC_TYPES.includes(docType)) {
    res.status(400).json({ error: 'INVALID_DOC_TYPE' });
    return;
  }
  const docs = await simStore.listDocuments(scope, docType ? { docType } : undefined);
  res.json(toPublicDocument(docs));
});

simRouter.get('/documents/search-by-reference', async (req, res) => {
  const { scope } = locals(res);
  const docType       = req.query.docType as DocType | undefined;
  const custReference = req.query.custReference as string | undefined;
  if (!docType || !DOC_TYPES.includes(docType) || !custReference) {
    res.status(400).json({ error: 'docType and custReference are required' });
    return;
  }
  res.json(toPublicDocument(await simStore.findByCustReference(scope, docType, custReference)));
});

simRouter.get('/documents/:id', async (req, res) => {
  const { scope } = locals(res);
  const doc = await simStore.getDocument(scope, req.params.id);
  if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  res.json(toPublicDocument(doc));
});

simRouter.get('/document-flow/:id', async (req, res) => {
  const { scope } = locals(res);
  res.json(toPublicDocument(await simStore.getDocumentChain(scope, req.params.id)));
});

simRouter.post('/documents', async (req, res) => {
  const { scope, definition } = locals(res);
  const input = req.body as NewSalesDocumentInput;
  if (!input || !DOC_TYPES.includes(input.docType) || !Array.isArray(input.items)) {
    res.status(400).json({ error: 'INVALID_DOCUMENT' });
    return;
  }
  // A student can post a document before any read — the instance must exist
  // so the store can bind assignmentId (contract §4 note).
  await getOrCreateSimInstance(scope, definition);
  const priced = repriceDocument(input);
  const doc = await simStore.createDocument(scope, {
    ...input, items: priced.items, netValue: priced.netValue,
  });
  res.status(201).json(toPublicDocument(doc));
});

simRouter.patch('/documents/:id', async (req, res) => {
  const { scope } = locals(res);
  const patch = req.body as SalesDocumentPatch;
  const current = await simStore.getDocument(scope, req.params.id);
  if (!current) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
  const merged = { ...current, ...patch };
  const priced = repriceDocument(merged);
  const doc = await simStore.updateDocument(scope, req.params.id, {
    ...patch, items: priced.items, netValue: priced.netValue,
  });
  res.json(toPublicDocument(doc!));
});

simRouter.post('/events', async (req, res) => {
  const { scope } = locals(res);
  const event = req.body as NewSimEvent;
  if (!event?.type) { res.status(400).json({ error: 'INVALID_EVENT' }); return; }
  await simStore.appendEvent(scope, {
    type: event.type, docId: event.docId ?? null, payload: event.payload ?? {},
  });
  res.status(201).json({ ok: true });
});
