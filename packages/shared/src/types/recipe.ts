/**
 * recipe.ts — Shared types for instructional recipes.
 *
 * A recipe is the complete authored specification of a learning module.
 * It drives: the learning activity display, the AI agent's behavior,
 * the check-in question generation, and the evaluation rubric.
 *
 * Content block model (Master PRD Section 3.2):
 *   - ContentBlock is the top-level unit of the learning activity.
 *   - Three block types: 'conceptual' | 'instructional' | 'sap'
 *   - Blocks can be marked as gates (must complete before next unlocks).
 *   - An instructional block and a SAP block can be grouped as a
 *     ConcurrentPair — displayed side-by-side or in a modal.
 *   - Instructional blocks contain ActivitySteps.
 *   - ActivitySteps are the unit the AI agent probes on.
 */

// ── Content blocks ────────────────────────────────────────────────────────────

export type ContentBlockType = 'conceptual' | 'instructional' | 'sap';

export interface ConceptualBlock {
  blockId:    string;
  type:       'conceptual';
  title:      string;
  body:       string;               // markdown / rich text
  videoUrl?:  string;               // optional short video (< 5 min)
  isGate:     boolean;              // must complete before next block unlocks
}

export interface InstructionalBlock {
  blockId:    string;
  type:       'instructional';
  title:      string;
  steps:      ActivityStep[];
  isGate:     boolean;
}

export interface SapBlock {
  blockId:    string;
  type:       'sap';
  title:      string;
  taskPrompt: string;               // instructions for what to do in SAP
  isGate:     true;                 // SAP blocks are always gates
}

export type ContentBlock = ConceptualBlock | InstructionalBlock | SapBlock;

/**
 * A ConcurrentPair groups one InstructionalBlock and one SapBlock
 * so the student can view them simultaneously.
 * The pair occupies one position in the block sequence.
 */
export interface ConcurrentPair {
  pairId:           string;
  instructionalId:  string;         // blockId of the InstructionalBlock
  sapId:            string;         // blockId of the SapBlock
}

/**
 * A SequenceItem is either a standalone block or a concurrent pair.
 */
export type SequenceItem =
  | { kind: 'block'; blockId: string }
  | { kind: 'pair';  pairId:  string };

// ── Activity steps (within InstructionalBlocks) ───────────────────────────────

export interface ActivityStep {
  stepNumber:        number;
  description:       string;        // required — what the student does
  outcomeTagIndices: number[];      // optional — indices into learningOutcomes[]
  understandingNote: string;        // optional — what good understanding looks like
  probeEligible?:    boolean;       // set by context compiler at runtime
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

  // Content blocks — the learning activity
  contentBlocks:        ContentBlock[];
  concurrentPairs:      ConcurrentPair[];
  sequence:             SequenceItem[];   // ordered display sequence

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
