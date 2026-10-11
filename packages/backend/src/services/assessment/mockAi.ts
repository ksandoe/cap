/**
 * mockAi.ts — Deterministic canned responses for local development.
 *
 * Used when MOCK_AI=true (or when no ANTHROPIC_API_KEY is set in dev) so the
 * full wizard flow runs end-to-end without calling the Anthropic API.
 * Response shapes match what the real call sites expect.
 */
import { Recipe, MASTER_RUBRIC, GeneratedRecipe } from '@cap/shared';

/** Matches the JSON array shape generateCheckinQuestions parses. */
export function mockCheckinQuestions(): string {
  return JSON.stringify([
    {
      questionKey:   'prior_experience',
      questionText:  'Have you worked with sales or order-management processes before (in a job, internship, or class)?',
      responseType:  'multiple_choice',
      options:       ['No experience', 'Some exposure', 'Worked with them regularly'],
    },
    {
      questionKey:   'erp_comfort',
      questionText:  'How comfortable are you navigating ERP systems such as SAP?',
      responseType:  'likert',
      options:       ['1 — Not at all', '2', '3 — Somewhat', '4', '5 — Very comfortable'],
    },
    {
      questionKey:   'doc_flow_familiarity',
      questionText:  'How familiar are you with the idea of linked business documents (e.g. a quote becoming an order)?',
      responseType:  'likert',
      options:       ['1 — Not at all', '2', '3 — Somewhat', '4', '5 — Very familiar'],
    },
    {
      questionKey:   'context',
      questionText:  'In a sentence or two, what do you already know about how a sales order gets created?',
      responseType:  'short_text',
    },
  ]);
}

const OPENERS = [
  "Thanks for completing the activity — it's great to have you here. Now that you've been through the process, what stood out to you most?",
];

// Retry sessions open by acknowledging what was already demonstrated.
const RETRY_OPENER =
  "Welcome back — last time you showed a good feel for parts of this already. " +
  "How did the activity go this time — did you run into any problems or anything confusing?";

const PROBES = [
  "That's a good start — let's go a bit deeper. Can you walk me through what you actually did in the activity, in your own words?",
  "Interesting. You mentioned the documents you created — why do you think the process needs three separate documents instead of just one?",
  "Let's think about the data side of things. When you created the sales order, where did the information in it come from?",
  "You used some good vocabulary there. Can you give me an example of what 'document flow' meant in practice during your activity?",
  "Almost there. If a customer called and asked whether they'd committed to buying anything at the inquiry stage, what would you tell them?",
  "Let's shift gears a little. What transferable skills do you feel you practiced while working through this activity?",
  "Following on from that — how might understanding this kind of document flow help you in a procurement or operations role someday?",
];

const WRAPUP =
  "Thank you — this has been a really thoughtful conversation. One strength I noticed: you engaged with the reasoning behind the steps, " +
  "not just the clicks. One area to keep developing: connecting the technical steps to the bigger business picture. " +
  "Let's get your evaluation ready. [PHASE:4]";

/** Returns a canned agent reply. Progresses opening → probing → wrap-up by turn count. */
export function mockConversationTurn(userMessageCount: number, isRetry = false): string {
  if (userMessageCount <= 1) return isRetry ? RETRY_OPENER : OPENERS[0];
  if (userMessageCount >= PROBES.length + 1) return WRAPUP;
  return PROBES[userMessageCount - 2];
}

/** Returns a valid Evaluation JSON string shaped to the platform master rubric. */
export function mockEvaluation(recipe: Recipe): string {
  const dimensionRatings = MASTER_RUBRIC.map((d, i) => ({
    dimensionName: d.name,
    rating:        i === MASTER_RUBRIC.length - 1 ? 'Developing' : 'Strong',
    narrative:
      `The student engaged thoughtfully with ${d.name.toLowerCase()}, offering specific ` +
      `observations from the activity and responding well to follow-up questions.`,
  }));
  return JSON.stringify({
    sessionId:        'mock',
    dimensionRatings,
    outcomeSummary:   recipe.learningOutcomes.map((o, i) => ({
      outcomeIndex: i,
      outcomeText:  o,
      status:       'achieved',
    })),
    overallSummary:
      'The student demonstrated solid engagement with the activity and articulated the ' +
      'purpose behind the key steps. A clear strength was their willingness to reason through ' +
      'why each document exists rather than just describing what they clicked. Continued ' +
      'development area: linking the process to broader business contexts.',
    badgeAwarded: true,
    assessedAt:   new Date().toISOString(),
  });
}

/** Canned GeneratedRecipe for the authoring generation dialog when
 *  LLM_MODE=mock — lets the full generate→wizard→publish flow demo
 *  end-to-end without an API key. */
export function mockGeneratedRecipe(): string {
  const g: GeneratedRecipe = {
    moduleTitle: 'Sample Module (AI draft)',
    moduleDescription:
      'Students work through a guided hands-on exercise and then reflect on ' +
      'their process in a short debrief conversation. This draft was generated ' +
      'from the uploaded materials — review and adjust before publishing.',
    learningOutcomes: [
      'Describe the purpose of each step in the exercise and how they connect.',
      'Complete the exercise using the provided parameters and tool guidance.',
      'Explain the key concepts behind the exercise in their own words.',
      'Reflect on their process and identify what they would do differently.',
    ],
    keyConcepts: [
      { term: 'Process flow',  definition: 'The ordered chain of steps or documents where each builds on the last.' },
      { term: 'Reference',     definition: 'Carrying information forward from an earlier step instead of re-entering it.' },
      { term: 'Verification',  definition: 'Confirming that work was completed correctly, not just submitted.' },
    ],
    probingRules: [
      { trigger: 'Student describes a step without explaining its purpose',
        followUp: 'Ask why that step exists — what would be lost without it.' },
      { trigger: 'Student says they "just followed the instructions"',
        followUp: 'Ask what would have been different if they had to do it from scratch.' },
      { trigger: 'Student uses a term without showing what it means',
        followUp: 'Ask for an example from their own work.' },
      { trigger: 'Student mentions an error or unexpected behavior',
        followUp: 'Ask how they figured out what to do next.' },
    ],
    vagueAnswerTriggers: [
      '"It worked" or "it just did it" without saying what happened.',
      'Student repeats instruction text instead of describing their experience.',
      'Student cites a code or name as if it demonstrates understanding.',
    ],
    toneGuidance:
      'Assume students are novices with no prior experience. Be patient and ' +
      'scaffolding early; affirm effort before probing deeper.',
  };
  return JSON.stringify(g);
}
