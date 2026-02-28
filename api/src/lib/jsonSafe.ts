/**
 * Recursively converts BigInt values to strings for JSON-safe serialization.
 * Use before res.json() when payloads may contain BigInt (e.g. from Atomiq SDK).
 */
export function jsonSafe<T>(obj: T): T {
  if (typeof obj === "bigint") return String(obj) as T;
  if (Array.isArray(obj)) return obj.map(jsonSafe) as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = jsonSafe(v);
    return out as T;
  }
  return obj;
}
