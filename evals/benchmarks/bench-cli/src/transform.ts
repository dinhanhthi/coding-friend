type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Flattens a nested object into a single-level object with dot-notation keys.
 */
export function flattenJson(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenJson(value as Record<string, unknown>, fullKey),
      );
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Filters an object to only include the specified keys.
 */
export function filterKeys(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Sorts an array of objects by a given field.
 *
 * BUG: Crashes with "Cannot read properties of null" when some items
 * have null values in the sort field. Calls .toString() without null check.
 */
export function sortByField<T extends Record<string, unknown>>(
  arr: T[],
  field: string,
): T[] {
  return [...arr].sort((a, b) => {
    // BUG: No null/undefined check — crashes if a[field] or b[field] is null
    const valA = (a[field] as { toString(): string }).toString();
    const valB = (b[field] as { toString(): string }).toString();
    return valA.localeCompare(valB);
  });
}
