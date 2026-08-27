import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CHANNEL_LABELS,
  DELIVERY_STATUSES,
  NOTIFICATION_CHANNELS,
  type DeliveryDto,
  type NotificationChannel,
} from '@cns/shared';
import { NotificationsService } from '../../../core/api/notifications.service';
import { ToastService } from '../../../core/ui/toast.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip/status-chip.component';

@Component({
  selector: 'cns-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSidenavModule,
    MatTableModule,
    MatTooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    StatusChipComponent,
  ],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
})
export class HistoryComponent {
  private readonly notifications = inject(NotificationsService);
  private readonly toast = inject(ToastService);

  protected readonly channels = NOTIFICATION_CHANNELS;
  protected readonly statuses = DELIVERY_STATUSES;
  protected readonly channelLabels = CHANNEL_LABELS;
  protected readonly columns = ['notification', 'recipient', 'channel', 'status', 'timestamp'];

  protected readonly rows = signal<DeliveryDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly selected = signal<DeliveryDto | null>(null);

  protected readonly channelFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly searchControl = new FormControl('', { nonNullable: true });

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
    () => Boolean(this.search()) || Boolean(this.channelFilter()) || Boolean(this.statusFilter()),
  );

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);

    this.notifications
      .history({
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
        search: this.search() || undefined,
        channel: this.channelFilter() || undefined,
        status: this.statusFilter() || undefined,
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.items);
          this.total.set(page.meta.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
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
    this.channelFilter.set('');
    this.statusFilter.set('');
    this.onFilterChanged();
  }

  /** Material table cells are untyped, so narrow here rather than in the template. */
  protected channelLabel(channel: NotificationChannel): string {
    return CHANNEL_LABELS[channel];
  }

  protected open(row: DeliveryDto): void {
    this.selected.set(row);
  }

  protected close(): void {
    this.selected.set(null);
  }

  /** Only offered for terminal failures; the API rejects anything else. */
  protected retry(row: DeliveryDto): void {
    this.notifications.retry(row.id).subscribe((updated) => {
      this.toast.success('Notification requeued');
      this.selected.set(updated);
      this.reload();
    });
  }
}
