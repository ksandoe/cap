/**
 * authStore.ts — Admin App authentication state (Zustand, in-memory).
 *
 * Holds the admin user's JWT and decoded role after login.
 * Not persisted to localStorage — user re-authenticates on refresh,
 * or in production a secure httpOnly cookie holds the token and
 * this store holds only the decoded payload for UI use.
 *
 * Roles: 'author' | 'instructor' | 'researcher' | 'admin'
 */
import { create } from 'zustand';

export type AdminRole = 'author' | 'instructor' | 'researcher' | 'admin';

interface AuthState {
  token:     string | null;
  role:      AdminRole | null;
  email:     string | null;
  setAuth:   (token: string, role: AdminRole, email: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token:     null,
  role:      null,
  email:     null,
  setAuth:   (token, role, email) => set({ token, role, email }),
  clearAuth: () => set({ token: null, role: null, email: null }),
}));
