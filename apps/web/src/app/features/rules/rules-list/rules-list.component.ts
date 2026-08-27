import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CHANNEL_LABELS, type RuleDto } from '@cns/shared';
import { RulesService } from '../../../core/api/rules.service';
import { CatalogService } from '../../../core/api/catalog.service';
import { ToastService } from '../../../core/ui/toast.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

@Component({
  selector: 'cns-rules-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  templateUrl: './rules-list.component.html',
  styleUrl: './rules-list.component.scss',
})
export class RulesListComponent {
  private readonly rulesService = inject(RulesService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);

  protected readonly channelLabels = CHANNEL_LABELS;

  protected readonly rules = signal<RuleDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly eventTypeFilter = signal<string>('');
  protected readonly enabledFilter = signal<string>('');

  /** Debounced so typing does not fire a request per keystroke. */
  private readonly search = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      startWith(''),
      takeUntilDestroyed(),
    ),
    { initialValue: '' },
  );

  protected readonly hasFilters = computed(
    () => Boolean(this.search()) || Boolean(this.eventTypeFilter()) || Boolean(this.enabledFilter()),
  );

  constructor() {
    // Re-fetch whenever any query input changes. Reading the signals inside the
    // effect is what registers them as dependencies.
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);

    this.rulesService
      .list({
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
        search: this.search() || undefined,
        eventType: this.eventTypeFilter() || undefined,
        enabled: this.enabledFilter() || undefined,
      })
      .subscribe({
        next: (page) => {
          this.rules.set(page.items);
          this.total.set(page.meta.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected onSearchChanged(): void {
    this.pageIndex.set(0);
    this.reload();
  }

  protected onFilterChanged(): void {
    this.pageIndex.set(0);
    this.reload();
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.reload();
  }

  protected clearFilters(): void {
    this.searchControl.setValue('');
    this.eventTypeFilter.set('');
    this.enabledFilter.set('');
    this.pageIndex.set(0);
    this.reload();
  }

  /**
   * Optimistic toggle: flip locally first so the switch feels instant, then
   * roll back if the server disagrees.
   */
  protected toggleEnabled(rule: RuleDto, enabled: boolean): void {
    this.patchLocally(rule.id, enabled);

    this.rulesService.setEnabled(rule.id, enabled).subscribe({
      next: () => this.toast.success(`"${rule.name}" ${enabled ? 'enabled' : 'disabled'}`),
      error: () => this.patchLocally(rule.id, !enabled),
    });
  }

  protected remove(rule: RuleDto): void {
    this.confirm
      .ask({
        title: 'Delete this rule?',
        message: `"${rule.name}" will stop matching new events. Notifications it already produced stay in the history.`,
        confirmLabel: 'Delete rule',
        destructive: true,
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.rulesService.remove(rule.id).subscribe(() => {
          this.toast.success(`"${rule.name}" deleted`);
          this.reload();
        });
      });
  }

  protected conditionSummary(rule: RuleDto): string {
    const items = rule.conditions.items;
    if (items.length === 0) return 'Every event of this type';

    const joiner = rule.conditions.logic === 'OR' ? ' or ' : ' and ';
    return items
      .map((item) => {
        const label = this.catalog.field(rule.eventType, item.field)?.label ?? item.field;
        const value = Array.isArray(item.value) ? item.value.join(', ') : item.value;
        return value === undefined ? `${label} ${item.operator}` : `${label} ${item.operator} ${value}`;
      })
      .join(joiner);
  }

  protected eventLabel(type: string): string {
    return this.catalog.eventType(type)?.label ?? type;
  }

  private patchLocally(id: string, enabled: boolean): void {
    this.rules.update((rules) =>
      rules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)),
    );
  }
}
