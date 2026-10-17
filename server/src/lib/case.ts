/** Recursively converts snake_case object keys to camelCase for API responses. */
export function camel<T = any>(input: any): T {
  if (Array.isArray(input)) return input.map((v) => camel(v)) as any;
  if (input === null || typeof input !== 'object' || input instanceof Date || Buffer.isBuffer(input)) return input;
  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    const key = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    out[key] = camel(v);
  }
  return out;
}
