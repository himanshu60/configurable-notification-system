const ARRAY_INDEX = /^\d+$/;

/** Keys that would let a crafted payload path reach into the prototype chain. */
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Reads a dot path such as `order.items.0.sku` out of an arbitrary payload.
 *
 * Returns `undefined` for any missing or non-traversable segment rather than
 * throwing, so a rule written against a field an event happens not to carry is
 * simply an unmatched condition instead of an ingestion failure.
 */
export const readPath = (source: unknown, path: string): unknown => {
  if (!path) return undefined;

  let current: unknown = source;

  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (BLOCKED_KEYS.has(segment)) return undefined;

    if (Array.isArray(current)) {
      if (!ARRAY_INDEX.test(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }

    if (typeof current !== 'object') return undefined;

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

/** Flattens a payload into the dot paths a template or condition can address. */
export const collectPaths = (source: unknown, prefix = '', depth = 0): string[] => {
  if (depth > 6 || source === null || typeof source !== 'object') return [];

  return Object.entries(source as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const nested =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? collectPaths(value, path, depth + 1)
        : [];
    return [path, ...nested];
  });
};
