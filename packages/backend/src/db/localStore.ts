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
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Recipe, CheckinResponse } from '@cap/shared';

const DATA_DIR  = path.resolve(__dirname, '../../.dev-data');
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
    activitySteps: [
      { stepNumber: 1,
        description: 'Log into SAP and review the customer master record for customer 1001.',
        outcomeTagIndices: [1],
        understandingNote: 'Student should recognize that master data is maintained once and reused across documents.' },
      { stepNumber: 2,
        description: 'Create an Inquiry (VA11) for customer 1001 requesting material M-001.',
        outcomeTagIndices: [0],
        understandingNote: 'An inquiry is a non-binding customer request — it is not a commitment to purchase.' },
      { stepNumber: 3,
        description: 'Create a Quotation (VA21) that references the inquiry you created.',
        outcomeTagIndices: [0],
        understandingNote: 'A quotation is a binding offer with prices, quantities, and validity dates; referencing the inquiry carries the data forward.' },
      { stepNumber: 4,
        description: 'Create a Sales Order (VA01) that references the quotation.',
        outcomeTagIndices: [0, 1],
        understandingNote: 'The order pulls data from the quotation — the document flow means nothing is re-keyed.' },
      { stepNumber: 5,
        description: 'Open the document flow view and confirm your three documents are linked.',
        outcomeTagIndices: [],
        understandingNote: '' },
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

export function seedLocalStore(): void {
  seedSapPool();
  seedRecipe();
  save();
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
};

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
