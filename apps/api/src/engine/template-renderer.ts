import { readPath } from './path.js';

/**
 * `{{ order.value | currency }}` — a path, optionally piped through one named
 * formatter. Intentionally the entire grammar: no expressions, no logic, no
 * function calls, so a template can never execute anything.
 */
const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*([a-zA-Z0-9_]+)\s*)?\}\}/g;

export type FormatterName = 'currency' | 'number' | 'date' | 'datetime' | 'upper' | 'lower';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat('en-US');

const FORMATTERS: Record<FormatterName, (value: unknown) => string> = {
  currency: (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? currency.format(amount) : stringify(value);
  },
  number: (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? decimal.format(amount) : stringify(value);
  },
  date: (value) => {
    const date = toDate(value);
    return date ? date.toISOString().slice(0, 10) : stringify(value);
  },
  datetime: (value) => {
    const date = toDate(value);
    return date ? date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : stringify(value);
  },
  upper: (value) => stringify(value).toUpperCase(),
  lower: (value) => stringify(value).toLowerCase(),
};

const toDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
};

const stringify = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export interface RenderResult {
  text: string;
  /** Tokens whose path was absent from the context, surfaced by the dry run. */
  missing: string[];
}

/**
 * Substitutes tokens against a context. Unknown paths render as an empty string
 * and are reported in `missing` rather than leaving `{{...}}` in a message that
 * a customer would read.
 */
export const render = (template: string, context: unknown): RenderResult => {
  const missing = new Set<string>();

  const text = template.replace(TOKEN, (_match, path: string, formatter?: string) => {
    const value = readPath(context, path);

    if (value === undefined || value === null) {
      missing.add(path);
      return '';
    }

    const format = formatter ? FORMATTERS[formatter as FormatterName] : undefined;
    return format ? format(value) : stringify(value);
  });

  return { text, missing: [...missing] };
};

/**
 * Context handed to every template. `event` and `rule` are always available;
 * payload fields are addressable both at the root (`order.value`) and namespaced
 * (`payload.order.value`).
 */
export interface TemplateContext {
  event: { id: string; type: string; source: string; occurredAt: string };
  rule: { id: string; name: string };
  recipient: { type: string; value: string };
  payload: Record<string, unknown>;
  [key: string]: unknown;
}

export const buildContext = (
  base: Omit<TemplateContext, 'payload' | string> & { payload: Record<string, unknown> },
): TemplateContext => ({ ...base.payload, ...base }) as TemplateContext;

export const AVAILABLE_FORMATTERS: readonly FormatterName[] = Object.keys(
  FORMATTERS,
) as FormatterName[];
