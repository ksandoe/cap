/**
 * recipe.ts — Shared types for instructional recipes.
 *
 * A recipe is the complete authored specification of a learning module.
 * It drives: the learning activity display, the AI agent's behavior,
 * the check-in question generation, and the evaluation rubric.
 *
 * Content model:
 *   - A module consists of 1:m ModuleSteps (ordered).
 *   - A step consists of 1:m ContentBlocks (ordered).
 *   - Steps are the unit the AI agent probes on (outcomeTagIndices +
 *     understandingNote make a step probe-eligible).
 *
 * Block types:
 *   - rich_text       — prose, headings, images, tables, callouts (the workhorse)
 *   - guided_tool     — a framed interactive environment plus guided
 *                       instructions: ordered steps with {param} placeholders
 *                       and lightweight per-instruction branches, a progress
 *                       indicator, and a configurable layout (SAP primary)
 *   - knowledge_check — formative questions w/ immediate feedback; unrecorded
 *   - checklist       — student self-confirms actions taken ("I have done X")
 */

// ── Content blocks ────────────────────────────────────────────────────────────

export type ContentBlockType =
  | 'rich_text'
  | 'guided_tool'
  | 'knowledge_check'
  | 'checklist';

export interface RichTextBlock {
  blockId: string;
  type:    'rich_text';
  title?:  string;
  body:    string;              // markdown / rich text
}

// ── Guided tool ─────────────────────────────────────────────────────────────
//
// One instruction = one thing the student does inside the tool. Instruction
// text may contain {paramKey} placeholders substituted per-student from the
// module's parameter table (keyed on the assigned tool account — see
// Recipe.parameters). A branch is a lightweight conditional variant attached
// to a single instruction ("if you get error X → do Y").

export interface GuidedBranch {
  branchId:  string;
  condition: string;    // the trigger — error message, scenario, choice
  text:      string;    // what to do instead; may contain {paramKey} placeholders
}

export interface GuidedInstruction {
  instructionId: string;
  text:          string;          // e.g. "Enter {orderQty} in the Quantity field"
  branches?:     GuidedBranch[];  // optional conditional variants
}

export interface GuidedToolBlock {
  blockId:      string;
  type:         'guided_tool';
  title:        string;
  tool:         string;                          // 'sap' or a generic tool name
  url?:         string;                          // launch/embed URL
  layout:       'stacked' | 'side_by_side';      // instructions above vs. beside the frame
  instructions: GuidedInstruction[];             // ordered — drives the progress indicator
  isGate:       boolean;                         // must complete before continuing (SAP defaults true)
}

export type KnowledgeCheckQuestionType = 'multiple_choice' | 'true_false' | 'short_answer';

export interface KnowledgeCheckQuestion {
  questionId:     string;
  type:           KnowledgeCheckQuestionType;
  prompt:         string;
  options?:       string[];    // multiple_choice only
  correctAnswer?: string;      // option text, 'true'/'false', or a sample answer
  feedback?:      string;      // shown immediately after answering
}

export interface KnowledgeCheckBlock {
  blockId:   string;
  type:      'knowledge_check';
  title?:    string;
  questions: KnowledgeCheckQuestion[];
}

export interface ChecklistItem {
  itemId: string;
  label:  string;             // "I have done X"
}

export interface ChecklistBlock {
  blockId: string;
  type:    'checklist';
  title?:  string;
  items:   ChecklistItem[];
}

export type ContentBlock =
  | RichTextBlock
  | GuidedToolBlock
  | KnowledgeCheckBlock
  | ChecklistBlock;

// ── Module steps ──────────────────────────────────────────────────────────────

export interface ModuleStep {
  stepId:            string;
  stepNumber:        number;
  title:             string;          // required — short name shown to the student
  description:       string;          // required — what the student does; the probe unit
  blocks:            ContentBlock[];  // ordered, 1:m
  outcomeTagIndices: number[];        // optional — indices into learningOutcomes[]
  understandingNote: string;          // optional — what good understanding looks like
  probeEligible?:    boolean;         // set by context compiler at runtime
}

// ── Recipe ────────────────────────────────────────────────────────────────────

export interface Recipe {
  recipeId:             string;
  version:              number;
  moduleId:             string;
  moduleTitle:          string;
  moduleDescription:    string;

  // Learning structure
  learningOutcomes:     string[];
  keyConcepts:          KeyConcept[];

  // Per-student parameter keys used in guided-tool instructions ({key}
  // placeholders). Values are assigned at launch from the module's parameter
  // table — one row per tool-account in the pool — so each student gets
  // different-but-known task data (the former "seed by userid" pattern).
  parameters?:          ParameterDef[];

  // The learning activity — ordered steps, each containing ordered blocks
  steps:                ModuleStep[];

  // Instructional recipe — the AI agent's behavior
  rubricDimensions:     RubricDimension[];
  probingRules:         ProbingRule[];
  vagueAnswerTriggers:  string[];
  careerTransferPrompts:string[];
  toneGuidance?:        string;
  maxTurns:             number;

  // Supporting content
  contentStub?:         ContentStub;
  backgroundDocs?:      BackgroundDoc[];

  // Metadata
  isActive:             boolean;
  createdAt:            string;
  updatedAt:            string;
}

// ── Supporting types ──────────────────────────────────────────────────────────

export interface KeyConcept    { term: string; definition: string; }
export interface ParameterDef  { key: string; label: string; }
export interface ProbingRule   { trigger: string; followUp: string; }
export interface RubricDimension { name: string; description: string; weight?: number; }
export interface ContentStub   { summaryText: string; resourceLinks?: ResourceLink[]; }
export interface ResourceLink  { url: string; label: string; type: 'reading' | 'video' | 'tool'; }
export interface BackgroundDoc { type: 'file' | 'text' | 'link'; content: string; label?: string; s3Key?: string; }
