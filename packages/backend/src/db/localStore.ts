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
    // Mirrors the real assignment's variation points: every student gets a
    // distinct customer reference (the modern stand-in for the 3-digit SAP
    // ID), slightly different quantities, discounts, and probabilities —
    // different but known results the evaluator can sanity-check.
    params.push({
      moduleId: DEMO_MODULE_ID,
      sapUsername: a.sapUsername,
      values: {
        custRef:       String(100 + i),
        dxtrQty:       String(4 + (i % 4)),
        prtrQty:       String(2 + (i % 3)),
        itemDiscount:  String(40 + (i % 4) * 10),
        orderDiscount: String(4 + (i % 3)),
        orderProb:     String(60 + (i % 4) * 10),
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
      'Philly Bikes, a prospective customer, wants pricing on two bicycle models. ' +
      'Students work the SAP sales document flow — Inquiry, Quotation, and Sales ' +
      'Order — and learn why each document exists and how data carries forward.',
    learningOutcomes: [
      'Describe how inquiries, quotations, and sales orders are connected within the SAP sales process.',
      'Complete the inquiry-to-sales-order process in SAP using appropriate customer, product, pricing, and transaction information.',
      'Interpret selected sales information, including order probability, expected order value, and pricing conditions.',
      'Explain how SAP carries information across related documents to support an integrated business process.',
      'Reflect on their experience using SAP and identify ways their understanding, confidence, or approach to enterprise systems developed during the activity.',
    ],
    keyConcepts: [
      { term: 'Inquiry',      definition: 'A non-binding request from a customer for pricing/availability. Not a commitment to purchase.' },
      { term: 'Quotation',    definition: 'A binding offer to the customer with defined prices, quantities, and validity dates.' },
      { term: 'Sales Order',  definition: 'A confirmed agreement to deliver; typically references a quotation or inquiry.' },
      { term: 'Document flow', definition: 'The linked chain of documents (inquiry → quotation → order) that carries data forward automatically.' },
      { term: 'Master data',  definition: 'Reusable records (customer, material) that populate sales documents rather than being re-entered.' },
      { term: 'Expected order value', definition: 'Net value × order probability — an estimate of likely revenue used for pipeline reporting.' },
      { term: 'Condition types', definition: 'Pricing building blocks (e.g. K004 item discount, RA00 net discount) that combine to calculate the final price.' },
    ],
    // IF/THEN pairs — when the trigger pattern appears, the agent should
    // follow up along these lines. Authoring guidance: name the *pattern*
    // in the trigger (not a literal phrase), and aim the follow-up at the
    // understanding gap, not the missing fact.
    probingRules: [
      { trigger: 'Student describes a step without explaining its purpose',
        followUp: 'Ask why that document exists in the process — what would be lost without it.' },
      { trigger: 'Student names codes (IN/QT/OR, K004/RA00, VA11) without saying what they mean',
        followUp: 'Ask what the business gets from that document or discount — meaning over memorization.' },
      { trigger: 'Student says they "just followed the instructions" or clicked through',
        followUp: 'Ask what would have been different if they had re-typed everything by hand — i.e., what "Create with Reference" actually did for them.' },
      { trigger: 'Student glosses over order probability or expected order value',
        followUp: 'Ask them to explain the calculation in their own words using their assigned probability and quantities.' },
      { trigger: 'Student mentions an SAP message, warning, or something unexpected',
        followUp: 'Ask what the message was telling them and how they decided what to do next.' },
      { trigger: 'Student says data "just appeared" or carried over without reflection',
        followUp: 'Ask which fields they entered themselves versus which arrived from the earlier document.' },
      { trigger: 'Student mentions both discounts but not the difference between them',
        followUp: 'Ask which discount applied to a single bike versus the whole order, and why a company would use each.' },
    ],
    // Per-student parameters — values are bound at launch from the cap-params
    // table row for the student's assigned SAP account, and substituted into
    // guided-tool instruction text wherever {key} appears.
    parameters: [
      { key: 'custRef',       label: 'Customer reference (3-digit ID)' },
      { key: 'dxtrQty',       label: 'Deluxe Touring bikes' },
      { key: 'prtrQty',       label: 'Professional Touring bikes' },
      { key: 'itemDiscount',  label: 'Deluxe item discount ($)' },
      { key: 'orderDiscount', label: 'Order discount (%)' },
      { key: 'orderProb',     label: 'Order probability (%)' },
    ],
    // Content model: module → steps → blocks. One screen per step in the
    // student wizard; guided-tool blocks carry the SAP instructions with
    // {param} placeholders, per-instruction branches, and a progress bar.
    steps: [
      { stepId: 'st-intro', stepNumber: 1,
        title: 'Introduction',
        description: 'Read the background on the SAP sales document flow and check your understanding.',
        outcomeTagIndices: [0, 3],
        understandingNote:
          'Listen for: the three documents named in sequence and framed as one connected ' +
          'flow rather than three isolated forms — ideally with a sense of who commits whom ' +
          'at each hop (customer interest → seller\u2019s offer → confirmed agreement).',
        blocks: [
          { blockId: 'cb-concept-1', type: 'rich_text',
            title: 'Scenario: Philly Bikes',
            body: '<p><strong>Philly Bikes</strong>, a prospective customer, wants prices on ' +
              'two models: the <em>Deluxe Touring Bike (black)</em> and the ' +
              '<em>Professional Touring Bike (black)</em>. You will create three linked ' +
              'documents to answer them.</p><p>SAP tracks the sales process as a chain: ' +
              '<strong>Inquiry → Quotation → Sales Order</strong>. Each document references its ' +
              'predecessor, so customer and material data carry forward without re-keying. ' +
              'Understanding <em>why</em> each document exists matters more than memorizing ' +
              'transaction codes.</p><p>Your task values (quantities, discounts, and your ' +
              '3-digit customer reference) are highlighted in the instructions — they are ' +
              'specific to you.</p>' },
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
        description: 'In the SAP sandbox, create an Inquiry for Philly Bikes — a non-binding record of what the customer asked for.',
        outcomeTagIndices: [1, 2],
        understandingNote:
          'Listen for: the inquiry as a record of customer interest that binds nobody; ' +
          'order probability driving expected order value (can the student explain net value ' +
          '× their assigned probability, ideally with their own numbers?); customer and ' +
          'material master data being found and reused rather than re-keyed; and why the ' +
          'unique customer reference made their documents findable later.',
        blocks: [
          { blockId: 'cb-gt-inq', type: 'guided_tool',
            title: 'Create the inquiry',
            tool: 'sap',
            layout: 'side_by_side',
            isGate: true,
            instructions: [
              { instructionId: 'gi-1', text: 'Log into your assigned SAP sandbox account and create an inquiry (Sales → Inquiry → Create, or transaction VA11).' },
              { instructionId: 'gi-2', text: 'Enter inquiry type <strong>IN</strong>, sales organization <strong>UE00</strong>, distribution channel <strong>WH</strong>, division <strong>BI</strong>, then continue.<p><img src="/img/seed-inq-orgdata" alt="Create Inquiry initial screen"></p>',
                branches: [
                  { branchId: 'gb-1', condition: 'If a field is rejected',
                    text: 'Check the org data exactly: UE00 / WH / BI — typos here are the most common cause of errors.' },
                ] },
              { instructionId: 'gi-3', text: 'Search the Sold-To Party using your customer reference {custRef} with country US, and select <strong>PHILLY BIKES</strong>.<p><img src="/img/seed-inq-soldto" alt="Customer search dialog"></p><p><img src="/img/seed-inq-custlist" alt="Customer list"></p>' },
              { instructionId: 'gi-4', text: 'Enter {custRef} for Cust. Reference, today for the reference date and Valid From, and one month from today for Valid To.' },
              { instructionId: 'gi-5', text: 'Find the two materials Philly Bikes asked about — search for *{custRef} — and select <strong>DXTR1-{custRef}</strong> (Deluxe Touring, black) and <strong>PRTR1-{custRef}</strong> (Professional Touring, black).<p><img src="/img/seed-inq-matlist" alt="Material search results"></p>' },
              { instructionId: 'gi-6', text: 'Enter the order quantities: {dxtrQty} for the Deluxe Touring and {prtrQty} for the Professional Touring. Check the net value shown.<p><img src="/img/seed-inq-qty" alt="Inquiry overview with quantities"></p>' },
              { instructionId: 'gi-7', text: 'Select both items, open the item conditions, and on the Sales A tab set the order probability to {orderProb}% for each item. Return to the overview and confirm the expected order value recalculated.<p><img src="/img/seed-inq-itemcond" alt="Item conditions navigation"></p><p><img src="/img/seed-inq-salesa" alt="Sales A tab — order probability"></p>',
                branches: [
                  { branchId: 'gb-2', condition: 'What is expected order value?',
                    text: 'Net value × order probability — a 30% probability on a $21,400 inquiry shows 6,420. It estimates likely revenue, not a price the customer sees.<p><img src="/img/seed-inq-result" alt="Expected order value result"></p>' },
                ] },
              { instructionId: 'gi-8', text: 'Save and write down the inquiry document number — you will need it for the quotation.' },
            ] },
          { blockId: 'cb-cl-inq', type: 'checklist',
            title: 'Before you continue',
            items: [
              { itemId: 'i1', label: 'I saved the Inquiry and noted its document number.' },
            ] },
        ] },
      { stepId: 'st-quotation', stepNumber: 3,
        title: 'Quotation',
        description: 'Create a Quotation that references your inquiry — the binding offer — and apply your authorized discounts.',
        outcomeTagIndices: [1, 2],
        understandingNote:
          'Listen for: the quotation as the seller\u2019s binding offer; "Create with Reference" ' +
          'carrying sold-to, materials, and quantities forward instead of re-keying; the ' +
          'difference between an item-level condition (K004 — one bike) and an order-level ' +
          'condition (RA00 — the whole order); and why a business would want both knobs.',
        blocks: [
          { blockId: 'cb-gt-quot', type: 'guided_tool',
            title: 'Create the quotation',
            tool: 'sap',
            layout: 'side_by_side',
            isGate: true,
            instructions: [
              { instructionId: 'gi-1', text: 'Create a quotation (Sales → Quotation → Create, or transaction VA21). Enter quotation type <strong>QT</strong>, then click <strong>Create with Reference</strong> — do not type the data into a blank form.<p><img src="/img/seed-qt-create" alt="Create Quotation initial screen"></p><p><img src="/img/seed-qt-refdialog" alt="Create with Reference dialog"></p>',
                branches: [
                  { branchId: 'gb-1', condition: 'Why "Create with Reference"?',
                    text: 'Referencing is what links your documents in the flow — the customer, materials, and quantities copy forward from your inquiry instead of being re-keyed.' },
                ] },
              { instructionId: 'gi-2', text: 'On the Inquiry tab, search by your customer reference {custRef}, select the inquiry you just created, and click <strong>Copy</strong>.<p><img src="/img/seed-qt-search" alt="Inquiry search dialog"></p><p><img src="/img/seed-qt-list" alt="Inquiry list — select and copy"></p>' },
              { instructionId: 'gi-3', text: 'Enter {custRef} for Cust. Reference, today for the reference date, and one month from today for Valid To and Req. Deliv. Date. Press Enter and acknowledge any warnings.<p><img src="/img/seed-qt-overview" alt="Quotation overview"></p>' },
              { instructionId: 'gi-4', text: 'Select the Deluxe Touring item and open its item conditions. Add condition type <strong>K004</strong> (material discount) with amount <strong>{itemDiscount}</strong>, then return to the quotation.<p><img src="/img/seed-qt-itemcond" alt="Item pricing conditions — K004"></p>' },
              { instructionId: 'gi-5', text: 'For the order-level discount: Goto → Header → Conditions, add condition type <strong>RA00</strong> (net discount) with amount <strong>{orderDiscount}</strong>, press Enter, then click the activate icon to apply it.<p><img src="/img/seed-qt-activate" alt="Header conditions — activate RA00"></p>',
                branches: [
                  { branchId: 'gb-2', condition: 'Discount not showing in the price?',
                    text: 'The header condition only takes effect after you click the activate icon — an easy step to miss.' },
                ] },
              { instructionId: 'gi-6', text: 'Save and note the quotation document number from the status message.' },
            ] },
          { blockId: 'cb-cl-quot', type: 'checklist',
            title: 'Before you continue',
            items: [
              { itemId: 'i1', label: 'I saved the Quotation and noted its document number.' },
            ] },
        ] },
      { stepId: 'st-order', stepNumber: 4,
        title: 'Sales Order',
        description: 'Philly Bikes accepted your quotation — create the Sales Order by reference and confirm the document flow links all three documents.',
        outcomeTagIndices: [1, 3],
        understandingNote:
          'Listen for: the order as the confirmed agreement that completes the chain; ' +
          'ability to trace the document flow backward (order ← quotation ← inquiry) and ' +
          'name what traveled in each hop; awareness of what they still had to enter ' +
          'versus what arrived automatically.',
        blocks: [
          { blockId: 'cb-gt-ord', type: 'guided_tool',
            title: 'Create the sales order',
            tool: 'sap',
            layout: 'side_by_side',
            isGate: true,
            instructions: [
              { instructionId: 'gi-1', text: 'Create a sales order (Sales → Order → Create, or transaction VA01). Enter order type <strong>OR</strong>, then click <strong>Create with Reference</strong>.<p><img src="/img/seed-ord-create" alt="Create Sales Order initial screen"></p><p><img src="/img/seed-ord-refdialog" alt="Reference dialog"></p>' },
              { instructionId: 'gi-2', text: 'Search by your customer reference {custRef}, select the quotation you just created, and click <strong>Copy</strong>.<p><img src="/img/seed-ord-list" alt="Quotation list — select and copy"></p>' },
              { instructionId: 'gi-3', text: 'Enter {custRef} for Cust. Reference and today for the reference date. Notice the Req. Deliv. Date carried forward from the quotation.<p><img src="/img/seed-ord-overview" alt="Sales order overview"></p>' },
              { instructionId: 'gi-4', text: 'Save the sales order and note its document number from the confirmation message.' },
              { instructionId: 'gi-5', text: 'Open the document flow view and confirm your Inquiry, Quotation, and Sales Order are linked.' },
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
    // Patterns that signal a thin answer worth a follow-up. Authoring
    // guidance: describe the *shape* of a vague answer, not a keyword.
    vagueAnswerTriggers: [
      'Student describes a step without explaining its purpose.',
      'Student uses vocabulary without demonstrating what it means.',
      'Student repeats instruction text ("I entered the values") instead of describing their own experience.',
      '"It worked" or "it just did it" without saying what actually happened.',
      'Student says data "copied over" without identifying which document supplied it.',
      'Student cites a document number or code as if it demonstrates understanding.',
    ],
    careerTransferPrompts: [
      'How might understanding this document flow help you in a procurement or operations role?',
      'What transferable skills do you feel you practiced during this activity?',
    ],
    toneGuidance:
      'Most students have no prior ERP experience. Be especially patient and scaffolding ' +
      'early in the conversation; affirm effort before probing deeper.',
    maxTurns: 12,
    contentStub: {
      summaryText:
        'In this module you will act as a sales clerk in SAP. You will create three linked ' +
        'documents — an Inquiry, a Quotation, and a Sales Order — for Philly Bikes and its ' +
        'touring bikes, then confirm the document flow connects them.',
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
  async findBySessionKey(sessionKey: string) {
    return table('cap-sessions').find(s =>
      s.sessionKey === sessionKey &&
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

// ── moduleConfigDb ──────────────────────────────────────────────────────────

export const localModuleConfigDb = {
  async getConfig(moduleId: string) {
    const row = table('cap-module-config').find(c => c.moduleId === moduleId);
    return { moduleId, overallMin: 60, dimensionFloor: 40, ...(row ?? {}) };
  },
  async saveConfig(cfg: Record<string, any>) {
    const t = table('cap-module-config');
    const i = t.findIndex(c => c.moduleId === cfg.moduleId);
    if (i >= 0) t[i] = cfg; else t.push(cfg);
    save();
  },
};

// ── evalDb ───────────────────────────────────────────────────────────────────

export const localEvalDb = {
  async saveAttempt(rec: Record<string, any>) {
    const t = table('cap-evaluations');
    const i = t.findIndex(r => r.attemptId === rec.attemptId);
    if (i >= 0) t[i] = rec; else t.push(rec);
    save();
  },
  async getAttempt(attemptId: string) {
    return table('cap-evaluations').find(r => r.attemptId === attemptId) ?? null;
  },
  async listForModule(moduleId: string) {
    return table('cap-evaluations').filter(r => r.moduleId === moduleId);
  },
};

// ── assetDb ──────────────────────────────────────────────────────────────────

export const localAssetDb = {
  async put(a: Record<string, any>) { table('cap-assets').push(a); save(); },
  async get(assetId: string) {
    return table('cap-assets').find((a: any) => a.assetId === assetId) ?? null;
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
