export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  /** How often the inbox badge refreshes, in milliseconds. */
  inboxPollIntervalMs: 15_000,
} as const;
