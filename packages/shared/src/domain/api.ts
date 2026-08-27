/**
 * Every API response uses one of these two envelopes, so the client has exactly
 * one success shape and one failure shape to handle.
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export type PaginatedResponse<T> = ApiResponse<T[]> & { meta: PaginationMeta };

/** Machine-readable failure codes. The client switches on these, not on text. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface FieldIssue {
  /** Dot path of the offending field, e.g. `conditions.items.0.value`. */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: FieldIssue[];
    requestId?: string;
  };
}

export const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.code === 'string';
