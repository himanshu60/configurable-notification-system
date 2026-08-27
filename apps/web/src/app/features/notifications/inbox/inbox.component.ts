import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { DeliveryDto } from '@cns/shared';
import { NotificationsService } from '../../../core/api/notifications.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/** In-app channel viewed from the recipient's side. */
@Component({
  selector: 'cns-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.scss',
})
export class InboxComponent {
  protected readonly notifications = inject(NotificationsService);

  protected readonly items = signal<DeliveryDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly unreadOnly = signal(false);
  protected readonly expanded = signal<string | null>(null);

  protected readonly unread = computed(() => this.notifications.unreadCount());

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);

    this.notifications
      .inbox({ limit: 50, unreadOnly: this.unreadOnly() ? 'true' : undefined })
      .subscribe({
        next: (response) => {
          this.items.set(response.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected toggleFilter(): void {
    this.unreadOnly.update((value) => !value);
    this.reload();
  }

  /** Opening a notification marks it read, which is what a user expects. */
  protected toggle(item: DeliveryDto): void {
    const opening = this.expanded() !== item.id;
    this.expanded.set(opening ? item.id : null);

    if (opening && !item.readAt) {
      this.notifications.markRead(item.id).subscribe(() => {
        this.items.update((items) =>
          items.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, readAt: new Date().toISOString() }
              : candidate,
          ),
        );
      });
    }
  }

  protected markAllRead(): void {
    this.notifications.markAllRead().subscribe(() => this.reload());
  }
}
