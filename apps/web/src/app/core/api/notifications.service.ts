import { inject, Injectable, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';
import type {
  ApiResponse,
  DeliveryDto,
  DeliveryStatsDto,
  EventDto,
  IngestEventResultDto,
  PaginationMeta,
} from '@cns/shared';
import { ApiClient, type Page, type QueryParams } from './api.client';

interface InboxResponse extends ApiResponse<DeliveryDto[]> {
  meta: PaginationMeta;
  unreadCount: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiClient);

  /** Shared with the toolbar badge so the count is fetched once per poll. */
  readonly unreadCount = signal(0);

  history(query: QueryParams = {}): Observable<Page<DeliveryDto>> {
    return this.api.getPage<DeliveryDto>('/notifications', query);
  }

  get(id: string) {
    return this.api.get<DeliveryDto>(`/notifications/${id}`);
  }

  inbox(query: QueryParams = {}) {
    return this.api
      .getRaw<InboxResponse>('/notifications/inbox', query)
      .pipe(tap((response) => this.unreadCount.set(response.unreadCount)));
  }

  markRead(id: string) {
    return this.api
      .patch<DeliveryDto>(`/notifications/${id}/read`, {})
      .pipe(tap(() => this.unreadCount.update((count) => Math.max(0, count - 1))));
  }

  markAllRead() {
    return this.api
      .patch<{ updated: number }>('/notifications/inbox/read-all', {})
      .pipe(tap(() => this.unreadCount.set(0)));
  }

  retry(id: string) {
    return this.api.post<DeliveryDto>(`/notifications/${id}/retry`, {});
  }

  stats() {
    return this.api.get<DeliveryStatsDto>('/notifications/stats');
  }
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly api = inject(ApiClient);

  list(query: QueryParams = {}): Observable<Page<EventDto>> {
    return this.api.getPage<EventDto>('/events', query);
  }

  /** Fires an event through the real ingestion path, rules and all. */
  trigger(body: {
    eventId?: string;
    type: string;
    payload: Record<string, unknown>;
    source?: string;
  }) {
    return this.api.post<IngestEventResultDto>('/events', body);
  }
}
