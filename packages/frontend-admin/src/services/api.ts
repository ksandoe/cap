/**
 * api.ts — Typed API client for the Admin App.
 * Shares the same backend as the Student App.
 * Attaches the admin JWT from the auth store.
 */
import { useAuthStore } from '../store/authStore';

// '/api' is proxied to the backend by Vite in dev; in deployed builds
// VITE_API_URL points at the API Gateway endpoint.
export const API_BASE = (import.meta as any).env?.VITE_API_URL ?? '/api';
const BASE = API_BASE;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useAuthStore.getState().token;
  const resp  = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export const adminApi = {
  recipe: {
    get:           (moduleId: string) => request<any>('GET',  `/recipe/${moduleId}`),
    listVersions:  (moduleId: string) => request<any>('GET',  `/recipe/${moduleId}/list`),
    save:          (recipe: any)      => request<any>('POST', '/recipe', recipe),
    previewCheckin:(moduleId: string) => request<any>('POST', `/recipe/${moduleId}/preview-checkin`),
  },
  sessions: {
    list:        (moduleId: string)   => request<any>('GET',  `/admin/sessions?moduleId=${moduleId}`),
    getTranscript:(id: string)        => request<any>('GET',  `/admin/sessions/${id}/transcript`),
    exportCsv:   (moduleId: string)   => request<any>('GET',  `/admin/sessions/export?moduleId=${moduleId}`),
    grantRetry:  (id: string, reason: string) => request<any>('POST', `/admin/sessions/${id}/grant-retry`, { reason }),
    reviewEval:  (id: string, ratings: any)   => request<any>('POST', `/admin/sessions/${id}/review`, { ratings }),
  },
  research: {
    query:       (params: any)        => request<any>('POST', '/admin/research/query', params),
    export:      (params: any)        => request<any>('POST', '/admin/research/export', params),
    consentConfig:(moduleId: string)  => request<any>('GET',  `/admin/research/consent?moduleId=${moduleId}`),
  },
  admin: {
    moduleConfig: {
      get:  (moduleId: string)        => request<any>('GET',  `/admin/module-config/${moduleId}`),
      save: (config: any)             => request<any>('POST', '/admin/module-config', config),
    },
    sapPool: {
      status:  ()                     => request<any>('GET',  '/admin/sap-pool/status'),
      import:  (accounts: any[])      => request<any>('POST', '/admin/sap-pool/import', { accounts }),
      release: (username: string)     => request<any>('POST', `/admin/sap-pool/${username}/release`),
    },
    auditLog: {
      query: (params: any)            => request<any>('POST', '/admin/audit-log/query', params),
    },
    health:    ()                     => request<any>('GET',  '/admin/health'),
    irbConfig: {
      get:  (moduleId: string)        => request<any>('GET',  `/admin/irb-config/${moduleId}`),
      save: (config: any)             => request<any>('POST', '/admin/irb-config', config),
    },
  },
};
