export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function readParams(searchParams: SearchParams) {
  const p = await searchParams;
  return (key: string) => {
    const v = p[key];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
}

export function qs(base: string, params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}
