export interface Recipe {
  recipeId:            string;
  version:             number;
  moduleId:            string;
  moduleTitle:         string;
  moduleDescription:   string;
  learningOutcomes:    string[];
  keyConcepts:         KeyConcept[];
  probingRules:        ProbingRule[];
  activitySteps:       ActivityStep[];
  rubricDimensions:    RubricDimension[];
  vagueAnswerTriggers: string[];
  careerTransferPrompts: string[];
  toneGuidance?:       string;
  maxTurns:            number;
  contentStub?:        ContentStub;
  backgroundDocs?:     BackgroundDoc[];
  isActive:            boolean;
  createdAt:           string;
  updatedAt:           string;
}

export interface KeyConcept   { term: string; definition: string; }
export interface ProbingRule  { trigger: string; followUp: string; }
export interface RubricDimension { name: string; description: string; weight?: number; }
export interface ContentStub  { summaryText: string; resourceLinks?: ResourceLink[]; }
export interface ResourceLink { url: string; label: string; type: 'reading' | 'video' | 'tool'; }
export interface BackgroundDoc { type: 'file' | 'text' | 'link'; content: string; label?: string; }

export interface ActivityStep {
  stepNumber:        number;
  description:       string;
  outcomeTagIndices: number[];   // indices into learningOutcomes[]
  understandingNote: string;
  probeEligible?:    boolean;    // set by context compiler at runtime
}
