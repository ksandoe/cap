/**
 * authoring.ts — Types for the v3 guided authoring flow.
 *
 * A RecipeDraft is an in-progress module. Authors build modules across
 * multiple sessions (per interview feedback), so drafts live server-side
 * (cap-recipe-drafts) rather than in browser storage. Publishing a draft
 * creates a new recipe version via the normal save path.
 *
 * Section ids map 1:1 to the wizard's left rail. `aiFields` records which
 * draft fields were AI-generated so the UI can badge them for review.
 */
import type { Recipe } from './recipe';

export type AuthoringSectionId =
  | 'basics'
  | 'outcomes'
  | 'concepts'
  | 'activity'
  | 'conversation';

/**
 * Track groups the rail into the two distinct jobs (v3.1): the ACTIVITY
 * track holds the student-facing instructions (steps + parameters); the
 * RECIPE track holds the higher-level assessment principles the debrief
 * agent works from — and the only part the AI generation dialog drafts.
 * `basics` is shared module identity needed by both.
 */
export type AuthoringTrack = 'module' | 'activity' | 'recipe';

export const AUTHORING_TRACK_LABELS: Record<AuthoringTrack, string> = {
  module:   'Module',
  activity: 'Student activity',
  recipe:   'Assessment recipe',
};

/** One-line explainer shown above the section body for each track (wizard). */
export const AUTHORING_TRACK_BLURBS: Record<AuthoringTrack, string> = {
  module:   'Shared module identity — names the module for students and links it to the course.',
  activity: 'What students do and see: the step-by-step instructions for the hands-on activity, plus the per-student parameters used in them. You build these yourself — the AI never drafts student instructions.',
  recipe:   'The higher-level principles guiding the reflective checkout conversation and its evaluation. The AI generation dialog drafts these fields from your source materials — review before publishing.',
};

export const AUTHORING_SECTIONS: { id: AuthoringSectionId; label: string; track: AuthoringTrack }[] = [
  { id: 'basics',       label: 'Module basics',              track: 'module'   },
  { id: 'activity',     label: 'Activity steps & parameters', track: 'activity' },
  { id: 'outcomes',     label: 'Learning outcomes',           track: 'recipe'   },
  { id: 'concepts',     label: 'Key concepts',                track: 'recipe'   },
  { id: 'conversation', label: 'Conversation guidance',       track: 'recipe'   },
];

export type SectionStatus = 'todo' | 'in_progress' | 'done';

export interface SourceMaterial {
  label: string;
  text:  string;
}

export interface RecipeDraft {
  draftId:         string;
  /** Null until Module basics sets it (or a published recipe is loaded). */
  moduleId?:       string;
  title:           string;
  /** Optional attribution — the name the author typed at passkey login. */
  owner?:          string;
  sections:        Record<AuthoringSectionId, SectionStatus>;
  /** Partial recipe fields, keyed like Recipe (minus versioning fields). */
  data:            Partial<Recipe>;
  /** Uploaded/pasted materials kept for regeneration across sessions. */
  sourceMaterials: SourceMaterial[];
  /** Clarifying answers the author gave the generation dialog. */
  contextAnswers?: Record<string, string>;
  /** Recipe field paths the AI drafted (shown as "AI draft — review"). */
  aiFields:        string[];
  /** Set when editing a published module rather than authoring fresh. */
  fromVersion?:    number;
  published?:      boolean;
  createdAt:       string;
  updatedAt:       string;
}

/** The recipe-side fields the AI generation endpoint may draft. */
export interface GeneratedRecipe {
  moduleTitle:         string;
  moduleDescription:   string;
  learningOutcomes:    string[];
  keyConcepts:         { term: string; definition: string }[];
  probingRules:        { trigger: string; followUp: string }[];
  vagueAnswerTriggers: string[];
  toneGuidance:        string;
}
