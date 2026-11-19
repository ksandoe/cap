import { createContext, useContext } from 'react';

/**
 * True inside `SimWorkspace`, where CAP supplies the instructions beside the simulator. The activities
 * then draw only the simulated SAP screen: no instruction pane and no layout toggle.
 */
export const EmbeddedContext = createContext(false);

export const useEmbedded = () => useContext(EmbeddedContext);
