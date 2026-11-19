import { describe, expect, it } from 'vitest';
import type { NewSalesDocumentInput } from '@cap/sim-shared';
import { SimApiError, createCapSimApi } from './capApi';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** A fake backend: records every request and answers with the given status and body. */
function fakeBackend(reply: (call: Call) => { status: number; body: unknown } = () => ({ status: 200, body: [] })) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const { status, body } = reply(call);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const api = (backend: ReturnType<typeof fakeBackend>, token: string | null = 'tok-1') =>
  createCapSimApi({ baseUrl: '/api', getToken: () => token, fetchImpl: backend.fetchImpl });

describe('createCapSimApi', () => {
  it('calls each route with the right method and path, sending only the bearer token', async () => {
    const backend = fakeBackend();
    const sim = api(backend);
    await sim.getInstance();
    await sim.listDocuments();
    await sim.listDocuments('quotation');
    await sim.getDocument('INQ-000001');
    await sim.searchByReference('inquiry', 'PO 1&2');
    await sim.updateDocument('ORD-000001', { custReference: 'PO-1' });
    await sim.getDocumentFlow('ORD-000001');

    expect(backend.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/sim/instance',
      'GET /api/sim/documents',
      'GET /api/sim/documents?docType=quotation',
      'GET /api/sim/documents/INQ-000001',
      'GET /api/sim/documents/search-by-reference?docType=inquiry&custReference=PO%201%262',
      'PATCH /api/sim/documents/ORD-000001',
      'GET /api/sim/document-flow/ORD-000001',
    ]);
    for (const c of backend.calls) expect(c.headers.Authorization).toBe('Bearer tok-1');
  });

  it('never puts a learner key, activity or assignment in what it sends', async () => {
    const backend = fakeBackend(() => ({ status: 201, body: {} }));
    const sim = api(backend);
    const doc: NewSalesDocumentInput = {
      docType: 'inquiry', predecessorId: null, customerId: '134999', custReference: 'PO-1', custReferenceDate: '2026-11-20',
      validFrom: null, validTo: null, requestedDeliveryDate: null, items: [], headerConditions: [], status: 'in_progress', savedAt: null,
    };
    await sim.createDocument(doc);
    sim.logEvent('document_saved', { docType: 'inquiry' }, 'INQ-000001');
    await Promise.resolve();
    expect(backend.calls[0]).toMatchObject({ method: 'POST', url: '/api/sim/documents', body: doc });
    for (const c of backend.calls) {
      const sent = JSON.stringify([c.url, c.headers, c.body]);
      for (const forbidden of ['studentKey', 'learnerKey', 'assignmentId', 'activityId']) expect(sent).not.toContain(forbidden);
    }
  });

  it('asks for the token on every request, so a refreshed token is used', async () => {
    const backend = fakeBackend();
    let token = 'first';
    const sim = createCapSimApi({ baseUrl: '/api', getToken: () => token, fetchImpl: backend.fetchImpl });
    await sim.getInstance();
    token = 'second';
    await sim.getInstance();
    expect(backend.calls.map((c) => c.headers.Authorization)).toEqual(['Bearer first', 'Bearer second']);
  });

  it('turns an error response into a SimApiError carrying the status and code', async () => {
    const forbidden = api(fakeBackend(() => ({ status: 403, body: { error: 'SIM_SCOPE_REQUIRED' } })));
    await expect(forbidden.getInstance()).rejects.toMatchObject({ name: 'SimApiError', status: 403, code: 'SIM_SCOPE_REQUIRED' });
    const missing = api(fakeBackend(() => ({ status: 404, body: { error: 'NOT_FOUND' } })));
    const err = await missing.getDocument('X').catch((e) => e);
    expect(err).toBeInstanceOf(SimApiError);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('keeps the event log from ever interrupting the student', async () => {
    const failing = createCapSimApi({
      baseUrl: '/api',
      getToken: () => 'tok',
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(() => failing.logEvent('step_viewed')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // no unhandled rejection
  });
});
