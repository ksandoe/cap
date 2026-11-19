import { createContext, useContext, type ReactNode } from 'react';
import type { SimApi } from '@cap/sim-shared';

const SimApiContext = createContext<SimApi | null>(null);

/**
 * Supplies the simulator's data access to everything below it. The standalone app provides the network or
 * browser-storage version, and CAP provides the one that calls its own backend (`createCapSimApi`).
 */
export function SimApiProvider({ api, children }: { api: SimApi; children: ReactNode }) {
  return <SimApiContext.Provider value={api}>{children}</SimApiContext.Provider>;
}

export function useSimApi(): SimApi {
  const api = useContext(SimApiContext);
  if (!api) throw new Error('useSimApi must be used inside a SimApiProvider');
  return api;
}
