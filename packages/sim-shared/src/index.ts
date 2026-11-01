// Shared types for the Sales Process PoC.
// Mirrors docs/architecture-proposal.md §§2-10. Keep this file and that doc in sync;
// when they drift, the doc is the design record and this file should be corrected to match it.

// ---------------------------------------------------------------------------
// Reference / config data (§2)
// ---------------------------------------------------------------------------

export interface Customer {
  id: string; // SAP-style customer number, e.g. "127999" — flavor only, no live SAP connection
  name: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface Material {
  id: string; // e.g. "DXTR1999"
  description: string;
  basePrice: number;
}

export type ConditionCode = 'K004' | 'RA00';

export interface ConditionTypeDef {
  code: ConditionCode;
  name: string;
  level: 'item' | 'header';
  calcType: 'amount' | 'percent';
  requiresActivation: boolean; // true for RA00
}

export interface Assignment {
  id: string;
  title: string;
  customerPool: string[]; // Customer ids
  materialPool: string[]; // Material ids
  variantStrategy: VariantStrategy;
  quirks: QuirkConfig;
}

// ---------------------------------------------------------------------------
// Parameterization — per-student variants (§3a / §3b)
// ---------------------------------------------------------------------------

export type VariantStrategy =
  | { mode: 'fixed'; scenario: ScenarioParams }
  | { mode: 'table'; variants: ScenarioParams[] }
  | { mode: 'random'; ranges: ScenarioRanges };

export interface ScenarioParams {
  customerId: string;
  items: { materialId: string; quantity: number }[];
  itemConditions: { materialId: string; conditionCode: ConditionCode; amount: number }[];
  headerConditions: { conditionCode: ConditionCode; amount: number }[];
  orderProbability: number;
}

export interface MaterialSlot {
  role: string; // e.g. "deluxe" | "professional"
  colorPool: string[]; // Material ids
}

export interface ScenarioRanges {
  customerPool: string[];
  materialSlots: MaterialSlot[];
  quantity: { min: number; max: number };
  itemDiscount: {
    conditionCode: ConditionCode;
    appliesToRole: string;
    amountMin: number;
    amountMax: number;
    step: number;
  };
  headerDiscount: {
    conditionCode: ConditionCode;
    amountMin: number;
    amountMax: number;
    step: number;
  };
  orderProbability: number; // fixed, not randomized
}

export interface AssignmentInstance {
  id: string;
  assignmentId: string;
  studentKey: string;
  source: 'fixed' | 'table' | 'random';
  variantIndex: number | null;
  seed: string | null;
  resolvedParams: ScenarioParams;
  expectedNetValue: { inquiry: number; quotation: number; order: number };
  custPoNumber: string; // §3c — system-assigned, student-facing PO number
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Student-generated data (§3)
// ---------------------------------------------------------------------------

export type DocType = 'inquiry' | 'quotation' | 'order';

export interface AppliedCondition {
  conditionCode: ConditionCode;
  amount: number;
  active: boolean; // models the RA00 "must activate" quirk
}

export interface SalesDocumentItem {
  lineNumber: number;
  materialId: string;
  quantity: number;
  orderProbability: number | null; // inquiry only
  itemConditions: AppliedCondition[];
  itemNetValue: number;
}

export interface SalesDocument {
  id: string; // "INQ-000042", "QUO-000017", "ORD-000031"
  docType: DocType;
  assignmentId: string;
  studentKey: string;
  predecessorId: string | null;
  customerId: string;
  custReference: string; // == AssignmentInstance.custPoNumber, see §3c
  custReferenceDate: string;
  validFrom: string | null;
  validTo: string | null;
  requestedDeliveryDate: string | null;
  items: SalesDocumentItem[];
  headerConditions: AppliedCondition[];
  netValue: number;
  status: 'in_progress' | 'complete';
  createdAt: string;
  savedAt: string | null;
}

// ---------------------------------------------------------------------------
// Event log (§6)
// ---------------------------------------------------------------------------

export type EventType =
  | 'assignment_started'
  | 'step_viewed'
  | 'field_error_shown'
  | 'warning_shown'
  | 'warning_acknowledged'
  | 'document_saved'
  | 'document_save_blocked'
  | 'document_resumed'
  | 'search_dialog_opened'
  | 'search_dialog_selected'
  | 'create_with_reference_used'
  | 'document_flow_viewed'
  | 'block_entered'
  | 'menu_navigated';

export interface AppEvent {
  id: string;
  studentKey: string;
  assignmentId: string;
  docId: string | null;
  type: EventType;
  payload: Record<string, unknown>;
  occurredAt: string;
  relativeMs: number;
}

// ---------------------------------------------------------------------------
// Data-driven transaction config (§5)
// ---------------------------------------------------------------------------

export type TransactionId = 'VA11' | 'VA21' | 'VA01';

export interface FieldConfig {
  name: string;
  label: string;
  required: boolean;
  copiedFromPredecessor?: boolean;
  editableAfterCopy?: boolean;
}

export interface WarningConfig {
  id: string;
  message: string;
  kind: 'warning' | 'info';
  dismissAction: 'enter' | 'checkmark';
}

export interface StepConfig {
  id: string;
  title: string;
  fields: FieldConfig[];
  instructions: string; // Parand's step-by-step text for this one step, see §10b
  warningsOnAdvance?: WarningConfig[];
}

export interface InitialScreenField {
  name: string;
  label: string;
  value: string;
}

export interface TransactionConfig {
  id: TransactionId;
  docType: DocType;
  title: string;
  createWithReference?: { predecessorDocType: DocType; searchBy: 'custReference' };
  postSaveBehavior: 'blank-tab' | 'none';
  /** SAP Easy Access folder path a student follows to reach this transaction — e.g. ['Logistics', 'Sales and Distribution', 'Sales', 'Inquiry', 'Create']. */
  menuPath: string[];
  /** The type/org/channel screen SAP shows before the transaction's own Overview screen opens. */
  initialScreen: {
    title: string;
    fields: InitialScreenField[];
    continueLabel: string;
  };
  steps: StepConfig[];
}

export interface QuirkConfig {
  postSaveBehavior: 'blank-tab' | 'none';
}

// ---------------------------------------------------------------------------
// CAP integration contract (§7)
// ---------------------------------------------------------------------------

export interface SimVerificationResult {
  allPresent: boolean;
  foundDocs: string[];
  missingTypes: string[];
  documents: {
    docType: DocType;
    docId: string | null;
    exists: boolean;
    ownedByStudent: boolean;
    netValue: number | null;
    expectedNetValue: number;
    netValueMatches: boolean;
  }[];
}

// ---------------------------------------------------------------------------
// UI shell: wizard flow and layout (§10)
// ---------------------------------------------------------------------------

export type StaticContentRef = string; // id into the web app's content map

export type FlowBlock =
  | { type: 'intro' | 'conclusion'; id: string; content: StaticContentRef }
  | { type: 'background'; id: string; docType: DocType; content: StaticContentRef }
  | { type: 'activity'; id: string; docType: DocType; transactionConfigId: TransactionId };

export interface ActivityFlow {
  assignmentId: string;
  blocks: FlowBlock[];
}

export interface FlowProgress {
  studentKey: string;
  assignmentId: string;
  currentBlockIndex: number;
  furthestBlockIndex: number;
}

export type ActivityLayoutMode = 'side-by-side' | 'tabbed' | 'drawer';

export interface ActivityLayoutConfig {
  breakpointPx: number;
  studentOverride: boolean;
}
