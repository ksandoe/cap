/**
 * api.ts — Typed API client for the backend.
 * Automatically attaches the session token from the Zustand store.
 */
import { useSessionStore } from '../store/sessionStore';

const BASE = '/api'; // proxied to backend in dev; real URL in prod

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
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
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
