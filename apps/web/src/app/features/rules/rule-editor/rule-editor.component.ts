import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type FormControl,
  type FormGroup,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CHANNEL_LABELS,
  NOTIFICATION_CHANNELS,
  type CreateRuleInput,
  type NotificationChannel,
  type RecipientType,
  type RuleDto,
  type RuleTestResultDto,
} from '@cns/shared';
import { RulesService } from '../../../core/api/rules.service';
import { CatalogService } from '../../../core/api/catalog.service';
import { ToastService } from '../../../core/ui/toast.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  ConditionBuilderComponent,
  type ConditionsFormGroup,
} from '../condition-builder/condition-builder.component';

type RecipientFormGroup = FormGroup<{
  type: FormControl<RecipientType>;
  value: FormControl<string>;
}>;

@Component({
  selector: 'cns-rule-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    PageHeaderComponent,
    ConditionBuilderComponent,
  ],
  templateUrl: './rule-editor.component.html',
  styleUrl: './rule-editor.component.scss',
})
export class RuleEditorComponent {
  private readonly fb = inject(FormBuilder);
  private readonly rulesService = inject(RulesService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);

  protected readonly channels = NOTIFICATION_CHANNELS;
  protected readonly channelLabels = CHANNEL_LABELS;

  protected readonly ruleId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly testResult = signal<RuleTestResultDto | null>(null);
  protected readonly isEdit = computed(() => this.ruleId() !== null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    description: ['', Validators.maxLength(500)],
    eventType: ['', Validators.required],
    enabled: [true],
    priority: [50, [Validators.required, Validators.min(0), Validators.max(100)]],
    conditions: this.fb.nonNullable.group({
      logic: this.fb.nonNullable.control<'AND' | 'OR'>('AND'),
      items: this.fb.array<never>([]),
    }) as unknown as ConditionsFormGroup,
    recipients: this.fb.array<RecipientFormGroup>([], Validators.required),
    channels: this.fb.nonNullable.control<NotificationChannel[]>([], Validators.required),
    template: this.fb.nonNullable.group({
      subject: ['', [Validators.required, Validators.maxLength(200)]],
      body: ['', [Validators.required, Validators.maxLength(5000)]],
    }),
    dedupeWindowSec: [0, [Validators.min(0), Validators.max(86400)]],
  });

  protected readonly payloadDraft = signal('');

  constructor() {
    const id = this.router.url.split('/').pop();
    if (id && id !== 'new') {
      this.ruleId.set(id);
      this.load(id);
    } else {
      this.addRecipient();
    }
  }

  protected get conditionsGroup(): ConditionsFormGroup {
    return this.form.controls.conditions;
  }

  protected get recipients(): FormArray<RecipientFormGroup> {
    return this.form.controls.recipients;
  }

  protected get availableFields() {
    return this.catalog.fieldsFor(this.form.controls.eventType.value);
  }

  /**
   * Switching the trigger invalidates every condition, because the fields are
   * specific to the event type. Clearing them is honest: silently keeping
   * conditions that reference fields the new trigger lacks would fail server
   * validation with a confusing message.
   */
  protected onEventTypeChanged(): void {
    this.conditionsGroup.controls.items.clear();
    this.testResult.set(null);
    this.syncSamplePayload();
  }

  protected addRecipient(type: RecipientType = 'EMAIL'): void {
    this.recipients.push(
      this.fb.nonNullable.group({
        type: this.fb.nonNullable.control<RecipientType>(type, Validators.required),
        value: ['', Validators.required],
      }) as RecipientFormGroup,
    );
  }

  protected removeRecipient(index: number): void {
    this.recipients.removeAt(index);
  }

  protected insertToken(path: string): void {
    const control = this.form.controls.template.controls.body;
    control.setValue(`${control.value}{{${path}}}`);
    control.markAsDirty();
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Fix the highlighted fields before saving.');
      return;
    }

    this.saving.set(true);
    const payload = this.form.getRawValue() as unknown as CreateRuleInput;
    const id = this.ruleId();

    const request$ = id
      ? this.rulesService.update(id, payload)
      : this.rulesService.create(payload);

    request$.subscribe({
      next: (rule) => {
        this.saving.set(false);
        this.toast.success(id ? `"${rule.name}" updated` : `"${rule.name}" created`);
        void this.router.navigate(['/rules']);
      },
      error: () => this.saving.set(false),
    });
  }

  /** Dry run against the sample payload; nothing is stored or delivered. */
  protected runTest(): void {
    const id = this.ruleId();
    if (!id) {
      this.toast.info('Save the rule once, then you can test it against a payload.');
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = this.payloadDraft().trim() ? JSON.parse(this.payloadDraft()) : {};
    } catch {
      this.toast.error('The sample payload is not valid JSON.');
      return;
    }

    this.testing.set(true);
    this.rulesService.test(id, payload).subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.testing.set(false);
      },
      error: () => this.testing.set(false),
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/rules']);
  }

  private load(id: string): void {
    this.rulesService.get(id).subscribe({
      next: (rule) => this.patch(rule),
      error: () => void this.router.navigate(['/rules']),
    });
  }

  private patch(rule: RuleDto): void {
    this.form.patchValue({
      name: rule.name,
      description: rule.description,
      eventType: rule.eventType,
      enabled: rule.enabled,
      priority: rule.priority,
      channels: rule.channels,
      template: rule.template,
      dedupeWindowSec: rule.dedupeWindowSec,
    });

    this.conditionsGroup.controls.logic.setValue(rule.conditions.logic);
    this.conditionsGroup.controls.items.clear();
    for (const condition of rule.conditions.items) {
      this.conditionsGroup.controls.items.push(
        this.fb.nonNullable.group({
          field: [condition.field, Validators.required],
          operator: [condition.operator, Validators.required],
          value: this.fb.nonNullable.control<unknown>(condition.value ?? ''),
        }) as never,
      );
    }

    this.recipients.clear();
    for (const recipient of rule.recipients) {
      this.recipients.push(
        this.fb.nonNullable.group({
          type: this.fb.nonNullable.control<RecipientType>(recipient.type, Validators.required),
          value: [recipient.value, Validators.required],
        }) as RecipientFormGroup,
      );
    }

    this.syncSamplePayload();
  }

  private syncSamplePayload(): void {
    const sample = this.catalog.eventType(this.form.controls.eventType.value)?.samplePayload;
    this.payloadDraft.set(sample ? JSON.stringify(sample, null, 2) : '');
  }
}
