import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogVariant = { id: string; label: string; price: number; stock: number };

type VarRow = {
  id: string; size: string; color: string; stock: number; price_override: number | null; is_active: boolean;
  products: { name: string; price: number; promo_price: number | null; is_active: boolean } | null;
};

/** Variações ativas (produto + tamanho + cor) com preço atual e estoque, para montar pedidos no painel. */
export async function loadCatalog(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("product_variants")
    .select("id, size, color, stock, price_override, is_active, products(name, price, promo_price, is_active)");
  const rows = (data ?? []) as unknown as VarRow[];

  const stock: Record<string, number> = {};
  rows.forEach((r) => { stock[r.id] = r.stock; });

  const catalog: CatalogVariant[] = rows
    .filter((r) => r.is_active && r.products?.is_active)
    .map((r) => ({
      id: r.id,
      label: `${r.products!.name} — ${r.size} / ${r.color}`,
      price: r.price_override ?? r.products!.promo_price ?? r.products!.price,
      stock: r.stock,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { catalog, stock };
}
