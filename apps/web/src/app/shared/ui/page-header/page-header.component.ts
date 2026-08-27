import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Title, supporting copy and an action slot. Every page starts with one. */
@Component({
  selector: 'cns-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
