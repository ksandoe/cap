/**
 * sessionStore.ts — Zustand in-memory session store.
 *
 * FERPA note: session token and all student-session data are held
 * in memory only (Zustand). Nothing is written to localStorage,
 * sessionStorage, or any browser-persistent storage.
 *
 * If the student refreshes the page, the session token is lost and
 * they must relaunch from Canvas. (Future: encode resume token in URL hash.)
 */
import { create } from 'zustand';
import { Evaluation, CheckinResponse } from '@cap/shared';

interface SessionState {
  token:           string | null;
  sessionId:       string | null;
  currentPhase:    number;
  checkinResponses: CheckinResponse[];
  transcript:      { role: string; content: string }[];
  evaluation:      Evaluation | null;

  setSession:      (data: { token: string; currentPhase: number }) => void;
  setPhase:        (phase: number) => void;
  setCheckinResponses: (responses: CheckinResponse[]) => void;
  appendTurn:      (role: string, content: string) => void;
  setEvaluation:   (evaluation: Evaluation) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  token:            null,
  sessionId:        null,
  currentPhase:     1,
  checkinResponses: [],
  transcript:       [],
  evaluation:       null,

  setSession:      ({ token, currentPhase }) => set({ token, currentPhase }),
  setPhase:        (phase) => set({ currentPhase: phase }),
  setCheckinResponses: (checkinResponses) => set({ checkinResponses }),
  appendTurn:      (role, content) =>
    set(s => ({ transcript: [...s.transcript, { role, content }] })),
  setEvaluation:   (evaluation) => set({ evaluation }),
}));
