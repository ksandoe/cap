import type { AppEvent, AssignmentInstance, DocType, EventType, FlowProgress, SalesDocument } from '@sap-sim/shared';
import * as networkApi from './networkApi';
import * as localApi from './localApi';

// Deployed builds (Amplify Hosting) have no server to talk to — VITE_LOCAL_STORAGE_MODE, set in
// the Amplify build environment only, switches every call below to the localStorage-backed
// implementation instead. Local `npm run dev` is untouched and keeps hitting the real server.
const impl = import.meta.env.VITE_LOCAL_STORAGE_MODE === 'true' ? localApi : networkApi;

export function getAssignmentInstance(studentKey: string): Promise<AssignmentInstance> {
  return impl.getAssignmentInstance(studentKey);
}

export function listDocuments(studentKey: string, docType?: DocType): Promise<SalesDocument[]> {
  return impl.listDocuments(studentKey, docType);
}

export function getDocument(id: string): Promise<SalesDocument> {
  return impl.getDocument(id);
}

export function searchByReference(docType: DocType, custReference: string): Promise<SalesDocument[]> {
  return impl.searchByReference(docType, custReference);
}

export function createDocument(doc: Omit<SalesDocument, 'id' | 'createdAt' | 'netValue'>): Promise<SalesDocument> {
  return impl.createDocument(doc);
}

export function updateDocument(id: string, patch: Partial<SalesDocument>): Promise<SalesDocument> {
  return impl.updateDocument(id, patch);
}

export function getDocumentFlow(id: string): Promise<SalesDocument[]> {
  return impl.getDocumentFlow(id);
}

export function getFlowProgress(studentKey: string): Promise<FlowProgress> {
  return impl.getFlowProgress(studentKey);
}

export function saveFlowProgress(progress: FlowProgress): Promise<FlowProgress> {
  return impl.saveFlowProgress(progress);
}

export function logEvent(studentKey: string, type: EventType, payload?: Record<string, unknown>, docId?: string | null): void {
  impl.logEvent(studentKey, type, payload, docId);
}

export type { AppEvent };
