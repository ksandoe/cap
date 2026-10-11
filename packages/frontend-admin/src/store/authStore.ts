/**
 * authStore.ts — Admin App authentication state (Zustand, in-memory).
 *
 * Holds the admin user's JWT and decoded role after login.
 * Not persisted to localStorage — user re-authenticates on refresh,
 * or in production a secure httpOnly cookie holds the token and
 * this store holds only the decoded payload for UI use.
 *
 * v3 interim: one shared team passkey → role 'admin' → all sections.
 * `displayName` is the optional name the person typed at login, used
 * for attribution on drafts and validation notes. Long-term: OTP
 * sign-on restores per-user accounts with real roles.
 *
 * Roles: 'author' | 'instructor' | 'researcher' | 'admin'
 */
import { create } from 'zustand';

export type AdminRole = 'author' | 'instructor' | 'researcher' | 'admin';

interface AuthState {
  token:       string | null;
  role:        AdminRole | null;
  displayName: string | null;
  setAuth:   (token: string, role: AdminRole, displayName: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token:       null,
  role:        null,
  displayName: null,
  setAuth:   (token, role, displayName) => set({ token, role, displayName }),
  clearAuth: () => set({ token: null, role: null, displayName: null }),
}));
