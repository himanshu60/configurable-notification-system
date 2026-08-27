import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type FormControl,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  LIST_OPERATORS,
  RANGE_OPERATORS,
  UNARY_OPERATORS,
  type ConditionOperator,
  type EventFieldDefinition,
} from '@cns/shared';
import { CatalogService } from '../../../core/api/catalog.service';

/** Shape of one row in the builder's FormArray. */
export type ConditionFormGroup = FormGroup<{
  field: FormControl<string>;
  operator: FormControl<ConditionOperator>;
  value: FormControl<unknown>;
}>;

export type ConditionsFormGroup = FormGroup<{
  logic: FormControl<'AND' | 'OR'>;
  items: FormArray<ConditionFormGroup>;
}>;

/** How the value control for a given operator and field should be rendered. */
type ValueControlKind = 'none' | 'text' | 'number' | 'boolean' | 'date' | 'select' | 'multi' | 'range';

/**
 * The rule editor's centrepiece.
 *
 * Every choice offered here is derived from the event catalog the API serves:
 * the field list comes from the selected trigger, the operator list from that
 * field's type, and the value control from the operator. Adding a field or a
 * whole event type on the server changes this UI with no code change here.
 */
@Component({
  selector: 'cns-condition-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './condition-builder.component.html',
  styleUrl: './condition-builder.component.scss',
})
export class ConditionBuilderComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly catalog = inject(CatalogService);

  readonly group = input.required<ConditionsFormGroup>();
  readonly eventType = input.required<string>();

  protected get items(): FormArray<ConditionFormGroup> {
    return this.group().controls.items;
  }

  protected fields(): readonly EventFieldDefinition[] {
    return this.catalog.fieldsFor(this.eventType());
  }

  protected operators(row: ConditionFormGroup) {
    return this.catalog.operatorsFor(this.eventType(), row.controls.field.value);
  }

  protected fieldFor(row: ConditionFormGroup): EventFieldDefinition | undefined {
    return this.catalog.field(this.eventType(), row.controls.field.value);
  }

  /**
   * Decides which input to show. Operator arity wins over field type, because
   * `in` on a number field still needs a list, not a single number.
   */
  protected valueKind(row: ConditionFormGroup): ValueControlKind {
    const operator = row.controls.operator.value;
    if (UNARY_OPERATORS.includes(operator)) return 'none';
    if (RANGE_OPERATORS.includes(operator)) return 'range';

    const field = this.fieldFor(row);
    const isList = LIST_OPERATORS.includes(operator);

    if (field?.type === 'enum') return isList ? 'multi' : 'select';
    if (isList) return 'text';

    switch (field?.type) {
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
        return 'date';
      default:
        return 'text';
    }
  }

  protected options(row: ConditionFormGroup): readonly string[] {
    return this.fieldFor(row)?.options ?? [];
  }

  protected addCondition(): void {
    const firstField = this.fields()[0];
    const operators = firstField
      ? this.catalog.operatorsFor(this.eventType(), firstField.path)
      : [];

    this.items.push(this.createRow(firstField?.path ?? '', operators[0]?.value ?? 'eq'));
    this.group().markAsDirty();
  }

  protected removeCondition(index: number): void {
    this.items.removeAt(index);
    this.group().markAsDirty();
  }

  /**
   * Changing the field can invalidate the operator and the value, so both are
   * reset to something coherent rather than left in an impossible combination.
   */
  protected onFieldChanged(row: ConditionFormGroup): void {
    const allowed = this.operators(row);
    const current = row.controls.operator.value;

    if (!allowed.some((operator) => operator.value === current)) {
      row.controls.operator.setValue(allowed[0]?.value ?? 'eq');
    }

    this.resetValue(row);
  }

  protected onOperatorChanged(row: ConditionFormGroup): void {
    this.resetValue(row);
  }

  /** Comma separated entry for list operators on non-enum fields. */
  protected listAsText(row: ConditionFormGroup): string {
    const value = row.controls.value.value;
    return Array.isArray(value) ? value.join(', ') : '';
  }

  protected onListText(row: ConditionFormGroup, raw: string): void {
    const field = this.fieldFor(row);
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (field?.type === 'number' ? Number(part) : part));

    row.controls.value.setValue(parts);
  }

  protected rangeAt(row: ConditionFormGroup, index: 0 | 1): number | null {
    const value = row.controls.value.value;
    return Array.isArray(value) ? ((value[index] as number) ?? null) : null;
  }

  protected onRangeChanged(row: ConditionFormGroup, index: 0 | 1, raw: string): void {
    const current = Array.isArray(row.controls.value.value)
      ? [...(row.controls.value.value as unknown[])]
      : [null, null];

    current[index] = raw === '' ? null : Number(raw);
    row.controls.value.setValue(current);
  }

  private resetValue(row: ConditionFormGroup): void {
    const kind = this.valueKind(row);
    const control = row.controls.value;

    if (kind === 'none') {
      control.setValue(null);
      control.clearValidators();
    } else {
      control.setValue(kind === 'multi' || kind === 'range' ? [] : '');
      control.setValidators([Validators.required]);
    }

    control.updateValueAndValidity();
  }

  private createRow(field: string, operator: ConditionOperator): ConditionFormGroup {
    return this.fb.nonNullable.group({
      field: [field, Validators.required],
      operator: [operator, Validators.required],
      value: this.fb.nonNullable.control<unknown>('', Validators.required),
    }) as ConditionFormGroup;
  }
}
