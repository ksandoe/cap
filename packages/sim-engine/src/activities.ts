import type { SimActivityDefinition, SimActivityRegistry } from '@cap/sim-shared';
import { PILOT_ASSIGNMENT } from './seed/assignment';

/**
 * Every simulator activity the engine can run, by assignment id. CAP's module config names one of these
 * with `simAssignmentId`. Shipping and Billing will add entries here.
 *
 * `mustReference` records which earlier document a document has to be created from ("Create with
 * Reference"). The pilot requires the full chain, because carrying data forward from document to
 * document is the point of the exercise. Remove a `mustReference` to stop checking that link.
 */
export const SIM_ACTIVITIES: Record<string, SimActivityDefinition> = {
  [PILOT_ASSIGNMENT.id]: {
    assignment: PILOT_ASSIGNMENT,
    requiredDocuments: [
      { docType: 'inquiry', transactionId: 'VA11' },
      { docType: 'quotation', transactionId: 'VA21', mustReference: 'inquiry' },
      { docType: 'order', transactionId: 'VA01', mustReference: 'quotation' },
    ],
  },
};

export const getSimActivity: SimActivityRegistry = (simAssignmentId) => SIM_ACTIVITIES[simAssignmentId];
