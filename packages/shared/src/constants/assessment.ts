/**
 * assessment.ts — Platform-wide assessment constants.
 *
 * MASTER_RUBRIC is the single evaluation rubric applied to every module.
 * Per-recipe rubric dimensions were removed in v3 so that de-identified
 * evaluation records are dimension-for-dimension comparable across
 * modules — a research requirement. Wording is finalized by the research
 * team; change it here and nowhere else.
 *
 * DEFAULT_MAX_TURNS replaces the per-recipe maxTurns field (v3 removed it
 * from authoring; the optional recipe field is still honored for legacy
 * recipes).
 */

export interface MasterRubricDimension {
  name:        string;
  description: string;
}

export const MASTER_RUBRIC: MasterRubricDimension[] = [
  {
    name: 'Process understanding',
    description:
      'Explains what they did and why each step or document exists — ' +
      'purpose over clicks.',
  },
  {
    name: 'Conceptual vocabulary',
    description:
      'Uses module terminology accurately and in their own words.',
  },
  {
    name: 'Transfer and reflection',
    description:
      'Connects the experience to durable skills, future coursework, ' +
      'or career contexts.',
  },
];

export const DEFAULT_MAX_TURNS = 20;
