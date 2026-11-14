const TZ = "America/Sao_Paulo";

export const isISODate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const monthStart = (iso: string) => `${iso.slice(0, 8)}01`;
export const dayStart = (d: string) => `${d}T00:00:00-03:00`;
export const dayEnd = (d: string) => `${d}T23:59:59.999-03:00`;
export const fmtDay = (d: string) => d.split("-").reverse().join("/");
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: TZ });
