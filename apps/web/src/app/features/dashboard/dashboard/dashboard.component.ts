import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CHANNEL_LABELS, type DeliveryDto, type DeliveryStatsDto } from '@cns/shared';
import { NotificationsService } from '../../../core/api/notifications.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { StatusChipComponent } from '../../../shared/ui/status-chip/status-chip.component';

@Component({
  selector: 'cns-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    PageHeaderComponent,
    EmptyStateComponent,
    StatusChipComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly notifications = inject(NotificationsService);
  protected readonly auth = inject(AuthStore);

  protected readonly channelLabels = CHANNEL_LABELS;
  protected readonly stats = signal<DeliveryStatsDto | null>(null);
  protected readonly recent = signal<DeliveryDto[]>([]);
  protected readonly loading = signal(true);

  /** Anything not yet in a terminal state, from the operator's point of view. */
  protected readonly inFlight = computed(() => {
    const totals = this.stats()?.totals;
    return totals ? totals.PENDING + totals.PROCESSING + totals.FAILED : 0;
  });

  protected readonly firstName = computed(() => this.auth.user()?.name.split(' ')[0] ?? 'there');

  constructor() {
    this.notifications.stats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.notifications.history({ limit: 6 }).subscribe((page) => this.recent.set(page.items));
  }
}
