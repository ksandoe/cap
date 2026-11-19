import { SIM_ROUTES } from '@cap/sim-shared';
import type {
  DocType,
  EventType,
  NewSalesDocumentInput,
  PublicAssignmentInstance,
  PublicSalesDocument,
  SalesDocumentPatch,
  SimApi,
} from '@cap/sim-shared';

export interface CapSimApiOptions {
  /** Where CAP's backend is served, for example `/api` behind the student app's dev proxy. No trailing slash. */
  baseUrl: string;
  /** The CAP session token. Called for every request, so a refreshed token is picked up. */
  getToken: () => string | null | Promise<string | null>;
  /** For tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** A failed simulator request. `code` is the `error` field CAP returned, for example `NOT_FOUND`. */
export class SimApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`Simulator request failed: ${status} ${code}`);
    this.name = 'SimApiError';
  }
}

type Route = { readonly method: string; readonly path: string };

/**
 * The simulator's API as served by CAP's backend (`SIM_ROUTES`). The browser sends only its CAP session
 * token. The learner, the activity and the assignment are worked out on the server from that token, so
 * nothing here can name them.
 */
export function createCapSimApi(options: CapSimApiOptions): SimApi {
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function call<T>(
    route: Route,
    opts: { id?: string; query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    let path = route.path;
    if (opts.id !== undefined) path = path.replace(':id', encodeURIComponent(opts.id));
    const query = Object.entries(opts.query ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const token = await options.getToken();
    const res = await doFetch(`${options.baseUrl}${path}${query ? `?${query}` : ''}`, {
      method: route.method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new SimApiError(res.status, body?.error ?? 'REQUEST_FAILED');
    }
    return (await res.json().catch(() => null)) as T;
  }

  return {
    getInstance: () => call<PublicAssignmentInstance>(SIM_ROUTES.instance),

    listDocuments: (docType?: DocType) =>
      call<PublicSalesDocument[]>(SIM_ROUTES.documents, { query: { docType } }),

    getDocument: (id: string) => call<PublicSalesDocument>(SIM_ROUTES.document, { id }),

    searchByReference: (docType: DocType, custReference: string) =>
      call<PublicSalesDocument[]>(SIM_ROUTES.searchByReference, { query: { docType, custReference } }),

    createDocument: (doc: NewSalesDocumentInput) =>
      call<PublicSalesDocument>(SIM_ROUTES.createDocument, { body: doc }),

    updateDocument: (id: string, patch: SalesDocumentPatch) =>
      call<PublicSalesDocument>(SIM_ROUTES.updateDocument, { id, body: patch }),

    getDocumentFlow: (id: string) => call<PublicSalesDocument[]>(SIM_ROUTES.documentFlow, { id }),

    logEvent: (type: EventType, payload?: Record<string, unknown>, docId?: string | null) => {
      // Fire and forget: the event log must never interrupt the student.
      call(SIM_ROUTES.logEvent, { body: { type, payload: payload ?? {}, docId: docId ?? null } }).catch(() => {
        /* non-critical */
      });
    },
  };
}
