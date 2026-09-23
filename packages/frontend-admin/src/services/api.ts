/**
 * api.ts — Typed API client for the Admin App.
 * Shares the same backend as the Student App.
 * Attaches the admin JWT from the auth store.
 */
import { useAuthStore } from '../store/authStore';

// Dev: '/api' is proxied to localhost:3001 by Vite.
// Deployed: the Lambda serves the SPA and the API from the same origin,
// so same-origin ('') is correct. VITE_API_URL overrides either way.
export const API_BASE = (import.meta as any).env?.VITE_API_URL
  ?? (typeof window !== 'undefined' && /^(localhost|127\.)/.test(window.location.hostname) ? '/api' : '');
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
    list:          ()                 => request<{ recipes: any[] }>('GET', '/recipe'),
    get:           (moduleId: string) => request<any>('GET',  `/recipe/${moduleId}`),
    listVersions:  (moduleId: string) => request<any>('GET',  `/recipe/${moduleId}/list`),
    save:          (recipe: any)      => request<any>('POST', '/recipe', recipe),
    previewCheckin:(moduleId: string, recipe?: any) => request<{ questions: any[] }>('POST', `/recipe/${moduleId}/preview-checkin`, recipe ? { recipe } : {}),
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
