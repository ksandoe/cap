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
  for (let i = 1; i <= 10; i++) {
    pool.push({ sapUsername: `SAPUSER${String(i).padStart(3, '0')}`, status: 'available' });
  }
}

// Per-account parameter values for guided-tool instruction placeholders.
// Each pooled account gets different-but-known task data — the modern
// replacement for seeding assignments from the student's own userid.
function seedParams(): void {
  const params = table('cap-params');
  if (params.length) return;
  const pool = table('cap-sap-pool');
  pool.forEach((a, i) => {
    params.push({
      moduleId: DEMO_MODULE_ID,
      sapUsername: a.sapUsername,
      values: {
        customer:     `100${(i % 10) + 1}`,
        material:     'M-001',
        orderQty:     String(10 + (i % 10) * 5),
        discountRate: `${i % 10}%`,
      },
    });
  });
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
    // Per-student parameters — values are bound at launch from the cap-params
    // table row for the student's assigned SAP account, and substituted into
    // guided-tool instruction text wherever {key} appears.
    parameters: [
      { key: 'customer',     label: 'Customer number' },
      { key: 'material',     label: 'Material number' },
      { key: 'orderQty',     label: 'Order quantity' },
      { key: 'discountRate', label: 'Discount rate' },
    ],
    // Content model: module → steps → blocks. One screen per step in the
    // student wizard; guided-tool blocks carry the SAP instructions with
    // {param} placeholders, per-instruction branches, and a progress bar.
    steps: [
      { stepId: 'st-intro', stepNumber: 1,
        title: 'Introduction',
        description: 'Read the background on the SAP sales document flow and check your understanding.',
        outcomeTagIndices: [0],
        understandingNote: 'Student should grasp the inquiry → quotation → order chain and why each document exists, not just the transaction codes.',
        blocks: [
          { blockId: 'cb-concept-1', type: 'rich_text',
            title: 'Background: the SAP sales document flow',
            body: '<p>SAP ERP tracks the sales process as a chain of linked documents: ' +
              '<strong>Inquiry → Quotation → Sales Order</strong>. Each document references its ' +
              'predecessor, so master data and line items carry forward without ' +
              're-keying.</p><p>Understanding <em>why</em> each document exists matters more ' +
              'than memorizing transaction codes.</p>' },
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
      { stepId: 'st-inquiry', stepNumber: 2,
        title: 'Inquiry',
        description: 'In the SAP sandbox, create an Inquiry (VA11) for your assigned customer requesting your assigned material and quantity.',
        outcomeTagIndices: [0, 1],
        understandingNote: 'Student should recognize that an inquiry records customer interest without committing either party, and that master data (customer, material) is reused rather than re-keyed.',
        blocks: [
          { blockId: 'cb-gt-inq', type: 'guided_tool',
            title: 'Create the inquiry (VA11)',
            tool: 'sap',
            layout: 'side_by_side',
            isGate: true,
            instructions: [
              { instructionId: 'gi-1', text: 'Log into your assigned SAP sandbox account and open transaction VA11 (Create Inquiry).' },
              { instructionId: 'gi-2', text: 'Enter inquiry type AF, sales org 1000, distribution channel 10, division 00.',
                branches: [
                  { branchId: 'gb-1', condition: 'If a field is rejected',
                    text: 'Check the org data exactly: sales org 1000, channel 10, division 00 — typos here are the most common cause.' },
                ] },
              { instructionId: 'gi-3', text: 'Enter sold-to party {customer} and add material {material} with quantity {orderQty}.' },
              { instructionId: 'gi-4', text: 'Save and note the inquiry document number.' },
            ] },
          { blockId: 'cb-cl-inq', type: 'checklist',
            title: 'Before you continue',
            items: [
              { itemId: 'i1', label: 'I saved the Inquiry and noted its document number.' },
            ] },
        ] },
      { stepId: 'st-quotation', stepNumber: 3,
        title: 'Quotation',
        description: 'Create a Quotation (VA21) that references your inquiry, applying your assigned discount.',
        outcomeTagIndices: [0, 1],
        understandingNote: 'Student should see that the quotation is the binding offer and that referencing the inquiry carries data forward instead of re-entering it.',
        blocks: [
          { blockId: 'cb-gt-quot', type: 'guided_tool',
            title: 'Create the quotation (VA21)',
            tool: 'sap',
            layout: 'side_by_side',
            isGate: true,
            instructions: [
              { instructionId: 'gi-1', text: 'Open transaction VA21 (Create Quotation).' },
              { instructionId: 'gi-2', text: 'Use "Create with Reference" and select the inquiry you created — do not type the data into a blank form.',
                branches: [
                  { branchId: 'gb-1', condition: 'If you cannot find the reference option',
                    text: 'On the VA21 initial screen, the button is "Create with Reference" — referencing is what links your documents in the flow.' },
                ] },
              { instructionId: 'gi-3', text: 'Verify customer {customer}, material {material}, quantity {orderQty} carried forward, then apply a {discountRate} discount.' },
              { instructionId: 'gi-4', text: 'Save and note the quotation document number.' },
            ] },
          { blockId: 'cb-cl-quot', type: 'checklist',
            title: 'Before you continue',
            items: [
              { itemId: 'i1', label: 'I saved the Quotation and noted its document number.' },
            ] },
        ] },
      { stepId: 'st-order', stepNumber: 4,
        title: 'Sales Order',
        description: 'Create a Sales Order (VA01) referencing your quotation, then confirm the document flow links all three documents.',
        outcomeTagIndices: [0, 1],
        understandingNote: 'Student should recognize the order as the confirmed agreement, and be able to trace the full inquiry → quotation → order document flow.',
        blocks: [
          { blockId: 'cb-gt-ord', type: 'guided_tool',
            title: 'Create the sales order (VA01)',
            tool: 'sap',
            layout: 'side_by_side',
            isGate: true,
            instructions: [
              { instructionId: 'gi-1', text: 'Open transaction VA01 (Create Sales Order) and use "Create with Reference" to reference your quotation.' },
              { instructionId: 'gi-2', text: 'Confirm the data carried forward: customer {customer}, material {material}, quantity {orderQty}, discount {discountRate}.' },
              { instructionId: 'gi-3', text: 'Save the sales order and note its document number.' },
              { instructionId: 'gi-4', text: 'Open the document flow view and confirm your Inquiry, Quotation, and Sales Order are linked.' },
            ] },
          { blockId: 'cb-cl-ord', type: 'checklist',
            title: 'Before you continue',
            items: [
              { itemId: 'i1', label: 'I saved the Sales Order and confirmed the document flow links all three documents.' },
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
    { email: 'cap@cap.local',        password: 'dev-cap-password',        role: 'admin' },
    { email: 'admin@cap.local',      password: 'dev-admin-password',      role: 'admin' },
    { email: 'author@cap.local',     password: 'dev-author-password',     role: 'author' },
    { email: 'instructor@cap.local', password: 'dev-instructor-password', role: 'instructor' },
    { email: 'researcher@cap.local', password: 'dev-researcher-password', role: 'researcher' },
  );
}

export function seedLocalStore(): void {
  seedSapPool();
  seedParams();
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
      s.state !== 'COMPLETED' && s.state !== 'EXPIRED' && s.state !== 'INTERRUPTED'
    ) ?? null;
  },
  async listSessions() {
    return [...table('cap-sessions')];
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

/** Demo seed data (recipe + SAP pool + params) — used by scripts/seed-demo.ts
 *  to push the same content into DynamoDB when running against live tables. */
export function demoSeedData() {
  seedLocalStore();
  return {
    recipes: [...table('cap-recipes')],
    sapPool: [...table('cap-sap-pool')],
    params:  [...table('cap-params')],
  };
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

// ── paramDb ──────────────────────────────────────────────────────────────────

export const localParamDb = {
  async getParams(moduleId: string, sapUsername: string): Promise<Record<string, string>> {
    const row = table('cap-params')
      .find(p => p.moduleId === moduleId && p.sapUsername === sapUsername);
    return { ...(row?.values ?? {}) };
  },
};

export const LOCAL_DEMO_MODULE_ID = DEMO_MODULE_ID;
export type { CheckinResponse };
