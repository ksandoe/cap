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
 *   - embedded_tool   — framed or linked interactive environment (SAP primary)
 *   - knowledge_check — formative questions w/ immediate feedback; unrecorded
 *   - checklist       — student self-confirms actions taken ("I have done X")
 *   - branching_note  — conditional content: trigger + two or more paths
 */

// ── Content blocks ────────────────────────────────────────────────────────────

export type ContentBlockType =
  | 'rich_text'
  | 'embedded_tool'
  | 'knowledge_check'
  | 'checklist'
  | 'branching_note';

export interface RichTextBlock {
  blockId: string;
  type:    'rich_text';
  title?:  string;
  body:    string;              // markdown / rich text
}

export interface EmbeddedToolBlock {
  blockId:     string;
  type:        'embedded_tool';
  title:       string;
  tool:        string;          // 'sap' or a generic tool name
  url?:        string;          // launch/embed URL
  launch:      'link' | 'embed'; // linked out vs. framed in place
  taskPrompt?: string;          // short pointer — full instructions live in rich text alongside
  isGate:      boolean;         // must complete before continuing (SAP defaults true)
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

export interface BranchingPath {
  pathId: string;
  label:  string;             // e.g. "If you see an authorization error"
  body:   string;             // rich text content for this path
}

export interface BranchingNoteBlock {
  blockId: string;
  type:    'branching_note';
  trigger: string;            // the condition — error message, scenario, choice
  paths:   BranchingPath[];   // 2+ content paths
}

export type ContentBlock =
  | RichTextBlock
  | EmbeddedToolBlock
  | KnowledgeCheckBlock
  | ChecklistBlock
  | BranchingNoteBlock;

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
export interface ProbingRule   { trigger: string; followUp: string; }
export interface RubricDimension { name: string; description: string; weight?: number; }
export interface ContentStub   { summaryText: string; resourceLinks?: ResourceLink[]; }
export interface ResourceLink  { url: string; label: string; type: 'reading' | 'video' | 'tool'; }
export interface BackgroundDoc { type: 'file' | 'text' | 'link'; content: string; label?: string; s3Key?: string; }
