// Contracts between the simulator and CAP (work package 1, PR 1).
//
// Types and interfaces only: nothing in this file runs. The CAP backend, the simulator engine and the
// simulator front end are each built against these shapes, so a change here is a change to all three
// and goes through a pull request. The reasoning is in docs/work-packages/wp1-sim-in-cap.md §4.
//
// Rules that every implementation must keep:
//   1. The browser never supplies, and never receives, the learner key or the activity. The server
//      derives both from the session token (`SimScope`).
//   2. The browser never receives an expected net value, the assignment seed, or the learner key.
//      The `Public*` types below leave those fields out, and the checks at the end of this file make
//      the compiler fail if one is ever added back.
//   3. Everything is scoped. A learner's documents are invisible to every other learner, including in
//      searches by customer reference.
//   4. Events carry relative time only (CAP's no-absolute-timestamps rule for research records).

import type {
  Assignment,
  AssignmentInstance,
  DocType,
  EventType,
  SalesDocument,
} from './index';

// ---------------------------------------------------------------------------
// Scope: whose state this is
// ---------------------------------------------------------------------------

/**
 * Identifies one learner's simulator state for one activity. Built on the server from the session
 * token (`canvasUuid` is the learner key, `moduleId` is the activity). It is not a session id:
 * sessions are destroyed at completion, but students can return to their documents until the state
 * expires.
 */
export interface SimScope {
  learnerKey: string;
  activityId: string;
}

// ---------------------------------------------------------------------------
// What the browser may see
// ---------------------------------------------------------------------------

/** Fields of an `AssignmentInstance` that must never leave the server. `seed` is derived from the learner key. */
export type SimServerOnlyInstanceField = 'studentKey' | 'seed' | 'expectedNetValue';

/**
 * The assignment instance as the browser sees it. It keeps `resolvedParams` (customer, materials,
 * quantities, discounts, order probability) because the exercise hands those to the student, and
 * `custPoNumber`. It does not contain any net value the student is supposed to arrive at.
 */
export type PublicAssignmentInstance = Omit<AssignmentInstance, SimServerOnlyInstanceField>;

/** A sales document as the browser sees it: no learner key. */
export type PublicSalesDocument = Omit<SalesDocument, 'studentKey'>;

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/**
 * What the browser sends to create a document. The server sets the id, the creation time, the
 * learner key and the assignment id, and it computes every net value from the items and conditions.
 * Anything the client sends for those fields is ignored.
 */
export type NewSalesDocumentInput = Omit<
  SalesDocument,
  'id' | 'createdAt' | 'netValue' | 'studentKey' | 'assignmentId'
>;

/** A partial update. The server reprices the merged document. A document's type and owner never change. */
export type SalesDocumentPatch = Partial<
  Omit<SalesDocument, 'id' | 'studentKey' | 'assignmentId' | 'docType' | 'createdAt' | 'netValue'>
>;

/** An event to record. The store computes `relativeMs` (milliseconds since the scope's first event). */
export interface NewSimEvent {
  type: EventType;
  docId: string | null;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// SimStore: all simulator state, behind one async interface
// ---------------------------------------------------------------------------

/**
 * Persistence for the simulator, as CAP's backend and the standalone sim server each implement it.
 * The CAP implementation (`db/simDb.ts`) uses the JSON store when `USE_LOCAL_DB=true` and DynamoDB
 * otherwise. The standalone server adapts its SQLite repository.
 *
 * Every method takes a `SimScope` and may only see that scope's data. An id that exists under another
 * scope behaves exactly like an unknown id (`null`, never an error that reveals it exists).
 *
 * Retention: stored state expires on its own timer (`SIM_STATE_TTL_DAYS`, provisional default 120).
 * `purge` removes a scope's state at once. Stores may keep an internal absolute time for expiry, but
 * they must not return it, and `relativeMs` is the only event time that leaves the store.
 */
export interface SimStore {
  /** The full instance, including server-only fields. `null` if none has been stored yet. */
  getInstance(scope: SimScope): Promise<AssignmentInstance | null>;
  putInstance(scope: SimScope, instance: AssignmentInstance): Promise<void>;

  listDocuments(scope: SimScope, filter?: { docType?: DocType }): Promise<SalesDocument[]>;
  getDocument(scope: SimScope, id: string): Promise<SalesDocument | null>;
  /** Searches this scope's documents only, never other learners'. */
  findByCustReference(scope: SimScope, docType: DocType, custReference: string): Promise<SalesDocument[]>;
  /** The document and its predecessors, oldest first. Empty if the id is unknown in this scope. */
  getDocumentChain(scope: SimScope, id: string): Promise<SalesDocument[]>;

  /**
   * `doc` arrives already priced. The store assigns the id (unique within the scope), the creation
   * time and the learner key, and sets `assignmentId` from the stored instance.
   */
  createDocument(scope: SimScope, doc: NewSalesDocumentInput & { netValue: number }): Promise<SalesDocument>;
  /** `null` if the id is unknown in this scope. `patch` arrives already repriced. */
  updateDocument(
    scope: SimScope,
    id: string,
    patch: SalesDocumentPatch & { netValue?: number },
  ): Promise<SalesDocument | null>;

  appendEvent(scope: SimScope, event: NewSimEvent): Promise<void>;

  /** Deletes all state for the scope: instance, documents and events. */
  purge(scope: SimScope): Promise<void>;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type VerificationItemStatus = 'ok' | 'missing' | 'mismatch';

/**
 * One checked item. `studentMessage` is safe to show: it says what to look at, never the expected
 * value. Example for a mismatch: "The net value of your order does not match what we expected.
 * Recheck the discounts and the quantity."
 */
export interface VerificationItem {
  key: DocType;
  status: VerificationItemStatus;
  studentMessage: string;
}

/**
 * The result of checking an activity. `allPresent`, `foundDocs` and `missingTypes` keep the meaning
 * they have in CAP's current `VerificationResult`; `passed` and `items` are the additions. CAP's
 * `VerificationResult` becomes this shape plus whatever the live-SAP connector adds.
 *
 * `passed` means every item is `ok`: each document exists, belongs to this learner, and has the
 * expected net value. It contains no net values.
 */
export interface ActivityVerification {
  passed: boolean;
  allPresent: boolean;
  foundDocs: string[];
  missingTypes: DocType[];
  items: VerificationItem[];
}

/** Implemented in the engine (task S1). Reads only from `store`, for `scope`. */
export type VerifyActivity = (
  store: SimStore,
  scope: SimScope,
  assignment: Assignment,
) => Promise<ActivityVerification>;

// ---------------------------------------------------------------------------
// Recipe parameters
// ---------------------------------------------------------------------------

/**
 * The `{key}` placeholders a recipe may use for this activity. They become `session.parameters`, so
 * the instructions and the AI "known result" keep working with no change to CAP. The values come
 * from the instance's `resolvedParams` and are all inputs the exercise gives the student; none is an
 * expected result. In the pilot assignment item 1 is the Deluxe bike and item 2 the Professional one.
 */
export const SIM_PARAMETER_KEYS = [
  'customerId',
  'customerName',
  'poNumber',
  'item1MaterialId',
  'item1Description',
  'item1Quantity',
  'item2MaterialId',
  'item2Description',
  'item2Quantity',
  'itemDiscountMaterialId', // the item that gets the K004 material discount
  'itemDiscountAmount', // K004 amount per unit
  'headerDiscountPercent', // RA00 percentage from gross
  'orderProbability',
] as const;

export type SimParameterKey = (typeof SIM_PARAMETER_KEYS)[number];
export type SimRecipeParameters = Record<SimParameterKey, string>;

// ---------------------------------------------------------------------------
// HTTP routes in the CAP backend
// ---------------------------------------------------------------------------

/**
 * Mounted in `app.ts` behind `authMiddleware`, like `/session`. Responses use the `Public*` types.
 * Unknown ids, and ids owned by another learner, answer 404 with the same body.
 *
 * Register `searchByReference` before `document`, or Express will treat "search-by-reference" as an id.
 */
export const SIM_ROUTES = {
  instance: { method: 'GET', path: '/sim/instance' }, // -> PublicAssignmentInstance
  documents: { method: 'GET', path: '/sim/documents' }, // ?docType= -> PublicSalesDocument[]
  searchByReference: { method: 'GET', path: '/sim/documents/search-by-reference' }, // ?docType=&custReference=
  document: { method: 'GET', path: '/sim/documents/:id' }, // -> PublicSalesDocument
  documentFlow: { method: 'GET', path: '/sim/document-flow/:id' }, // -> PublicSalesDocument[]
  createDocument: { method: 'POST', path: '/sim/documents' }, // body NewSalesDocumentInput -> 201 PublicSalesDocument
  updateDocument: { method: 'PATCH', path: '/sim/documents/:id' }, // body SalesDocumentPatch -> PublicSalesDocument
  logEvent: { method: 'POST', path: '/sim/events' }, // body NewSimEvent -> 201, no body of interest
} as const;

// ---------------------------------------------------------------------------
// SimApi: what the simulator front end calls
// ---------------------------------------------------------------------------

/**
 * The seam in `sim-web` (task S2). It replaces the module-level functions in `api.ts`. There is no
 * learner key or assignment id in any call: the implementation binds the scope itself. Three
 * implementations: network (standalone dev server), local (the Amplify demo, browser storage) and
 * CAP (calls `SIM_ROUTES` with the session bearer token).
 */
export interface SimApi {
  getInstance(): Promise<PublicAssignmentInstance>;
  listDocuments(docType?: DocType): Promise<PublicSalesDocument[]>;
  getDocument(id: string): Promise<PublicSalesDocument>;
  searchByReference(docType: DocType, custReference: string): Promise<PublicSalesDocument[]>;
  createDocument(doc: NewSalesDocumentInput): Promise<PublicSalesDocument>;
  updateDocument(id: string, patch: SalesDocumentPatch): Promise<PublicSalesDocument>;
  getDocumentFlow(id: string): Promise<PublicSalesDocument[]>;
  /** Fire and forget. Failures must never interrupt the student. */
  logEvent(type: EventType, payload?: Record<string, unknown>, docId?: string | null): void;
}

// ---------------------------------------------------------------------------
// Compile-time guards: the build fails if a server-only field leaks into a public type
// ---------------------------------------------------------------------------

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;
type Not<B extends boolean> = B extends true ? false : true;
type Assert<T extends true> = T;

export type _SimContractGuards = [
  Assert<Not<HasKey<PublicAssignmentInstance, 'expectedNetValue'>>>,
  Assert<Not<HasKey<PublicAssignmentInstance, 'studentKey'>>>,
  Assert<Not<HasKey<PublicAssignmentInstance, 'seed'>>>,
  Assert<Not<HasKey<PublicSalesDocument, 'studentKey'>>>,
  Assert<Not<HasKey<NewSalesDocumentInput, 'studentKey'>>>,
  Assert<Not<HasKey<NewSalesDocumentInput, 'assignmentId'>>>,
  Assert<Not<HasKey<ActivityVerification, 'expectedNetValue'>>>,
  Assert<Not<HasKey<VerificationItem, 'expectedNetValue'>>>,
  Assert<Not<HasKey<VerificationItem, 'netValue'>>>,
  Assert<Not<HasKey<NewSimEvent, 'occurredAt'>>>,
];
