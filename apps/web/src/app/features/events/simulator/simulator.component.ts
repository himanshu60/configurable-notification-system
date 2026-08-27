import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { EventDto, IngestEventResultDto } from '@cns/shared';
import { EventsService } from '../../../core/api/notifications.service';
import { CatalogService } from '../../../core/api/catalog.service';
import { ToastService } from '../../../core/ui/toast.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';

/**
 * Fires an event through the real ingestion endpoint - the same path a
 * production producer would use - so what a reviewer sees here is the actual
 * behaviour, not a simulation of it.
 */
@Component({
  selector: 'cns-simulator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
  templateUrl: './simulator.component.html',
  styleUrl: './simulator.component.scss',
})
export class SimulatorComponent {
  private readonly fb = inject(FormBuilder);
  private readonly events = inject(EventsService);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);

  protected readonly sending = signal(false);
  protected readonly loadingLog = signal(false);
  protected readonly lastResult = signal<IngestEventResultDto | null>(null);
  protected readonly log = signal<EventDto[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    type: ['', Validators.required],
    eventId: ['', [Validators.minLength(6)]],
    payload: ['', Validators.required],
  });

  constructor() {
    this.refreshLog();
  }

  protected onTypeChanged(): void {
    const sample = this.catalog.eventType(this.form.controls.type.value)?.samplePayload;
    this.form.controls.payload.setValue(sample ? JSON.stringify(sample, null, 2) : '{}');
    this.form.controls.eventId.setValue(this.newEventId());
    this.lastResult.set(null);
  }

  protected fire(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(this.form.controls.payload.value);
    } catch {
      this.toast.error('The payload is not valid JSON.');
      return;
    }

    const eventId = this.form.controls.eventId.value.trim();

    this.sending.set(true);
    this.events
      .trigger({
        type: this.form.controls.type.value,
        payload,
        source: 'simulator',
        ...(eventId ? { eventId } : {}),
      })
      .subscribe({
        next: (result) => {
          this.sending.set(false);
          this.lastResult.set(result);
          this.refreshLog();

          if (result.duplicate) {
            this.toast.info('Duplicate event id: nothing was re-processed.');
          } else {
            this.toast.success(
              `${result.matchedRules.length} rule(s) matched, ${result.deliveriesCreated} notification(s) queued.`,
            );
          }
        },
        error: () => this.sending.set(false),
      });
  }

  /** Re-fires the identical id so the idempotency guarantee is visible. */
  protected fireAgain(): void {
    this.fire();
  }

  protected regenerateId(): void {
    this.form.controls.eventId.setValue(this.newEventId());
  }

  protected refreshLog(): void {
    this.loadingLog.set(true);
    this.events.list({ limit: 8 }).subscribe({
      next: (page) => {
        this.log.set(page.items);
        this.loadingLog.set(false);
      },
      error: () => this.loadingLog.set(false),
    });
  }

  private newEventId(): string {
    return `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}
