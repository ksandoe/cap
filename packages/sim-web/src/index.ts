// What CAP's student app imports. The standalone app starts from main.tsx instead.
export { default as SimWorkspace } from './SimWorkspace';
export type { SimWorkspaceProps } from './SimWorkspace';
export { createCapSimApi, SimApiError } from './capApi';
export type { CapSimApiOptions } from './capApi';
