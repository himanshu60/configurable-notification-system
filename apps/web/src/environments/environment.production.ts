/**
 * Production build.
 *
 * The API is addressed on the same origin as the app: the static host rewrites
 * `/api/*` to the API service (see `render.yaml`). Keeping it relative means the
 * bundle carries no environment-specific URL, so the same artifact can be
 * promoted between environments, and the browser never makes a cross-origin
 * request — no CORS preflight, no third-party cookie rules.
 */
export const environment = {
  production: true,
  apiUrl: '/api/v1',
  inboxPollIntervalMs: 30_000,
} as const;
