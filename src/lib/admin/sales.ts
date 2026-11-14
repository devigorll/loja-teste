import type { SupabaseClient } from "@supabase/supabase-js";
import { isISODate, monthStart, todayISO } from "@/lib/dates";

export type SalesFilters = { de: string; ate: string; metodo: string; q: string; produto: string };
export type SaleItem = { name: string; size: string; color: string; qty: number };
export type SaleRow = {
  id: string; sold_at: string; total: number; status: string; method: string;
  code: string; customer: string; order_id: string; items: SaleItem[];
};
export type SalesResult = { count: number; total: number; rows: SaleRow[] };

export const PAGE_SIZE = 20;
export const SALE_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Concluída", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  refunded: { label: "Estornada", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

export function parseSalesFilters(sp: Record<string, string | undefined>): SalesFilters {
  const today = todayISO();
  let de = isISODate(sp.de) ? sp.de : monthStart(today);
  let ate = isISODate(sp.ate) ? sp.ate : today;
  if (de > ate) [de, ate] = [ate, de];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return {
    de, ate,
    metodo: sp.metodo && uuid.test(sp.metodo) ? sp.metodo : "",
    q: (sp.q ?? "").slice(0, 80),
    produto: (sp.produto ?? "").slice(0, 80),
  };
}

export async function listSales(supabase: SupabaseClient, f: SalesFilters, limit: number, offset: number) {
  const { data, error } = await supabase.rpc("list_sales", {
    p_from: f.de, p_to: f.ate, p_method: f.metodo || null,
    p_q: f.q || null, p_product: f.produto || null, p_limit: limit, p_offset: offset,
  });
  return { data: (data as SalesResult | null) ?? null, error: error?.message ?? null };
}
