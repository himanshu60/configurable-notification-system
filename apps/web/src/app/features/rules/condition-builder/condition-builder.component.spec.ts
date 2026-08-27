import { TestBed } from '@angular/core/testing';
import { FormArray, FormBuilder, type FormGroup } from '@angular/forms';
import { provideZonelessChangeDetection } from '@angular/core';
import { OPERATORS_BY_FIELD_TYPE, OPERATOR_LABELS, CONDITION_OPERATORS } from '@cns/shared';
import { CatalogService, type CatalogResponse } from '../../../core/api/catalog.service';
import {
  ConditionBuilderComponent,
  type ConditionsFormGroup,
} from './condition-builder.component';

/**
 * The builder's whole promise is that it derives itself from the catalog, so
 * these tests drive it with a stub catalog and assert that changing the field
 * changes what the user is offered.
 */
const CATALOG: CatalogResponse = {
  events: [
    {
      type: 'order.created',
      label: 'Order created',
      description: '',
      category: 'Orders',
      fields: [
        { path: 'order.value', label: 'Order value', type: 'number', format: 'currency' },
        { path: 'order.region', label: 'Region', type: 'enum', options: ['NA', 'EMEA'] },
        { path: 'order.expedited', label: 'Expedited', type: 'boolean' },
        { path: 'customer.name', label: 'Customer name', type: 'string' },
      ],
      samplePayload: {},
    },
  ],
  operators: CONDITION_OPERATORS.map((value) => ({ value, label: OPERATOR_LABELS[value] })),
  operatorsByFieldType: OPERATORS_BY_FIELD_TYPE as CatalogResponse['operatorsByFieldType'],
  channels: ['EMAIL', 'IN_APP'],
  recipientTypes: ['USER', 'EMAIL', 'ROLE'],
  templateFormatters: ['currency'],
};

describe('ConditionBuilderComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ConditionBuilderComponent>>;
  let component: ConditionBuilderComponent;
  let group: ConditionsFormGroup;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConditionBuilderComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fb = TestBed.inject(FormBuilder);
    group = fb.nonNullable.group({
      logic: fb.nonNullable.control<'AND' | 'OR'>('AND'),
      items: fb.array([]),
    }) as unknown as ConditionsFormGroup;

    TestBed.inject(CatalogService).catalog.set(CATALOG);

    fixture = TestBed.createComponent(ConditionBuilderComponent);
    fixture.componentRef.setInput('group', group);
    fixture.componentRef.setInput('eventType', 'order.created');
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  const rows = () => group.controls.items as FormArray<FormGroup>;
  const firstRow = () => rows().at(0) as never;

  it('starts with no conditions, which means the rule matches every event', () => {
    expect(rows().length).toBe(0);
  });

  it('seeds a new row with the first field and a valid operator for it', () => {
    component['addCondition']();

    expect(rows().length).toBe(1);
    expect(rows().at(0).get('field')?.value).toBe('order.value');
    expect(OPERATORS_BY_FIELD_TYPE.number).toContain(rows().at(0).get('operator')?.value);
  });

  it('offers only the operators that suit a number field', () => {
    component['addCondition']();
    const offered = component['operators'](firstRow()).map((operator) => operator.value);

    expect(offered).toContain('gt');
    expect(offered).toContain('between');
    expect(offered).not.toContain('starts_with');
  });

  it('offers membership operators for an enum field and drops numeric ones', () => {
    component['addCondition']();
    rows().at(0).get('field')?.setValue('order.region');
    component['onFieldChanged'](firstRow());

    const offered = component['operators'](firstRow()).map((operator) => operator.value);
    expect(offered).toContain('in');
    expect(offered).not.toContain('gt');
  });

  it('repairs the operator when the new field cannot use the current one', () => {
    component['addCondition']();
    rows().at(0).get('operator')?.setValue('between');

    rows().at(0).get('field')?.setValue('customer.name');
    component['onFieldChanged'](firstRow());

    expect(rows().at(0).get('operator')?.value).not.toBe('between');
    expect(OPERATORS_BY_FIELD_TYPE.string).toContain(rows().at(0).get('operator')?.value);
  });

  describe('value control selection', () => {
    beforeEach(() => component['addCondition']());

    it('renders a number input for a numeric comparison', () => {
      rows().at(0).get('operator')?.setValue('gt');
      expect(component['valueKind'](firstRow())).toBe('number');
    });

    it('renders a paired range input for between', () => {
      rows().at(0).get('operator')?.setValue('between');
      expect(component['valueKind'](firstRow())).toBe('range');
    });

    it('renders no input at all for a presence check', () => {
      rows().at(0).get('operator')?.setValue('exists');
      expect(component['valueKind'](firstRow())).toBe('none');
    });

    it('renders a single select for an enum equality check', () => {
      rows().at(0).get('field')?.setValue('order.region');
      rows().at(0).get('operator')?.setValue('eq');
      expect(component['valueKind'](firstRow())).toBe('select');
    });

    it('renders a multi select when an enum field uses a list operator', () => {
      rows().at(0).get('field')?.setValue('order.region');
      rows().at(0).get('operator')?.setValue('in');
      expect(component['valueKind'](firstRow())).toBe('multi');
    });

    it('renders a boolean select for a boolean field', () => {
      rows().at(0).get('field')?.setValue('order.expedited');
      rows().at(0).get('operator')?.setValue('eq');
      expect(component['valueKind'](firstRow())).toBe('boolean');
    });
  });

  it('drops the value requirement when the operator stops needing one', () => {
    component['addCondition']();
    rows().at(0).get('operator')?.setValue('exists');
    component['onOperatorChanged'](firstRow());

    expect(rows().at(0).get('value')?.valid).toBe(true);
  });

  it('parses comma separated entry into a typed list', () => {
    component['addCondition']();
    rows().at(0).get('operator')?.setValue('in');
    component['onListText'](firstRow(), '10, 20 , 30');

    expect(rows().at(0).get('value')?.value).toEqual([10, 20, 30]);
  });

  it('removes a condition row', () => {
    component['addCondition']();
    component['addCondition']();
    component['removeCondition'](0);

    expect(rows().length).toBe(1);
  });
});
