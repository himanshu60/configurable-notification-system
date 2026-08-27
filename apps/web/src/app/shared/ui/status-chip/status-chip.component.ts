import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from '@cns/shared';

const PRESENTATION: Record<DeliveryStatus, { tone: string; icon: string }> = {
  PENDING: { tone: 'neutral', icon: 'schedule' },
  PROCESSING: { tone: 'info', icon: 'sync' },
  SENT: { tone: 'success', icon: 'check_circle' },
  FAILED: { tone: 'warn', icon: 'replay' },
  DEAD_LETTER: { tone: 'danger', icon: 'error' },
  SUPPRESSED: { tone: 'neutral', icon: 'filter_alt_off' },
};

/**
 * Colour is never the only signal - each state carries a distinct icon and
 * label so the table stays readable for colour-blind users and in print.
 */
@Component({
  selector: 'cns-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './status-chip.component.html',
  styleUrl: './status-chip.component.scss',
})
export class StatusChipComponent {
  readonly status = input.required<DeliveryStatus>();

  readonly presentation = computed(() => PRESENTATION[this.status()]);
  readonly label = computed(() => DELIVERY_STATUS_LABELS[this.status()]);
}
