import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiResponse, PaginationMeta } from '@cns/shared';

/**
 * Express 5 forwards rejected promises to the error middleware on its own, but
 * wrapping keeps the intent explicit and keeps handlers typed as `RequestHandler`.
 */
export const asyncHandler =
  <Req extends Request = Request>(
    handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    handler(req as Req, res, next).catch(next);
  };

export const ok = <T>(res: Response, data: T, meta?: PaginationMeta): Response => {
  const body: ApiResponse<T> = meta ? { data, meta } : { data };
  return res.status(200).json(body);
};

export const created = <T>(res: Response, data: T): Response =>
  res.status(201).json({ data } satisfies ApiResponse<T>);

export const noContent = (res: Response): Response => res.status(204).send();

export const buildPaginationMeta = (page: number, limit: number, total: number): PaginationMeta => {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
};
