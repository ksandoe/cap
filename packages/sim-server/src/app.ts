import express from 'express';
import cors from 'cors';
import type { SalesDocument, SimVerificationResult } from '@sap-sim/shared';
import { PILOT_ASSIGNMENT, getMaterial, priceDocument } from '@sap-sim/engine';
import { getOrCreateAssignmentInstance } from './repo/assignmentInstances';
import { createDocument, findByCustReference, findDocuments, getDocument, getDocumentChain, updateDocument } from './repo/documents';
import { logEvent } from './repo/events';
import { getFlowProgress, saveFlowProgress } from './repo/flowProgress';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 4100;

// Single pilot assignment for this PoC — docs/architecture-proposal.md §3b.
const assignment = PILOT_ASSIGNMENT;

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/assignment', (_req, res) => {
  res.json({ id: assignment.id, title: assignment.title });
});

app.get('/api/assignment-instance', (req, res) => {
  const studentKey = String(req.query.studentKey ?? '');
  if (!studentKey) return res.status(400).json({ error: 'studentKey is required' });
  const instance = getOrCreateAssignmentInstance(assignment, studentKey);
  res.json(instance);
});

app.get('/api/documents', (req, res) => {
  const studentKey = String(req.query.studentKey ?? '');
  const docType = req.query.docType as SalesDocument['docType'] | undefined;
  if (!studentKey) return res.status(400).json({ error: 'studentKey is required' });
  res.json(findDocuments({ studentKey, assignmentId: assignment.id, docType }));
});

app.get('/api/documents/search-by-reference', (req, res) => {
  const docType = req.query.docType as SalesDocument['docType'];
  const custReference = String(req.query.custReference ?? '');
  if (!docType || !custReference) return res.status(400).json({ error: 'docType and custReference are required' });
  res.json(findByCustReference({ assignmentId: assignment.id, docType, custReference }));
});

app.get('/api/documents/:id', (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });
  res.json(doc);
});

app.get('/api/document-flow/:id', (req, res) => {
  res.json(getDocumentChain(req.params.id));
});

function repriceDocument(doc: Pick<SalesDocument, 'items' | 'headerConditions'>): { items: SalesDocument['items']; netValue: number } {
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

app.post('/api/documents', (req, res) => {
  const body = req.body as Omit<SalesDocument, 'id' | 'createdAt' | 'netValue' | 'items'> & {
    items: SalesDocument['items'];
  };
  const priced = repriceDocument(body);
  const doc = createDocument({ ...body, assignmentId: assignment.id, items: priced.items, netValue: priced.netValue });
  res.status(201).json(doc);
});

app.patch('/api/documents/:id', (req, res) => {
  const patch = req.body as Partial<SalesDocument>;
  const current = getDocument(req.params.id);
  if (!current) return res.status(404).json({ error: 'not found' });
  const merged = { ...current, ...patch };
  const priced = repriceDocument(merged);
  const doc = updateDocument(req.params.id, { ...patch, items: priced.items, netValue: priced.netValue });
  res.json(doc);
});

app.post('/api/events', (req, res) => {
  const event = logEvent({ ...req.body, assignmentId: assignment.id });
  res.status(201).json(event);
});

app.get('/api/flow-progress', (req, res) => {
  const studentKey = String(req.query.studentKey ?? '');
  if (!studentKey) return res.status(400).json({ error: 'studentKey is required' });
  res.json(getFlowProgress(studentKey, assignment.id));
});

app.post('/api/flow-progress', (req, res) => {
  const { studentKey, currentBlockIndex, furthestBlockIndex } = req.body;
  res.json(saveFlowProgress({ studentKey, assignmentId: assignment.id, currentBlockIndex, furthestBlockIndex }));
});

// CAP integration contract — docs/architecture-proposal.md §7.
app.get('/api/verify', (req, res) => {
  const studentKey = String(req.query.studentKey ?? '');
  if (!studentKey) return res.status(400).json({ error: 'studentKey is required' });

  const instance = getOrCreateAssignmentInstance(assignment, studentKey);
  const docs = findDocuments({ studentKey, assignmentId: assignment.id });
  const docTypes: SalesDocument['docType'][] = ['inquiry', 'quotation', 'order'];

  const documents = docTypes.map((docType) => {
    const doc = docs.find((d) => d.docType === docType && d.status === 'complete');
    const expectedNetValue = instance.expectedNetValue[docType];
    return {
      docType,
      docId: doc?.id ?? null,
      exists: Boolean(doc),
      ownedByStudent: doc ? doc.studentKey === studentKey : false,
      netValue: doc?.netValue ?? null,
      expectedNetValue,
      netValueMatches: doc ? Math.abs(doc.netValue - expectedNetValue) < 0.01 : false,
    };
  });

  const result: SimVerificationResult = {
    allPresent: documents.every((d) => d.exists),
    foundDocs: documents.filter((d) => d.docId).map((d) => d.docId as string),
    missingTypes: documents.filter((d) => !d.exists).map((d) => d.docType),
    documents,
  };
  res.json(result);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`sap-sim server listening on http://localhost:${PORT}`);
});
