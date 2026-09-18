import type { SessionTokenPayload } from '../services/identity/sessionToken';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Decoded session JWT payload, attached by authMiddleware. */
      session?: SessionTokenPayload;
    }
  }
}

export {};
