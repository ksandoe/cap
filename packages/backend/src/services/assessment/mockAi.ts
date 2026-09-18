/**
 * mockAi.ts — Deterministic canned responses for local development.
 *
 * Used when MOCK_AI=true (or when no ANTHROPIC_API_KEY is set in dev) so the
 * full wizard flow runs end-to-end without calling the Anthropic API.
 * Response shapes match what the real call sites expect.
 */
import { Recipe } from '@cap/shared';

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
export function mockConversationTurn(userMessageCount: number): string {
  if (userMessageCount <= 1) return OPENERS[0];
  if (userMessageCount >= PROBES.length + 1) return WRAPUP;
  return PROBES[userMessageCount - 2];
}

/** Returns a valid Evaluation JSON string shaped to the rubric dimensions in the recipe. */
export function mockEvaluation(recipe: Recipe): string {
  const dimensionRatings = recipe.rubricDimensions.map((d, i) => ({
    dimensionName: d.name,
    rating:        i === recipe.rubricDimensions.length - 1 ? 'Developing' : 'Strong',
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
