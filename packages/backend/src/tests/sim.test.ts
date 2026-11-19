/**
 * sim.test.ts — Work package 1, task B6.
 *
 * Two guarantees:
 *   1. No response from any /sim/* or /session/* endpoint contains an
 *      expected net value (or any other server-only field: seed,
 *      studentKey/learnerKey).
 *   2. Verification passes a correct document set and fails a wrong one —
 *      decided on `passed`, with student-safe items and no expected values.
 *
 * Runs against the JSON-file store (USE_LOCAL_DB) on an ephemeral port with
 * a throwaway data file — no AWS, no side effects on dev data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'http';

process.env.USE_LOCAL_DB         = 'true';
process.env.NODE_ENV             = 'production';   // suppress app.listen's dev boot
process.env.SESSION_JWT_SECRET   = 'sim-test-secret';
process.env.CAP_LOCAL_DB_FILE    = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'cap-sim-test-')), 'db.json');

const SIM_MODULE  = 'sim-sales-process';
const LEARNER     = 'test-learner-1';
const DOC_TYPE_OF = { inquiry: 'VA11', quotation: 'VA21', order: 'VA01' } as const;

let server: Server;
let base: string;
let api: { [k: string]: any };

const fetchJson = async (
  url: string, token: string, init?: RequestInit,
): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${base}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
};

/** Recursively assert no server-only field appears anywhere in a payload. */
function expectNoServerOnlyFields(payload: any, label: string) {
  const json = JSON.stringify(payload);
  for (const key of ['expectedNetValue', 'seed', 'studentKey', 'learnerKey'])
    expect(json, `${label} leaked ${key}`).not.toContain(`"${key}"`);
}

/** Build the documents that satisfy this learner's instance. */
function correctDocs(instance: any) {
  const p = instance.resolvedParams;
  const itemConds = new Map<string, any[]>();
  for (const ic of p.itemConditions) {
    itemConds.set(ic.materialId, [{ conditionCode: ic.conditionCode, amount: ic.amount, active: true }]);
  }
  const items = (withConditions: boolean) => p.items.map((it: any, i: number) => ({
    lineNumber: (i + 1) * 10,
    materialId: it.materialId,
    quantity: it.quantity,
    orderProbability: null,
    itemConditions: withConditions ? (itemConds.get(it.materialId) ?? []) : [],
    itemNetValue: 0,
  }));
  const headerConds = (withConditions: boolean) =>
    withConditions ? p.headerConditions.map((h: any) => ({ conditionCode: h.conditionCode, amount: h.amount, active: true })) : [];
  const base = {
    customerId: p.customerId, custReference: instance.custPoNumber,
    custReferenceDate: '2026-11-20', validFrom: '2026-11-20',
    validTo: '2026-12-20', requestedDeliveryDate: '2026-11-20',
    status: 'complete', savedAt: '2026-11-20T00:00:00.000Z',
  };
  return [
    { ...base, docType: 'inquiry',   predecessorId: null,
      items: items(false).map((it: any) => ({ ...it, orderProbability: p.orderProbability })),
      headerConditions: headerConds(false) },
    { ...base, docType: 'quotation', predecessorId: 'INQ-000001',
      items: items(true), headerConditions: headerConds(true) },
    { ...base, docType: 'order',     predecessorId: 'QUO-000001',
      items: items(true), headerConditions: headerConds(true) },
  ];
}

beforeAll(async () => {
  const { app }                    = await import('../app');
  const { seedLocalStore, localModuleConfigDb } = await import('../db/localStore');
  const { issueSessionToken }      = await import('../services/identity/sessionToken');
  const { simStore }               = await import('../db/simDb');
  const { resolveVariant, PILOT_ASSIGNMENT } = await import('@cap/sim-engine');
  const simService                 = await import('../services/sim/simService');
  const orchestrator               = await import('../services/orchestrator/orchestratorService');
  const { sessionDb }              = await import('../db/sessionDb');

  seedLocalStore();
  // Idempotent — seedLocalStore already writes this row, but the test must
  // not depend on seed internals.
  await localModuleConfigDb.saveConfig({
    moduleId: SIM_MODULE, overallMin: 60, dimensionFloor: 40,
    activityKind: 'sim', simAssignmentId: PILOT_ASSIGNMENT.id,
  });

  api = { issueSessionToken, simStore, resolveVariant, PILOT_ASSIGNMENT,
          simService, orchestrator, sessionDb };
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(() => { server?.close(); });

const studentToken = () => api.issueSessionToken({
  sessionId: 'sess-test', tempUserId: 'tu-test', moduleId: SIM_MODULE,
  currentPhase: 2, canvasUuid: LEARNER,
});

const scope = { learnerKey: LEARNER, activityId: SIM_MODULE };
const definition = () => {
  const d = api.simService.simActivityRegistry(api.PILOT_ASSIGNMENT.id);
  if (!d) throw new Error('registry miss');
  return d;
};

/** Ensure the scope has a correct document set (idempotent — docs persist
 *  in the local store across tests in this file). */
async function ensureCorrectDocs(sc: typeof scope) {
  const instance = await api.simService.getOrCreateSimInstance(sc, definition());
  if ((await api.simStore.listDocuments(sc)).length) return;
  for (const doc of correctDocs(instance)) {
    const priced = api.simService.repriceDocument(doc);
    await api.simStore.createDocument(sc, { ...doc, items: priced.items, netValue: priced.netValue });
  }
}

describe('sim routes — scope and configuration guards', () => {
  it('403s an admin token (role claim) and a token with no learner key', async () => {
    const admin = await api.issueSessionToken({
      sessionId: 'a', tempUserId: 'tu-a', moduleId: SIM_MODULE, currentPhase: 1, role: 'admin' });
    const noKey = await api.issueSessionToken({
      sessionId: 'b', tempUserId: 'tu-b', moduleId: SIM_MODULE, currentPhase: 1 });
    for (const token of [admin, noKey]) {
      const r = await fetchJson('/sim/instance', token);
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('SIM_SCOPE_REQUIRED');
    }
  });

  it('404s when the module has no sim activity configured', async () => {
    // demo-sales-process is the live/stub module — no activityKind: 'sim'.
    const liveToken = await api.issueSessionToken({
      sessionId: 'c', tempUserId: 'tu-c', moduleId: 'demo-sales-process',
      currentPhase: 2, canvasUuid: LEARNER });
    const r = await fetchJson('/sim/instance', liveToken);
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('SIM_NOT_CONFIGURED');
  });
});

describe('sim routes — no server-only fields in any response', () => {
  it('GET /sim/instance returns the public instance, not the answer key', async () => {
    const r = await fetchJson('/sim/instance', await studentToken());
    expect(r.status).toBe(200);
    expect(r.body.custPoNumber).toMatch(/^PO-\d+$/);
    expect(r.body.resolvedParams).toBeTruthy();
    expectNoServerOnlyFields(r.body, 'instance');
  });

  it('document create/read/update/search/flow all stay public', async () => {
    const token = await studentToken();
    const instance = await api.simService.getOrCreateSimInstance(scope, definition());
    const [inquiry, quotation, order] = correctDocs(instance);

    const created = await fetchJson('/sim/documents', token,
      { method: 'POST', body: JSON.stringify(inquiry) });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe('INQ-000001');
    expectNoServerOnlyFields(created.body, 'created doc');

    const inq2 = await fetchJson('/sim/documents', token,
      { method: 'POST', body: JSON.stringify(quotation) });
    expect(inq2.status).toBe(201);
    expect(inq2.body.id).toBe('QUO-000001');

    const ord = await fetchJson('/sim/documents', token,
      { method: 'POST', body: JSON.stringify(order) });
    expect(ord.status).toBe(201);
    expectNoServerOnlyFields(ord.body, 'order doc');

    const list = await fetchJson('/sim/documents?docType=inquiry', token);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expectNoServerOnlyFields(list.body, 'doc list');

    const search = await fetchJson(
      `/sim/documents/search-by-reference?docType=inquiry&custReference=${encodeURIComponent(instance.custPoNumber)}`, token);
    expect(search.status).toBe(200);
    expect(search.body).toHaveLength(1);
    expectNoServerOnlyFields(search.body, 'search results');

    const flow = await fetchJson(`/sim/document-flow/${ord.body.id}`, token);
    expect(flow.status).toBe(200);
    expect(flow.body.map((d: any) => d.docType)).toEqual(['inquiry', 'quotation', 'order']);
    expectNoServerOnlyFields(flow.body, 'document flow');

    const patched = await fetchJson(`/sim/documents/${created.body.id}`, token,
      { method: 'PATCH', body: JSON.stringify({ custReferenceDate: '2026-11-21' }) });
    expect(patched.status).toBe(200);
    expect(patched.body.custReferenceDate).toBe('2026-11-21');
    expectNoServerOnlyFields(patched.body, 'patched doc');

    const ev = await fetchJson('/sim/events', token,
      { method: 'POST', body: JSON.stringify({ type: 'document_saved', docId: ord.body.id, payload: {} }) });
    expect(ev.status).toBe(201);
    expectNoServerOnlyFields(ev.body, 'event response');

    const missing = await fetchJson('/sim/documents/ORD-999999', token);
    expect(missing.status).toBe(404);
  });

  it('keeps one learner\'s documents invisible to every other learner', async () => {
    const other = await api.issueSessionToken({
      sessionId: 'sess-other', tempUserId: 'tu-other', moduleId: SIM_MODULE,
      currentPhase: 2, canvasUuid: 'test-learner-2' });
    const list = await fetchJson('/sim/documents', other);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const search = await fetchJson(
      '/sim/documents/search-by-reference?docType=inquiry&custReference=PO-10001', other);
    expect(search.body).toEqual([]);
  });
});

describe('sim verification — pass/fail decided by `passed`', () => {
  it('passes a correct document set', async () => {
    await ensureCorrectDocs(scope);
    const result = await api.simService.verifySimActivity(scope, definition());
    expect(result.passed).toBe(true);
    expect(result.allPresent).toBe(true);
    expect(result.missingTypes).toEqual([]);
    expect(result.items.every((i: any) => i.status === 'ok')).toBe(true);
  });

  it('fails a wrong net value with student-safe items only', async () => {
    // Break the order: drop the header discount so net value mismatches.
    const docs = await api.simStore.listDocuments(scope, { docType: 'order' });
    const order = docs[0];
    const broken = { ...order, headerConditions: [] };
    const { netValue } = api.simService.repriceDocument(broken);
    await api.simStore.updateDocument(scope, order.id,
      { headerConditions: [], netValue });

    const result = await api.simService.verifySimActivity(scope, definition());
    expect(result.passed).toBe(false);
    expect(result.allPresent).toBe(true); // docs exist — value is wrong
    const orderItem = result.items.find((i: any) => i.key === 'order');
    expect(orderItem.status).toBe('mismatch');

    // No expected value may appear in any item — the message says what to
    // recheck, never the number.
    const instance = await api.simStore.getInstance(scope);
    const expected = Object.values(instance.expectedNetValue).map(String);
    for (const item of result.items) {
      for (const v of expected)
        expect(item.studentMessage).not.toContain(v);
    }
    expectNoServerOnlyFields(result, 'verification result');
  });
});

describe('session integration — no pool account, params from the instance', () => {
  it('createSession takes no SAP account and binds sim parameters; /session responses stay public', async () => {
    const { sessionToken } = await api.orchestrator.createSession({
      canvasUuid: LEARNER, ltiContextId: 'ctx', ltiResourceLinkId: 'rl',
      agsEndpoint: 'test', lisResultSourcedId: 'test', moduleId: SIM_MODULE,
    });
    const claims = await (await import('../services/identity/sessionToken')).verifySessionToken(sessionToken);
    const session = await api.sessionDb.getSession(claims.sessionId);
    expect(session.sapUsername).toBeUndefined();
    expect(session.activityKind).toBe('sim');
    expect(session.parameters.poNumber).toMatch(/^PO-\d+$/);
    expect(session.parameters.customerName).toBeTruthy();

    const got = await fetchJson(`/session/${claims.sessionId}`, sessionToken);
    expect(got.status).toBe(200);
    expectNoServerOnlyFields(got.body, 'session body');
  });

  it('verify-sap fails with student-safe items, then passes once documents are correct', async () => {
    const learner = 'test-learner-http';
    const sc = { learnerKey: learner, activityId: SIM_MODULE };
    const { sessionToken } = await api.orchestrator.createSession({
      canvasUuid: learner, ltiContextId: 'ctx', ltiResourceLinkId: 'rl',
      agsEndpoint: 'test', lisResultSourcedId: 'test', moduleId: SIM_MODULE,
    });
    const claims = await (await import('../services/identity/sessionToken')).verifySessionToken(sessionToken);
    const id = claims.sessionId;

    const pollStatus = async () => {
      for (let i = 0; i < 30; i++) {
        const r = await fetchJson(`/session/${id}/verify-status`, sessionToken);
        if (r.body.status !== 'SAP_PENDING') return r;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('verify-status stuck in SAP_PENDING');
    };

    // No documents yet → fails with items, not with raw internals.
    await fetchJson(`/session/${id}/verify-sap`, sessionToken, { method: 'POST' });
    const failed = await pollStatus();
    expect(failed.body.status).toBe('LEARNING');
    expect(failed.body.sapVerificationError?.items?.length).toBeGreaterThan(0);
    expectNoServerOnlyFields(failed.body, 'failed verify-status');

    // Build the correct docs through the API, then re-verify → pass.
    const instance = await api.simService.getOrCreateSimInstance(sc, definition());
    for (const doc of correctDocs(instance)) {
      const r = await fetchJson('/sim/documents', sessionToken,
        { method: 'POST', body: JSON.stringify(doc) });
      expect(r.status).toBe(201);
      expectNoServerOnlyFields(r.body, 'doc via session token');
    }
    await fetchJson(`/session/${id}/verify-sap`, sessionToken, { method: 'POST' });
    const passed = await pollStatus();
    expect(passed.body.status).toBe('SAP_VERIFIED');
    expectNoServerOnlyFields(passed.body, 'passed verify-status');
  });
});
