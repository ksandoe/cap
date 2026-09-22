/**
 * contextCompiler.ts
 *
 * Assembles the domain context object (instructional recipe + session data)
 * into system prompts for each AI call type.
 *
 * Classifies activity steps as probe-eligible or context-only:
 *   Probe-eligible: has description + outcomeTagIndices (authored or inferred) + understandingNote
 *   Context-only: description only
 *
 * TODO: implement AI-based outcome tag inference for untagged steps
 * TODO: implement token budget management for background documentation
 */
import { Recipe, Session, CheckinResponse, InstructionalBlock } from '@cap/shared';

export interface CompiledContext {
  checkinSystemPrompt:    string;
  checkoutSystemPrompt:   string;
  evaluationSystemPrompt: string;
}

/** Flatten all ActivitySteps out of the recipe's instructional content blocks. */
function activitySteps(recipe: Recipe) {
  return (recipe.contentBlocks ?? [])
    .filter((b): b is InstructionalBlock => b.type === 'instructional')
    .flatMap(b => b.steps ?? []);
}

export function compileContext(recipe: Recipe, session: Partial<Session>): CompiledContext {
  const stepContext = activitySteps(recipe).map(step => {
    const probeEligible = step.description
      && step.outcomeTagIndices?.length > 0
      && step.understandingNote;

    const outcomeNames = (step.outcomeTagIndices ?? [])
      .map(i => recipe.learningOutcomes[i])
      .filter(Boolean)
      .join(', ');

    return [
      `Step ${step.stepNumber}: ${step.description}`,
      probeEligible
        ? `  → PROBE-ELIGIBLE | Outcomes: ${outcomeNames} | Target: ${step.understandingNote}`
        : `  → CONTEXT-ONLY`,
    ].join('\n');
  }).join('\n\n');

  const checkinProfile = formatCheckinProfile(session.checkinResponses ?? []);
  const rubricDims = recipe.rubricDimensions
    .map(d => `- ${d.name}: ${d.description}`).join('\n');
  const probeRules = (recipe.probingRules ?? [])
    .map(r => `IF: ${r.trigger}\nTHEN: ${r.followUp}`).join('\n\n');

  // ── Check-in question generation prompt ────────────────────────────────────
  const checkinSystemPrompt = `
You are generating check-in survey questions for a learning module.
Generate exactly 3-4 questions to assess prior knowledge and experience.

MODULE: ${recipe.moduleTitle}
DESCRIPTION: ${recipe.moduleDescription}
LEARNING OUTCOMES:
${recipe.learningOutcomes.map((o,i) => `${i+1}. ${o}`).join('\n')}
KEY CONCEPTS: ${recipe.keyConcepts.map(c => c.term).join(', ')}

Generate questions targeting: prior professional/academic experience,
self-assessed comfort with key concepts, and relevant tool exposure.
Each question must specify: questionKey, questionText, responseType (likert|multiple_choice|short_text), options (if applicable).
Respond ONLY with a JSON object of the form {"questions": [ ...question objects... ]}.
`.trim();

  // ── Checkout conversation system prompt ────────────────────────────────────
  const checkoutSystemPrompt = `
You are a supportive assessment agent for the module: "${recipe.moduleTitle}".
Your role is to conduct a mentoring-style conversation (like a job interview debrief)
to assess genuine understanding — not task completion.

${recipe.toneGuidance ? `TONE GUIDANCE: ${recipe.toneGuidance}` : ''}

STUDENT PROFILE (from check-in):
${checkinProfile}

LEARNING OUTCOMES:
${recipe.learningOutcomes.map((o,i) => `${i+1}. ${o}`).join('\n')}

KEY CONCEPTS:
${recipe.keyConcepts.map(c => `- ${c.term}: ${c.definition}`).join('\n')}

ACTIVITY STEPS:
${stepContext}

INSTRUCTIONAL RULES:
${probeRules}

VAGUE ANSWER TRIGGERS:
${(recipe.vagueAnswerTriggers ?? []).map(t => `- ${t}`).join('\n')}

CAREER TRANSFER PROMPTS (use toward end of conversation):
${(recipe.careerTransferPrompts ?? []).map(p => `- ${p}`).join('\n')}

RUBRIC DIMENSIONS (do not reference by name during conversation):
${rubricDims}

CONVERSATION PHASES (signal transitions with [PHASE:N]):
1. Opening (2-3 turns): acknowledge activity, reference check-in, open question
2. Process understanding (4-6 turns): probe PROBE-ELIGIBLE steps; use CONTEXT-ONLY as background
3. Durable skills & career (3-4 turns): use career transfer prompts
4. Wrap-up (1-2 turns): one strength, one development area, then [PHASE:4]

RULES: Never say "correct" or "incorrect". One question per turn. Validate before redirecting.
Max turns: ${recipe.maxTurns ?? 20}.
When evaluation is ready output: [ASSESSMENT:{...json...}]
`.trim();

  // ── Evaluation generation prompt ───────────────────────────────────────────
  const evaluationSystemPrompt = `
You are generating a rubric-based evaluation of a student's checkout conversation
for the module: "${recipe.moduleTitle}".

RUBRIC DIMENSIONS:
${rubricDims}

LEARNING OUTCOMES:
${recipe.learningOutcomes.map((o,i) => `${i+1}. ${o}`).join('\n')}

Rate each dimension as: Strong | Developing | Needs further work
Write a 2-3 sentence narrative per dimension referencing specific student statements.
Write a 3-5 sentence overall summary (one strength, one development area, forward-looking close).
For each learning outcome, assess: achieved | partial | not_addressed.
Award badge if NO dimension is rated "Needs further work".

Respond ONLY with valid JSON matching the Evaluation type schema.
`.trim();

  return { checkinSystemPrompt, checkoutSystemPrompt, evaluationSystemPrompt };
}

function formatCheckinProfile(responses: CheckinResponse[]): string {
  if (!responses.length) return 'No check-in data available.';
  return responses.map(r => `Q: ${r.questionText}\nA: ${r.response}`).join('\n\n');
}
