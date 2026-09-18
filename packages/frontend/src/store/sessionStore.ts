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
import { Evaluation, CheckinResponse, Recipe } from '@cap/shared';

export interface ChatTurn { role: string; content: string; hidden?: boolean }

interface SessionState {
  token:           string | null;
  sessionId:       string | null;
  moduleId:        string | null;
  currentPhase:    number;
  attemptNumber:   number;
  recipe:          Recipe | null;
  checkinResponses: CheckinResponse[];
  transcript:      ChatTurn[];
  evaluation:      Evaluation | null;

  setSession:      (data: { token: string; sessionId: string; moduleId: string; currentPhase: number }) => void;
  setPhase:        (phase: number) => void;
  setRecipe:       (recipe: Recipe) => void;
  setAttemptNumber:(n: number) => void;
  setCheckinResponses: (responses: CheckinResponse[]) => void;
  appendTurn:      (role: string, content: string, hidden?: boolean) => void;
  setEvaluation:   (evaluation: Evaluation) => void;
  reset:           () => void;
}

const initial = {
  token:            null,
  sessionId:        null,
  moduleId:         null,
  currentPhase:     1,
  attemptNumber:    1,
  recipe:           null,
  checkinResponses: [] as CheckinResponse[],
  transcript:       [] as ChatTurn[],
  evaluation:       null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,

  setSession:      ({ token, sessionId, moduleId, currentPhase }) =>
                     set({ token, sessionId, moduleId, currentPhase }),
  setPhase:        (currentPhase) => set({ currentPhase }),
  setRecipe:       (recipe) => set({ recipe }),
  setAttemptNumber:(attemptNumber) => set({ attemptNumber }),
  setCheckinResponses: (checkinResponses) => set({ checkinResponses }),
  appendTurn:      (role, content, hidden) =>
    set(s => ({ transcript: [...s.transcript, { role, content, hidden }] })),
  setEvaluation:   (evaluation) => set({ evaluation }),
  reset:           () => set(initial),
}));
