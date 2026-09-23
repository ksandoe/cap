/**
 * api.ts — Typed API client for the backend.
 * Automatically attaches the session token from the Zustand store.
 */
import { useSessionStore } from '../store/sessionStore';

// Dev: '/api' is proxied to localhost:3001 by Vite.
// Deployed: the Lambda serves the SPA and the API from the same origin,
// so same-origin ('') is correct. VITE_API_URL overrides either way.
export const API_BASE = (import.meta as any).env?.VITE_API_URL
  ?? (typeof window !== 'undefined' && /^(localhost|127\.)/.test(window.location.hostname) ? '/api' : '');
const BASE = API_BASE;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = useSessionStore.getState().token;
  const resp  = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!resp.ok) {
    const text = await resp.text();
    // Ephemeral demo store: a session record can vanish (redeploy / instance
    // recycle) while the JWT is still valid. Bounce to the launchpad with a
    // notice rather than dead-ending on an error inside a phase.
    if (text.includes('SESSION_NOT_FOUND')) {
      window.location.assign('/?notice=session-expired');
      return new Promise<T>(() => {}); // navigation in progress
    }
    throw new Error(`API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

/** Decode a session JWT's payload (no signature check — the backend verifies it). */
export function decodeSessionToken(token: string): {
  sessionId: string; moduleId: string; currentPhase: number; tempUserId: string;
} {
  return JSON.parse(atob(token.split('.')[1]));
}

export interface CheckinQuestion {
  questionKey:  string;
  questionText: string;
  responseType: 'likert' | 'multiple_choice' | 'short_text';
  options?:     string[];
}

export const api = {
  session: {
    get:              (id: string)           => request<any>('GET', `/session/${id}`),
    submitCheckin:    (id: string, responses: any) => request<any>('POST', `/session/${id}/checkin`, { responses }),
    verifySap:        (id: string)           => request<any>('POST', `/session/${id}/verify-sap`),
    verifyStatus:     (id: string)           => request<any>('GET',  `/session/${id}/verify-status`),
    complete:         (id: string, evaluation: any) => request<any>('POST', `/session/${id}/complete`, { evaluation }),
    retry:            (id: string)           => request<any>('POST', `/session/${id}/retry`),
  },
  assessment: {
    checkinQuestions: ()                     => request<{ questions: CheckinQuestion[] }>('POST', '/assessment/checkin-questions', {}),
    turn:             (messages: any[])      => request<{ response: string }>('POST', '/assessment/turn', { messages }),
    evaluate:         (transcript: any[])    => request<{ evaluation: any }>('POST', '/assessment/evaluate', { transcript }),
  },
  recipe: {
    get:  (moduleId: string)   => request<any>('GET',  `/recipe/${moduleId}`),
    save: (recipe: any)        => request<any>('POST', '/recipe', recipe),
  },
};
