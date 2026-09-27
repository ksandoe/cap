/**
 * contextCompiler.ts
 *
 * Assembles the domain context object (instructional recipe + session data)
 * into system prompts for each AI call type.
 *
 * Classifies module steps as probe-eligible or context-only:
 *   Probe-eligible: has description + outcomeTagIndices (authored or inferred) + understandingNote
 *   Context-only: description only
 *
 * TODO: implement AI-based outcome tag inference for untagged steps
 * TODO: implement token budget management for background documentation
 */
import { Recipe, Session, CheckinResponse, EmbeddedToolBlock } from '@cap/shared';

export interface CompiledContext {
  checkinSystemPrompt:    string;
  checkoutSystemPrompt:   string;
  evaluationSystemPrompt: string;
}

export function compileContext(recipe: Recipe, session: Partial<Session>): CompiledContext {
  const stepContext = (recipe.steps ?? []).map(step => {
    const probeEligible = step.description
      && step.outcomeTagIndices?.length > 0
      && step.understandingNote;

    const outcomeNames = (step.outcomeTagIndices ?? [])
      .map(i => (recipe.learningOutcomes ?? [])[i])
      .filter(Boolean)
      .join(', ');

    const tools = (step.blocks ?? [])
      .filter((b): b is EmbeddedToolBlock => b.type === 'embedded_tool')
      .map(b => b.tool || b.title);

    return [
      `Step ${step.stepNumber}: ${step.title || step.description}`,
      step.description && step.title ? `  Task: ${step.description}` : '',
      tools.length ? `  Interactive tool(s): ${[...new Set(tools)].join(', ')}` : '',
      probeEligible
        ? `  → PROBE-ELIGIBLE | Outcomes: ${outcomeNames} | Target: ${step.understandingNote}`
        : `  → CONTEXT-ONLY`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const checkinProfile = formatCheckinProfile(session.checkinResponses ?? []);
  const rubricDims = (recipe.rubricDimensions ?? [])
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
${(recipe.learningOutcomes ?? []).map((o,i) => `${i+1}. ${o}`).join('\n')}
KEY CONCEPTS: ${(recipe.keyConcepts ?? []).map(c => c.term).join(', ')}

Generate questions targeting: prior professional/academic experience,
self-assessed comfort with key concepts, and relevant tool exposure.
Each question must specify: questionKey, questionText, responseType (likert|multiple_choice|short_text), options (if applicable).
Respond ONLY with a JSON object of the form {"questions": [ ...question objects... ]}.
`.trim();

  // ── Checkout conversation system prompt ────────────────────────────────────
  const checkoutSystemPrompt = `
You are a reflective debrief partner for the module: "${recipe.moduleTitle}".
Your role is to help the student reflect on what they just did — a short,
mentoring-style conversation that draws out their experience in their own
words. It should feel like a thoughtful colleague asking "how did that go?",
not an exam. Probe gently for understanding, but the conversation's value is
getting the student to articulate their experience.

${recipe.toneGuidance ? `TONE GUIDANCE: ${recipe.toneGuidance}` : ''}

STYLE RULES (strict):
- Exactly ONE question per reply — never stack two questions together.
- Keep every reply under 60 words: a brief acknowledgment, then one question.
- Invite reflection ("what was that like?", "why do you think that step exists?")
  rather than quizzing facts.
- Never say "correct" or "incorrect". Validate before redirecting.

STUDENT PROFILE (from check-in):
${checkinProfile}

LEARNING OUTCOMES:
${(recipe.learningOutcomes ?? []).map((o,i) => `${i+1}. ${o}`).join('\n')}

KEY CONCEPTS:
${(recipe.keyConcepts ?? []).map(c => `- ${c.term}: ${c.definition}`).join('\n')}

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
1. Opening (1-2 turns): welcome, reference their check-in, invite them to
   describe the activity in their own words
2. Reflecting on the process (3-5 turns): probe PROBE-ELIGIBLE steps gently;
   use CONTEXT-ONLY as background
3. Durable skills & career (1-2 turns): use a career transfer prompt
4. Wrap-up (1 turn): one strength, one development area, then [PHASE:4]

RULES: Never say "correct" or "incorrect". Exactly one question per turn.
Validate before redirecting. Max turns: ${recipe.maxTurns ?? 20}.
When evaluation is ready output: [ASSESSMENT:{...json...}]
`.trim();

  // ── Evaluation generation prompt ───────────────────────────────────────────
  const evaluationSystemPrompt = `
You are generating a rubric-based evaluation of a student's checkout conversation
for the module: "${recipe.moduleTitle}".
Write every narrative and the overall summary in the second person, addressed
directly to the student ("you", "your") — never "the student" or third person.

RUBRIC DIMENSIONS:
${rubricDims}

LEARNING OUTCOMES:
${(recipe.learningOutcomes ?? []).map((o,i) => `${i+1}. ${o}`).join('\n')}

Rate each dimension as: Strong | Developing | Needs further work
- Strong: the student articulated the concept in their own words.
- Developing: partial or emerging understanding — still counts as passing.
- "Needs further work": reserve this for genuinely absent understanding
  despite prompts — not for imperfect or brief phrasing. When in doubt
  between Developing and Needs further work, choose Developing.

Write ONE sentence per dimension narrative referencing something the student said.
Write a 2-3 sentence overall summary (one strength, one development area,
forward-looking close). Keep the whole evaluation succinct — the student
reads it on screen.
For each learning outcome, assess: achieved | partial | not_addressed.
Award badge if NO dimension is rated "Needs further work".

Respond ONLY with a JSON object of exactly this shape:
{
  "dimensionRatings": [ { "dimensionName": "<dimension name>", "rating": "Strong|Developing|Needs further work", "narrative": "..." } ],
  "outcomeSummary":   [ { "outcomeIndex": <0-based index>, "outcomeText": "<outcome>", "status": "achieved|partial|not_addressed" } ],
  "overallSummary":   "...",
  "badgeAwarded":     true|false
}
`.trim();

  return { checkinSystemPrompt, checkoutSystemPrompt, evaluationSystemPrompt };
}

function formatCheckinProfile(responses: CheckinResponse[]): string {
  if (!responses.length) return 'No check-in data available.';
  return responses.map(r => `Q: ${r.questionText}\nA: ${r.response}`).join('\n\n');
}
