import { v4 as uuidv4 } from 'uuid';
import type { SalesDocument, DocType } from '@sap-sim/shared';
import { db } from '../db';

interface Row {
  id: string;
  docType: string;
  assignmentId: string;
  studentKey: string;
  predecessorId: string | null;
  customerId: string;
  custReference: string;
  custReferenceDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  requestedDeliveryDate: string | null;
  itemsJson: string;
  headerConditionsJson: string;
  netValue: number;
  status: string;
  createdAt: string;
  savedAt: string | null;
}

function rowToDocument(row: Row): SalesDocument {
  return {
    id: row.id,
    docType: row.docType as DocType,
    assignmentId: row.assignmentId,
    studentKey: row.studentKey,
    predecessorId: row.predecessorId,
    customerId: row.customerId,
    custReference: row.custReference,
    custReferenceDate: row.custReferenceDate ?? '',
    validFrom: row.validFrom,
    validTo: row.validTo,
    requestedDeliveryDate: row.requestedDeliveryDate,
    items: JSON.parse(row.itemsJson),
    headerConditions: JSON.parse(row.headerConditionsJson),
    netValue: row.netValue,
    status: row.status as SalesDocument['status'],
    createdAt: row.createdAt,
    savedAt: row.savedAt,
  };
}

const DOC_PREFIX: Record<DocType, string> = { inquiry: 'INQ', quotation: 'QUO', order: 'ORD' };

function nextDocNumber(docType: DocType): string {
  const row = db.prepare('SELECT COUNT(*) as n FROM sales_documents WHERE docType = ?').get(docType) as { n: number };
  return `${DOC_PREFIX[docType]}-${String(row.n + 1).padStart(6, '0')}`;
}

export function createDocument(input: Omit<SalesDocument, 'id' | 'createdAt'>): SalesDocument {
  const doc: SalesDocument = { ...input, id: nextDocNumber(input.docType), createdAt: new Date().toISOString() };
  db.prepare(
    `INSERT INTO sales_documents
       (id, docType, assignmentId, studentKey, predecessorId, customerId, custReference, custReferenceDate,
        validFrom, validTo, requestedDeliveryDate, itemsJson, headerConditionsJson, netValue, status, createdAt, savedAt)
     VALUES (@id, @docType, @assignmentId, @studentKey, @predecessorId, @customerId, @custReference, @custReferenceDate,
             @validFrom, @validTo, @requestedDeliveryDate, @itemsJson, @headerConditionsJson, @netValue, @status, @createdAt, @savedAt)`,
  ).run({
    ...doc,
    itemsJson: JSON.stringify(doc.items),
    headerConditionsJson: JSON.stringify(doc.headerConditions),
    savedAt: doc.savedAt ?? null,
  });
  return doc;
}

export function updateDocument(id: string, patch: Partial<Omit<SalesDocument, 'id' | 'createdAt'>>): SalesDocument {
  const current = getDocument(id);
  if (!current) throw new Error(`Document not found: ${id}`);
  const updated: SalesDocument = { ...current, ...patch };
  db.prepare(
    `UPDATE sales_documents SET
       predecessorId = @predecessorId, customerId = @customerId, custReference = @custReference,
       custReferenceDate = @custReferenceDate, validFrom = @validFrom, validTo = @validTo,
       requestedDeliveryDate = @requestedDeliveryDate, itemsJson = @itemsJson,
       headerConditionsJson = @headerConditionsJson, netValue = @netValue, status = @status, savedAt = @savedAt
     WHERE id = @id`,
  ).run({
    ...updated,
    itemsJson: JSON.stringify(updated.items),
    headerConditionsJson: JSON.stringify(updated.headerConditions),
  });
  return updated;
}

export function getDocument(id: string): SalesDocument | null {
  const row = db.prepare('SELECT * FROM sales_documents WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToDocument(row) : null;
}

export function findDocuments(filter: { studentKey: string; assignmentId: string; docType?: DocType }): SalesDocument[] {
  const rows = filter.docType
    ? (db
        .prepare('SELECT * FROM sales_documents WHERE studentKey = ? AND assignmentId = ? AND docType = ? ORDER BY createdAt DESC')
        .all(filter.studentKey, filter.assignmentId, filter.docType) as Row[])
    : (db
        .prepare('SELECT * FROM sales_documents WHERE studentKey = ? AND assignmentId = ? ORDER BY createdAt DESC')
        .all(filter.studentKey, filter.assignmentId) as Row[]);
  return rows.map(rowToDocument);
}

/** Create-with-reference search: find a predecessor document by Customer Reference (PO number) — §3c. */
export function findByCustReference(params: {
  assignmentId: string;
  docType: DocType;
  custReference: string;
}): SalesDocument[] {
  const rows = db
    .prepare('SELECT * FROM sales_documents WHERE assignmentId = ? AND docType = ? AND custReference = ?')
    .all(params.assignmentId, params.docType, params.custReference) as Row[];
  return rows.map(rowToDocument);
}

/** Walk predecessorId back from a document to build the full chain, inquiry first. */
export function getDocumentChain(docId: string): SalesDocument[] {
  const chain: SalesDocument[] = [];
  let current = getDocument(docId);
  while (current) {
    chain.unshift(current);
    current = current.predecessorId ? getDocument(current.predecessorId) : null;
  }
  return chain;
}
