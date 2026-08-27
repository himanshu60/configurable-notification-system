import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CreateRuleInput,
  RuleDto,
  RuleTestResultDto,
  UpdateRuleInput,
} from '@cns/shared';
import { ApiClient, type Page, type QueryParams } from './api.client';

export interface RuleListQuery extends QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  eventType?: string;
  channel?: string;
  enabled?: string;
  sortBy?: string;
  sortOrder?: string;
}

@Injectable({ providedIn: 'root' })
export class RulesService {
  private readonly api = inject(ApiClient);

  list(query: RuleListQuery = {}): Observable<Page<RuleDto>> {
    return this.api.getPage<RuleDto>('/rules', query);
  }

  get(id: string) {
    return this.api.get<RuleDto>(`/rules/${id}`);
  }

  create(input: CreateRuleInput) {
    return this.api.post<RuleDto>('/rules', input);
  }

  update(id: string, input: UpdateRuleInput) {
    return this.api.patch<RuleDto>(`/rules/${id}`, input);
  }

  setEnabled(id: string, enabled: boolean) {
    return this.api.patch<RuleDto>(`/rules/${id}/enabled`, { enabled });
  }

  remove(id: string) {
    return this.api.delete(`/rules/${id}`);
  }

  /** Dry run against a sample payload. Creates nothing. */
  test(id: string, payload: Record<string, unknown>) {
    return this.api.post<RuleTestResultDto>(`/rules/${id}/test`, { payload });
  }
}
