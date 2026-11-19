import type { DocType, EventType, FlowProgress, SimApi } from '@cap/sim-shared';
import { toPublicDocument, toPublicInstance } from '@cap/sim-engine';
import * as networkApi from './networkApi';
import * as localApi from './localApi';

/**
 * The standalone app's data access: a `SimApi` plus the intro, background and conclusion flow that only
 * the standalone shell has. Deployed builds (Amplify Hosting) have no server, so VITE_LOCAL_STORAGE_MODE,
 * set in the Amplify build environment only, switches everything to the browser-storage implementation.
 * Local `npm run dev:sim` keeps using the standalone sim server.
 *
 * The learner key lives here and only here: it is bound once when the api is created, and no screen sees it.
 */
export interface StandaloneApi extends SimApi {
  getFlowProgress(): Promise<FlowProgress>;
  saveFlowProgress(progress: Omit<FlowProgress, 'studentKey'>): Promise<FlowProgress>;
}

export function createStandaloneApi(studentKey: string): StandaloneApi {
  const impl = import.meta.env.VITE_LOCAL_STORAGE_MODE === 'true' ? localApi : networkApi;

  // The assignment id is part of what these implementations store with a document.
  let assignmentId: string | null = null;
  const getAssignmentId = async () => {
    if (!assignmentId) assignmentId = (await impl.getAssignmentInstance(studentKey)).assignmentId;
    return assignmentId;
  };

  return {
    async getInstance() {
      const instance = await impl.getAssignmentInstance(studentKey);
      assignmentId = instance.assignmentId;
      return toPublicInstance(instance);
    },

    async listDocuments(docType?: DocType) {
      return toPublicDocument(await impl.listDocuments(studentKey, docType));
    },

    async getDocument(id) {
      return toPublicDocument(await impl.getDocument(id));
    },

    async searchByReference(docType, custReference) {
      // These implementations search every learner's documents; the contract says own documents only.
      const found = await impl.searchByReference(docType, custReference);
      return toPublicDocument(found.filter((d) => d.studentKey === studentKey));
    },

    async createDocument(doc) {
      return toPublicDocument(await impl.createDocument({ ...doc, studentKey, assignmentId: await getAssignmentId() }));
    },

    async updateDocument(id, patch) {
      return toPublicDocument(await impl.updateDocument(id, patch));
    },

    async getDocumentFlow(id) {
      return toPublicDocument(await impl.getDocumentFlow(id));
    },

    logEvent(type: EventType, payload?: Record<string, unknown>, docId?: string | null) {
      impl.logEvent(studentKey, type, payload, docId);
    },

    getFlowProgress: () => impl.getFlowProgress(studentKey),

    saveFlowProgress: (progress) => impl.saveFlowProgress({ ...progress, studentKey }),
  };
}
