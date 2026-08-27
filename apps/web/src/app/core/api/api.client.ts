import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { ApiResponse, PaginationMeta } from '@cns/shared';
import { environment } from '../../../environments/environment';

export interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Query values the API accepts; `undefined` and `''` are dropped. */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

const toHttpParams = (params: QueryParams = {}): HttpParams =>
  Object.entries(params).reduce((accumulator, [key, value]) => {
    if (value === undefined || value === null || value === '') return accumulator;
    return accumulator.set(key, String(value));
  }, new HttpParams());

/**
 * Thin wrapper over HttpClient that knows the API's response envelope, so no
 * feature service ever has to reach into `.data` or `.meta` by hand.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http
      .get<ApiResponse<T>>(`${this.base}${path}`, { params: toHttpParams(params) })
      .pipe(map((response) => response.data));
  }

  /** For endpoints that return a list plus pagination metadata. */
  getPage<T>(path: string, params?: QueryParams): Observable<Page<T>> {
    return this.http
      .get<ApiResponse<T[]>>(`${this.base}${path}`, { params: toHttpParams(params) })
      .pipe(
        map((response) => ({
          items: response.data,
          meta: response.meta ?? {
            page: 1,
            limit: response.data.length,
            total: response.data.length,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false,
          },
        })),
      );
  }

  /** Escape hatch for the few endpoints that add fields beside `data`. */
  getRaw<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`, { params: toHttpParams(params) });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(`${this.base}${path}`, body)
      .pipe(map((response) => response.data));
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .patch<ApiResponse<T>>(`${this.base}${path}`, body)
      .pipe(map((response) => response.data));
  }

  delete(path: string): Observable<void> {
    return this.http.delete<void>(`${this.base}${path}`);
  }
}
