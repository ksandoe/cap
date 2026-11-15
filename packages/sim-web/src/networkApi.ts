import type { AppEvent, AssignmentInstance, DocType, EventType, FlowProgress, SalesDocument } from '@sap-sim/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  return res.json();
}

export function getAssignmentInstance(studentKey: string): Promise<AssignmentInstance> {
  return request(`/assignment-instance?studentKey=${encodeURIComponent(studentKey)}`);
}

export function listDocuments(studentKey: string, docType?: DocType): Promise<SalesDocument[]> {
  const q = docType ? `&docType=${docType}` : '';
  return request(`/documents?studentKey=${encodeURIComponent(studentKey)}${q}`);
}

export function getDocument(id: string): Promise<SalesDocument> {
  return request(`/documents/${id}`);
}

export function searchByReference(docType: DocType, custReference: string): Promise<SalesDocument[]> {
  return request(`/documents/search-by-reference?docType=${docType}&custReference=${encodeURIComponent(custReference)}`);
}

export function createDocument(doc: Omit<SalesDocument, 'id' | 'createdAt' | 'netValue'>): Promise<SalesDocument> {
  return request('/documents', { method: 'POST', body: JSON.stringify(doc) });
}

export function updateDocument(id: string, patch: Partial<SalesDocument>): Promise<SalesDocument> {
  return request(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function getDocumentFlow(id: string): Promise<SalesDocument[]> {
  return request(`/document-flow/${id}`);
}

export function getFlowProgress(studentKey: string): Promise<FlowProgress> {
  return request(`/flow-progress?studentKey=${encodeURIComponent(studentKey)}`);
}

export function saveFlowProgress(progress: FlowProgress): Promise<FlowProgress> {
  return request('/flow-progress', { method: 'POST', body: JSON.stringify(progress) });
}

export function logEvent(studentKey: string, type: EventType, payload?: Record<string, unknown>, docId?: string | null): void {
  // Fire-and-forget — the event log (§6) should never block the student's flow.
  request('/events', { method: 'POST', body: JSON.stringify({ studentKey, type, payload, docId }) }).catch(() => {
    /* non-critical */
  });
}

export type { AppEvent };
