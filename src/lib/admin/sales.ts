import type { SupabaseClient } from "@supabase/supabase-js";
import { isISODate, monthStart, todayISO } from "@/lib/dates";

export type SalesFilters = { de: string; ate: string; metodo: string; q: string; produto: string; ajuste: string };
export type SaleItem = { name: string; size: string; color: string; qty: number };
export type SaleRow = {
  id: string; sold_at: string;
  subtotal: number;        // valor original do pedido
  discount_amount: number; // desconto dado na confirmação
  total: number;           // valor cobrado (original - desconto)
  refunded: number;        // estornos
  retro: number;           // descontos retroativos
  net: number;             // valor líquido final
  status: string; method: string;
  code: string; customer: string; order_id: string; items: SaleItem[];
};
export type SalesResult = { count: number; total: number; rows: SaleRow[] };

export const PAGE_SIZE = 20;
export type AdjustState = "none" | "partial" | "full";

/** Situação de estorno da venda: nenhum, parcial ou integral (saldo líquido zerado). */
export function adjustState(s: { total: number; refunded: number; retro: number; net: number }): AdjustState {
  if (Number(s.refunded) === 0 && Number(s.retro) === 0) return "none";
  return Number(s.net) <= 0 && Number(s.total) > 0 ? "full" : "partial";
}

/** Texto e estilo do selo de estorno (mostra "Desconto retroativo" quando só houve desconto). */
export function adjustBadge(s: { total: number; refunded: number; retro: number; net: number }) {
  const st = adjustState(s);
  if (st === "none") return { label: "Sem estorno", cls: "bg-surface-2 text-muted" };
  if (st === "full") return { label: "Estorno integral", cls: "bg-ink text-surface" };
  if (Number(s.refunded) > 0) return { label: "Estorno parcial", cls: "bg-warn/15 text-warn" };
  return { label: "Desconto retroativo", cls: "bg-warn/15 text-warn" };
}

export const ADJUST_KIND_LABEL: Record<string, string> = {
  refund_full: "Estorno integral", refund_partial: "Estorno parcial", retro_discount: "Desconto retroativo",
};

export const SALE_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Concluída", cls: "bg-good/15 text-good" },
  refunded: { label: "Estornada", cls: "bg-bad/15 text-bad" },
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
    ajuste: ["none", "partial", "full"].includes(sp.ajuste ?? "") ? (sp.ajuste as string) : "",
  };
}

export async function listSales(supabase: SupabaseClient, f: SalesFilters, limit: number, offset: number) {
  const { data, error } = await supabase.rpc("list_sales", {
    p_from: f.de, p_to: f.ate, p_method: f.metodo || null,
    p_q: f.q || null, p_product: f.produto || null, p_adjust: f.ajuste || null, p_limit: limit, p_offset: offset,
  });
  return { data: (data as SalesResult | null) ?? null, error: error?.message ?? null };
}
