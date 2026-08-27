import type { ApiErrorCode, FieldIssue } from '@cns/shared';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * The only error type controllers and services are expected to throw. The error
 * middleware maps anything else to a 500 without leaking internals.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: FieldIssue[];
  /** Marks errors that are safe to describe to the caller verbatim. */
  readonly expected = true;

  constructor(code: ApiErrorCode, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (details?.length) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, details?: FieldIssue[]): AppError {
    return new AppError('VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication is required'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have access to this resource'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError('NOT_FOUND', `${resource} was not found`);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message);
  }

  static internal(message = 'Something went wrong'): AppError {
    return new AppError('INTERNAL_ERROR', message);
  }
}

export const isAppError = (error: unknown): error is AppError =>
  error instanceof AppError || (error as AppError | null)?.name === 'AppError';
