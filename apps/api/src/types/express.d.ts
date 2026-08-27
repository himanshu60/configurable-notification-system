import type { UserRole } from '@cns/shared';

declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: UserRole;
    }

    interface Request {
      /** Correlation id echoed in responses and attached to every log line. */
      id: string;
      /** Populated by `requireAuth`; absent on public routes. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
