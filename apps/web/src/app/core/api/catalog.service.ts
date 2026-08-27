import { inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import type {
  ConditionOperator,
  EventTypeDefinition,
  FieldType,
  NotificationChannel,
  RecipientType,
} from '@cns/shared';
import { ApiClient } from './api.client';

export interface CatalogResponse {
  events: EventTypeDefinition[];
  operators: Array<{ value: ConditionOperator; label: string }>;
  operatorsByFieldType: Record<FieldType, ConditionOperator[]>;
  channels: NotificationChannel[];
  recipientTypes: RecipientType[];
  templateFormatters: string[];
}

/**
 * Caches the event catalog for the session.
 *
 * The whole rule editor - which fields exist, which operators they accept,
 * which control to render - is derived from this response, so adding a trigger
 * on the server changes the UI with no client change.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly api = inject(ApiClient);
  readonly catalog = signal<CatalogResponse | null>(null);

  load() {
    return this.api
      .get<CatalogResponse>('/catalog/events')
      .pipe(tap((catalog) => this.catalog.set(catalog)));
  }

  eventType(type: string): EventTypeDefinition | undefined {
    return this.catalog()?.events.find((definition) => definition.type === type);
  }

  fieldsFor(type: string) {
    return this.eventType(type)?.fields ?? [];
  }

  field(type: string, path: string) {
    return this.fieldsFor(type).find((candidate) => candidate.path === path);
  }

  /** Operators valid for the field at `path`, or all of them if it is unknown. */
  operatorsFor(type: string, path: string): Array<{ value: ConditionOperator; label: string }> {
    const catalog = this.catalog();
    if (!catalog) return [];

    const field = this.field(type, path);
    if (!field) return catalog.operators;

    const allowed = catalog.operatorsByFieldType[field.type] ?? [];
    return catalog.operators.filter((operator) => allowed.includes(operator.value));
  }
}
