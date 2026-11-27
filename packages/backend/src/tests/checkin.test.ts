/**
 * checkin.test.ts — A module's fixed check-in questionnaire.
 *
 * Guarantees:
 *   1. A module with a fixed questionnaire gives every student the same
 *      questions in the same order, with no model call.
 *   2. A module without one still falls back to generating questions.
 *   3. A stored questionnaire that fails validation is never served.
 *   4. Saving a recipe refuses a malformed questionnaire, and an empty list
 *      means "not fixed".
 *   5. validateCheckinQuestions catches the mistakes an author can make.
 *
 * The model is switched on but pointed at a closed port, so any attempt to call it
 * fails. Runs on an ephemeral port against the JSON-file store, no AWS and no model.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';

process.env.USE_LOCAL_DB       = 'true';
process.env.NODE_ENV           = 'production';   // suppress app.listen's dev boot
process.env.SESSION_JWT_SECRET = 'checkin-test-secret';
process.env.CAP_LOCAL_DB_FILE  = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'cap-checkin-test-')), 'db.json');
process.env.LLM_MODE           = 'openai';
process.env.OPENAI_API_KEY     = 'test-key';
process.env.OPENAI_BASE_URL    = 'http://127.0.0.1:9';   // nothing listens here

const SIM_MODULE  = 'sim-sales-process';
const LIVE_MODULE = 'demo-sales-process';   // seeded without a fixed questionnaire

let server: Server;
let base: string;
let api: {
  createSession: (ctx: any) => Promise<{ sessionToken: string }>;
  recipeDb: typeof import('../db/recipeDb')['recipeDb'];
  upsertRecipe: typeof import('../services/assessment/recipeService')['upsertRecipe'];
  validate: typeof import('@cap/shared')['validateCheckinQuestions'];
};

beforeAll(async () => {
  const { app }               = await import('../app');
  const { seedLocalStore }    = await import('../db/localStore');
  const { recipeDb }          = await import('../db/recipeDb');
  const orchestrator          = await import('../services/orchestrator/orchestratorService');
  const { upsertRecipe }      = await import('../services/assessment/recipeService');
  const { validateCheckinQuestions } = await import('@cap/shared');
  seedLocalStore();
  api = { createSession: orchestrator.createSession as any, recipeDb, upsertRecipe, validate: validateCheckinQuestions };
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(() => { server?.close(); });

const launch = async (learner: string, moduleId: string) => {
  const { sessionToken } = await api.createSession({
    canvasUuid: learner, ltiContextId: 'ctx', ltiResourceLinkId: 'link',
    agsEndpoint: 'x', lisResultSourcedId: 'y', moduleId,
  });
  return sessionToken;
};

const checkin = async (token: string) => {
  const r = await fetch(`${base}/assessment/checkin-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};

/** Run the real upsertRecipe handler with a stub response. */
async function save(recipe: any): Promise<{ status: number; body: any }> {
  let status = 200; let body: any;
  const res: any = { status(c: number) { status = c; return res; }, json(b: any) { body = b; return res; } };
  await api.upsertRecipe({ body: recipe } as any, res);
  return { status, body };
}

describe('a module with a fixed questionnaire', () => {
  it('gives every student the same questions in the same order, with no model call', async () => {
    const a = await checkin(await launch('learner-a', SIM_MODULE));
    const b = await checkin(await launch('learner-b', SIM_MODULE));
    expect(a.status).toBe(200);          // the model is unreachable, so this call was not made
    expect(a.body.fixed).toBe(true);
    expect(a.body.questions).toHaveLength(7);
    expect(a.body.questions[0].questionKey).toBe('work_experience');
    expect(b.body.questions).toEqual(a.body.questions);
  });

  it('returns the same questions again on a repeat', async () => {
    const first  = await checkin(await launch('learner-c', SIM_MODULE));
    const second = await checkin(await launch('learner-c', SIM_MODULE));
    expect(second.body.questions).toEqual(first.body.questions);
  });

  it('always sends options as a list of strings', async () => {
    const { body } = await checkin(await launch('learner-d', SIM_MODULE));
    for (const q of body.questions) {
      if (q.responseType === 'short_text') expect(q.options).toBeUndefined();
      else {
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.every((o: unknown) => typeof o === 'string')).toBe(true);
      }
    }
  });
});

describe('a module without a fixed questionnaire', () => {
  it('still tries to generate the questions with the model', async () => {
    const r = await checkin(await launch('learner-e', LIVE_MODULE));
    expect(r.status).toBe(500);          // the closed port refused the model call
  });
});

describe('a stored questionnaire that fails validation', () => {
  it('is not served to students', async () => {
    const active = await api.recipeDb.getActiveRecipe(SIM_MODULE);
    const questions = active!.checkinQuestions!;
    const broken = [questions[0], { ...questions[1], questionKey: questions[0].questionKey }];   // duplicate key
    await api.recipeDb.saveRecipe({ ...active!, checkinQuestions: broken });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const r = await checkin(await launch('learner-f', SIM_MODULE));
      expect(r.status).toBe(500);        // fell back to generating, which the closed port refuses
      // The 500 alone would also come from any other failure. The log line shows that
      // the stored questionnaire was rejected by validation, which is why it fell back.
      expect(JSON.stringify([...spy.mock.calls, ...warn.mock.calls])).toContain('CHECKIN_QUESTIONS_INVALID');
    } finally {
      spy.mockRestore(); warn.mockRestore();
      await api.recipeDb.saveRecipe({ ...active!, checkinQuestions: questions });
    }
    expect((await checkin(await launch('learner-g', SIM_MODULE))).status).toBe(200);
  });
});

describe('saving a recipe', () => {
  const good = [
    { questionKey: 'q1', questionText: 'Describe your experience.', responseType: 'short_text', theme: 'past' },
    { questionKey: 'q2', questionText: 'How confident are you?', responseType: 'likert',
      options: ['1 - Not at all', '2', '3', '4', '5 - Very'], theme: 'present' },
  ];
  const recipe = (extra: any) => ({ moduleId: 'save-test', moduleTitle: 'Save test', steps: [], ...extra });

  it('refuses a malformed questionnaire with the problems listed', async () => {
    const r = await save(recipe({ checkinQuestions: [{ ...good[0], questionText: '' }] }));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_CHECKIN_QUESTIONS');
    expect(r.body.problems.join(' ')).toContain('Question 1: needs question text.');
  });

  it('stores a valid questionnaire', async () => {
    const r = await save(recipe({ checkinQuestions: good }));
    expect(r.status).toBe(200);
    expect(r.body.checkinQuestions).toHaveLength(2);
  });

  it('treats an empty list as "not fixed"', async () => {
    const r = await save(recipe({ checkinQuestions: [] }));
    expect(r.status).toBe(200);
    expect(r.body.checkinQuestions).toBeUndefined();
  });
});

describe('publishing a draft from the authoring wizard', () => {
  // Publishing builds the recipe from a list of fields. A field missing from that
  // list is silently dropped from the next version, which would switch a module's
  // fixed check-in off the first time anyone edited it in the wizard.
  const questions = [
    { questionKey: 'q1', questionText: 'Describe your experience.', responseType: 'short_text', theme: 'past' },
    { questionKey: 'q2', questionText: 'How confident are you?', responseType: 'likert',
      options: ['1 - Not at all', '2', '3', '4', '5 - Very'], theme: 'present' },
  ];
  const draftData = (extra: any = {}) => ({
    moduleId: 'publish-test', moduleTitle: 'Publish test', moduleDescription: 'A module.',
    learningOutcomes: ['Do one thing.', 'Do another thing.'],
    steps: [{ stepId: 's1', stepNumber: 1, title: 'Step', description: 'Do it.',
      blocks: [{ blockId: 'b1', type: 'rich_text', body: 'Hello' }], outcomeTagIndices: [], understandingNote: '' }],
    ...extra,
  });

  async function publish(id: string, data: any): Promise<{ status: number; body: any }> {
    const { draftDb } = await import('../db/draftDb');
    const { publishDraft } = await import('../services/admin/authoringService');
    await draftDb.put({ draftId: id, title: 't', sections: {}, data, sourceMaterials: [], aiFields: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any);
    let status = 200; let body: any;
    const res: any = { status(c: number) { status = c; return res; }, json(b: any) { body = b; return res; } };
    await publishDraft({ params: { id } } as any, res);
    return { status, body };
  }

  it('keeps the fixed check-in questions on the published recipe', async () => {
    const r = await publish('draft-keep', draftData({ checkinQuestions: questions }));
    expect(r.status).toBe(200);
    expect(r.body.recipe.checkinQuestions).toEqual(questions);
  });

  it('publishes a draft with no fixed questions as "not fixed"', async () => {
    const r = await publish('draft-none', draftData());
    expect(r.status).toBe(200);
    expect(r.body.recipe.checkinQuestions).toBeUndefined();
  });

  it('never hands an undefined value to the recipe store', async () => {
    // The DynamoDB client rejects a property whose value is undefined, and the local JSON
    // store does not, so only a check of what is passed to the store catches this.
    const spy = vi.spyOn(api.recipeDb, 'saveRecipe');
    try {
      await publish('draft-undef-a', draftData());                                              // no tone, no fixed questions
      await publish('draft-undef-b', draftData({ toneGuidance: '   ', checkinQuestions: [] })); // blank tone, empty list
      await publish('draft-undef-c', draftData({ checkinQuestions: questions }));
      expect(spy).toHaveBeenCalledTimes(3);
      for (const [recipe] of spy.mock.calls) {
        for (const [key, value] of Object.entries(recipe)) expect(value, `property ${key}`).not.toBeUndefined();
      }
    } finally { spy.mockRestore(); }
  });

  it('stores the text and options without surrounding spaces', async () => {
    const padded = [{ questionKey: 'q1', questionText: '  Describe your experience.  ', responseType: 'multiple_choice',
      options: [' None ', 'Some'], theme: 'past' }];
    const r = await publish('draft-trim', draftData({ checkinQuestions: padded }));
    expect(r.status).toBe(200);
    expect(r.body.recipe.checkinQuestions[0].questionText).toBe('Describe your experience.');
    expect(r.body.recipe.checkinQuestions[0].options).toEqual(['None', 'Some']);
  });

  it('refuses a draft whose check-in questions are malformed', async () => {
    const r = await publish('draft-bad', draftData({ checkinQuestions: [{ ...questions[0], questionText: '' }] }));
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain('Check-in questions: Question 1: needs question text.');
  });
});

describe('restarting a local server', () => {
  it('does not put fixed questions back on a version an author published without them', async () => {
    const { seedLocalStore } = await import('../db/localStore');
    const active = await api.recipeDb.getActiveRecipe(SIM_MODULE);
    const { checkinQuestions: kept, ...withoutQuestions } = active!;
    await api.recipeDb.saveRecipe(withoutQuestions);          // an author chose "Stop using fixed questions"
    try {
      seedLocalStore();                                        // what a restart does
      expect((await api.recipeDb.getActiveRecipe(SIM_MODULE))!.checkinQuestions).toBeUndefined();
    } finally {
      await api.recipeDb.saveRecipe({ ...active!, checkinQuestions: kept });
    }
  });
});

describe('validateCheckinQuestions', () => {
  const q = (over: any = {}) => ({ questionKey: 'a', questionText: 'Text', responseType: 'short_text', ...over });

  it('accepts a good questionnaire', () => {
    expect(api.validate([q(), q({ questionKey: 'b', responseType: 'multiple_choice', options: ['x', 'y'], theme: 'future' })])).toEqual([]);
  });

  it('catches the mistakes an author can make', () => {
    const msgs = (input: unknown) => api.validate(input).join(' | ');
    expect(msgs('nope')).toContain('must be a list');
    expect(msgs([q({ questionKey: '' })])).toContain('needs a key');
    expect(msgs([q({ questionKey: 'has space' })])).toContain('needs a key');
    expect(msgs([q(), q()])).toContain('used twice');
    expect(msgs([q({ questionText: '   ' })])).toContain('needs question text');
    expect(msgs([q({ questionText: 'x'.repeat(301) })])).toContain('longer than 300');
    expect(msgs([q({ responseType: 'essay' })])).toContain('answer type');
    expect(msgs([q({ questionKey: ' a' })])).toContain('needs a key');   // a key is not trimmed
    expect(msgs([q({ responseType: 'likert' })])).toContain('at least 2 options');
    expect(msgs([q({ responseType: 'multiple_choice', options: ['only'] })])).toContain('at least 2 options');
    expect(msgs([q({ responseType: 'multiple_choice', options: ['a', ''] })])).toContain('every option needs text');
    expect(msgs([q({ responseType: 'multiple_choice', options: ['a', 'a'] })])).toContain('two options are the same');
    expect(msgs([q({ options: ['a', 'b'] })])).toContain('no options');
    expect(msgs([q({ theme: 'later' })])).toContain('theme');
    expect(msgs(Array.from({ length: 13 }, (_, i) => q({ questionKey: `k${i}` })))).toContain('At most 12');
  });
});
