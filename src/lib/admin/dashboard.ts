import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export type DashboardSummary = {
  revenue: number; sales_count: number; orders_count: number; pending_orders: number;
  products_count: number; low_stock: number; out_of_stock: number;
  daily: { day: string; revenue: number; sales: number; orders: number }[];
  payments: { name: string; total: number; count: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
  bottom_products: { name: string; qty: number; revenue: number }[];
  categories: { name: string; qty: number; revenue: number }[];
};

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

/** Período do dashboard. Padrão: últimos 30 dias. Máximo: 366 dias. */
export function parseDashboardRange(sp: Record<string, string | undefined>) {
  const t = todayISO();
  let de = isISODate(sp.de) ? sp.de : addDays(t, -29);
  let ate = isISODate(sp.ate) ? sp.ate : t;
  if (de > ate) [de, ate] = [ate, de];
  if (dayNumber(ate) - dayNumber(de) > 365) de = addDays(ate, -365);
  const len = dayNumber(ate) - dayNumber(de) + 1;
  return { de, ate, len, prevDe: addDays(de, -len), prevAte: addDays(de, -1) };
}

export async function getDashboard(supabase: SupabaseClient, from: string, to: string) {
  const { data, error } = await supabase.rpc("dashboard_summary", { p_from: from, p_to: to });
  return { data: (data as DashboardSummary | null) ?? null, error: error?.message ?? null };
}

export type HistoryRow = { year: number; month: number; revenue: number; sales: number };

/** Faturamento agrupado por ano e mês (todas as vendas concluídas). */
export async function getRevenueHistory(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("revenue_history");
  return { data: ((data as HistoryRow[] | null) ?? []).map((r) => ({ ...r, revenue: Number(r.revenue) })), error: error?.message ?? null };
}
