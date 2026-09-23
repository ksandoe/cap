/**
 * localStore.ts — Local development persistence.
 *
 * A JSON-file-backed store that mirrors the DynamoDB access-layer
 * interfaces (sessionDb, recipeDb, sapPool). Used only when
 * USE_LOCAL_DB=true so `npm run dev` works without AWS.
 *
 * Data lives in packages/backend/.dev-data/local-db.json.
 */
import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Recipe, CheckinResponse } from '@cap/shared';

// In Lambda the deployment dir is read-only — use /tmp (per-container,
// still ephemeral; acceptable for demo use per USE_LOCAL_DB semantics).
const DATA_DIR  = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join(os.tmpdir(), 'cap-dev-data')
  : path.resolve(__dirname, '../../.dev-data');
const DATA_FILE = path.join(DATA_DIR, 'local-db.json');

type Item = Record<string, any>;
type Table = Item[];

let _cache: Record<string, Table> | null = null;

function load(): Record<string, Table> {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    _cache = {};
  }
  return _cache!;
}

function save(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(_cache, null, 2));
}

function table(name: string): Table {
  const db = load();
  if (!db[name]) db[name] = [];
  return db[name];
}

// ── Seeds ────────────────────────────────────────────────────────────────────

const DEMO_MODULE_ID = 'demo-sales-process';

function seedSapPool(): void {
  const pool = table('cap-sap-pool');
  if (pool.length) return;
  for (let i = 1; i <= 5; i++) {
    pool.push({ sapUsername: `SAPUSER00${i}`, status: 'available' });
  }
}

function seedRecipe(): void {
  const recipes = table('cap-recipes');
  if (recipes.some(r => r.moduleId === DEMO_MODULE_ID)) return;
  const now = new Date().toISOString();
  recipes.push({
    recipeId:          uuidv4(),
    version:           1,
    moduleId:          DEMO_MODULE_ID,
    moduleTitle:       'The Sales Process',
    moduleDescription:
      'Students work through the SAP sales document flow — Inquiry, Quotation, ' +
      'and Sales Order — and learn why each document exists and how data carries forward.',
    learningOutcomes: [
      'Explain the purpose of each document in the inquiry–quotation–order sequence.',
      'Describe how master data flows into and is reused by sales documents.',
      'Connect the sales process to roles in procurement, operations, or sales.',
    ],
    keyConcepts: [
      { term: 'Inquiry',      definition: 'A non-binding request from a customer for pricing/availability. Not a commitment to purchase.' },
      { term: 'Quotation',    definition: 'A binding offer to the customer with defined prices, quantities, and validity dates.' },
      { term: 'Sales Order',  definition: 'A confirmed agreement to deliver; typically references a quotation or inquiry.' },
      { term: 'Document flow', definition: 'The linked chain of documents (inquiry → quotation → order) that carries data forward automatically.' },
      { term: 'Master data',  definition: 'Reusable records (customer, material) that populate sales documents rather than being re-entered.' },
    ],
    probingRules: [
      { trigger: 'Student describes a step without explaining its purpose',
        followUp: 'Ask why that document/step exists in the process.' },
      { trigger: 'Student names transaction codes without describing the business outcome',
        followUp: 'Ask what the business achieves with that document.' },
    ],
    // Content model: module → steps → blocks. Step 1 is conceptual background;
    // step 2 is the hands-on SAP exercise (rich-text instructions alongside an
    // embedded-tool gate, a self-check checklist, and a troubleshooting branch).
    steps: [
      { stepId: 'st-1', stepNumber: 1,
        title: 'Understand the sales document flow',
        description: 'Read the background on the SAP sales document flow and check your understanding.',
        outcomeTagIndices: [0],
        understandingNote: 'Student should grasp the inquiry → quotation → order chain and why each document exists, not just the transaction codes.',
        blocks: [
          { blockId: 'cb-concept-1', type: 'rich_text',
            title: 'Background: the SAP sales document flow',
            body: 'SAP ERP tracks the sales process as a chain of linked documents: ' +
              'Inquiry → Quotation → Sales Order. Each document references its ' +
              'predecessor, so master data and line items carry forward without ' +
              're-keying. Understanding *why* each document exists matters more ' +
              'than memorizing transaction codes.' },
          { blockId: 'cb-kc-1', type: 'knowledge_check',
            title: 'Quick self-check',
            questions: [
              { questionId: 'q1', type: 'multiple_choice',
                prompt: 'Which document commits the selling company to a price?',
                options: ['Inquiry', 'Quotation', 'Sales Order'],
                correctAnswer: 'Quotation',
                feedback: 'The quotation is the binding offer; the inquiry carries no commitment.' },
              { questionId: 'q2', type: 'true_false',
                prompt: 'An inquiry is a commitment to purchase.',
                correctAnswer: 'false',
                feedback: 'An inquiry is non-binding — it only signals customer interest.' },
            ] },
        ] },
      { stepId: 'st-2', stepNumber: 2,
        title: 'Create the linked documents in SAP',
        description: 'In the SAP sandbox, create an Inquiry (VA11), a Quotation (VA21) referencing it, and a Sales Order (VA01) referencing the quotation — customer 1001, material M-001 — then confirm the document flow.',
        outcomeTagIndices: [0, 1],
        understandingNote: 'Student should recognize that master data is maintained once and reused; referencing carries data forward so nothing is re-keyed; inquiry is non-binding while quotation is a binding offer.',
        blocks: [
          { blockId: 'cb-instr-1', type: 'rich_text',
            title: 'Instructions',
            body: '1. Log into SAP and review the customer master record for customer 1001.\n' +
              '2. Create an Inquiry (VA11) for customer 1001 requesting material M-001.\n' +
              '3. Create a Quotation (VA21) that references the inquiry you created.\n' +
              '4. Create a Sales Order (VA01) that references the quotation.\n' +
              '5. Open the document flow view and confirm your three documents are linked.' },
          { blockId: 'cb-sap-1', type: 'embedded_tool',
            title: 'SAP sandbox exercise',
            tool: 'sap',
            launch: 'link',
            taskPrompt: 'In your assigned SAP sandbox, create an Inquiry (VA11), a ' +
              'Quotation (VA21) referencing it, and a Sales Order (VA01) referencing ' +
              'the quotation — all for customer 1001, material M-001.',
            isGate: true },
          { blockId: 'cb-cl-1', type: 'checklist',
            title: 'Before you continue',
            items: [
              { itemId: 'i1', label: 'I saved the Inquiry and noted its document number.' },
              { itemId: 'i2', label: 'I saved the Quotation and noted its document number.' },
              { itemId: 'i3', label: 'I saved the Sales Order and confirmed the document flow links all three.' },
            ] },
          { blockId: 'cb-bn-1', type: 'branching_note',
            trigger: 'Something went wrong in SAP?',
            paths: [
              { pathId: 'p1', label: 'A field was rejected (e.g. material not found)',
                body: 'Double-check the test data: customer 1001, material M-001, sales org 1000, channel 10, division 00. Typos in master data fields are the most common cause.' },
              { pathId: 'p2', label: 'You cannot find the reference option',
                body: 'On the VA21/VA01 initial screen, use "Create with Reference" rather than typing the document into a blank form — referencing is what links your documents in the flow.' },
            ] },
        ] },
    ],
    rubricDimensions: [
      { name: 'Process understanding',   description: 'Explains the inquiry–quotation–order sequence and why each document exists.' },
      { name: 'Conceptual vocabulary',   description: 'Uses domain terms (document flow, master data, binding vs non-binding) accurately.' },
      { name: 'Transfer and reflection', description: 'Connects the process to durable skills and career contexts.' },
    ],
    vagueAnswerTriggers: [
      'Student describes a step without explaining its purpose.',
      'Student uses vocabulary without demonstrating what it means.',
    ],
    careerTransferPrompts: [
      'How might understanding this document flow help you in a procurement or operations role?',
      'What transferable skills do you feel you practiced during this activity?',
    ],
    toneGuidance:
      'Most students have no prior ERP experience. Be especially patient and scaffolding ' +
      'early in the conversation; affirm effort before probing deeper.',
    maxTurns: 20,
    contentStub: {
      summaryText:
        'In this module you will act as a sales clerk in SAP. You will create three linked ' +
        'documents — an Inquiry, a Quotation, and a Sales Order — for customer 1001 and ' +
        'material M-001, then confirm the document flow connects them.',
      resourceLinks: [
        { url: 'https://help.sap.com', label: 'SAP Help Portal', type: 'reading' },
      ],
    },
    isActive:  true,
    createdAt: now,
    updatedAt: now,
  } as Recipe);
}

function seedAdminUsers(): void {
  const users = table('admin_users');
  if (users.length) return;
  // Dev-only admin login — production uses Aurora admin_users + institutional SSO
  users.push(
    { email: 'admin@cap.local',      password: 'dev-admin-password',      role: 'admin' },
    { email: 'author@cap.local',     password: 'dev-author-password',     role: 'author' },
    { email: 'instructor@cap.local', password: 'dev-instructor-password', role: 'instructor' },
    { email: 'researcher@cap.local', password: 'dev-researcher-password', role: 'researcher' },
  );
}

export function seedLocalStore(): void {
  seedSapPool();
  seedRecipe();
  seedAdminUsers();
  save();
}

// ── adminUsers (dev auth for the Admin App) ───────────────────────────────────

export function findAdminUser(email: string) {
  return table('admin_users').find(u => u.email === email) ?? null;
}

/** Modules visible to the dev launchpad (distinct active recipes). */
export function listModules(): { moduleId: string; moduleTitle: string }[] {
  const seen = new Map<string, string>();
  for (const r of table('cap-recipes')) {
    if (r.isActive && !seen.has(r.moduleId)) seen.set(r.moduleId, r.moduleTitle);
  }
  return [...seen.entries()].map(([moduleId, moduleTitle]) => ({ moduleId, moduleTitle }));
}

// ── sessionDb ────────────────────────────────────────────────────────────────

export const localSessionDb = {
  async getSession(sessionId: string) {
    return table('cap-sessions').find(s => s.sessionId === sessionId) ?? null;
  },
  async putSession(session: Item) {
    const t = table('cap-sessions');
    const i = t.findIndex(s => s.sessionId === session.sessionId);
    if (i >= 0) t[i] = session; else t.push(session);
    save();
  },
  async updateSession(sessionId: string, updates: Item) {
    const t = table('cap-sessions');
    const i = t.findIndex(s => s.sessionId === sessionId);
    if (i < 0) return;
    t[i] = { ...t[i], ...updates };
    save();
  },
  async deleteSession(sessionId: string) {
    const t = table('cap-sessions');
    const i = t.findIndex(s => s.sessionId === sessionId);
    if (i >= 0) { t.splice(i, 1); save(); }
  },
  async findActiveSession(canvasUuid: string, moduleId: string) {
    return table('cap-sessions').find(s =>
      s.canvasUuid === canvasUuid && s.moduleId === moduleId &&
      s.state !== 'COMPLETED' && s.state !== 'EXPIRED'
    ) ?? null;
  },
};

// ── recipeDb ─────────────────────────────────────────────────────────────────

export const localRecipeDb = {
  async getActiveRecipe(moduleId: string): Promise<Recipe | null> {
    return (table('cap-recipes')
      .find(r => r.moduleId === moduleId && r.isActive) as Recipe) ?? null;
  },
  async saveRecipe(recipe: Partial<Recipe>): Promise<Recipe> {
    const versions = await localRecipeDb.listVersions(recipe.moduleId!);
    const nextVer  = versions.length ? Math.max(...versions.map((v: any) => v.version)) + 1 : 1;
    const t = table('cap-recipes');
    t.forEach(r => { if (r.moduleId === recipe.moduleId) r.isActive = false; });
    const saved = {
      ...recipe, version: nextVer, isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as Recipe;
    t.push(saved);
    save();
    return saved;
  },
  async listVersions(moduleId: string) {
    return table('cap-recipes').filter(r => r.moduleId === moduleId);
  },
  async listActiveModules() {
    return listModules();
  },
  async listAllRecipes() {
    return [...table('cap-recipes')];
  },
};

/** Demo seed data (recipe + SAP pool) — used by scripts/seed-demo.ts to
 *  push the same content into DynamoDB when running against live tables. */
export function demoSeedData() {
  seedLocalStore();
  return { recipes: [...table('cap-recipes')], sapPool: [...table('cap-sap-pool')] };
}

// ── sapPool ──────────────────────────────────────────────────────────────────

export const localSapPool = {
  async acquireSapAccount(sessionId: string): Promise<string> {
    const pool   = table('cap-sap-pool');
    const free   = pool.filter(a => a.status === 'available');
    if (!free.length) throw new Error('SAP_POOL_EXHAUSTED');
    const account = free[Math.floor(Math.random() * free.length)];
    account.status = 'in_use';
    account.assignedSessionId = sessionId;
    account.assignedAt = new Date().toISOString();
    save();
    return account.sapUsername;
  },
  async releaseSapAccount(sapUsername: string): Promise<void> {
    const account = table('cap-sap-pool').find(a => a.sapUsername === sapUsername);
    if (!account) return;
    account.status = 'available';
    delete account.assignedSessionId;
    delete account.assignedAt;
    save();
  },
};

export const LOCAL_DEMO_MODULE_ID = DEMO_MODULE_ID;
export type { CheckinResponse };
