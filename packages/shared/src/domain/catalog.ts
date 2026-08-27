import type { FieldType } from './enums.js';

/**
 * A single addressable value inside an event payload.
 *
 * `path` is a dot path into the payload (`order.value`). The client uses `type`
 * and `options` to decide which operators to offer and which input control to
 * render, which is why adding a field server-side needs no client change.
 */
export interface EventFieldDefinition {
  readonly path: string;
  readonly label: string;
  readonly type: FieldType;
  /** Allowed values when `type` is `enum`. */
  readonly options?: readonly string[];
  /** Display hint used by the template renderer and the client formatters. */
  readonly format?: 'currency' | 'date' | 'percent' | 'plain';
  readonly description?: string;
}

/** An event type the system knows how to receive and evaluate rules against. */
export interface EventTypeDefinition {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly category: string;
  readonly fields: readonly EventFieldDefinition[];
  /** Prefilled payload used by the event simulator and by the rule dry run. */
  readonly samplePayload: Record<string, unknown>;
}

/** Payload of `GET /catalog/events`. */
export interface EventCatalogResponse {
  readonly events: readonly EventTypeDefinition[];
}
