import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentStore } from "@/lib/store-context";

import { basePrice, type BadgeKind } from "@/lib/product-utils";
export { basePrice, totalStock, isSoldOut, mainImage } from "@/lib/product-utils";

export type Variant = {
  id: string; size: string; color: string; color_hex: string | null;
  stock: number; price_override: number | null; is_active: boolean;
};
export type Product = {
  id: string; name: string; slug: string; description: string | null;
  price: number; promo_price: number | null; is_featured: boolean; created_at: string;
  categories: { name: string; slug: string } | null;
  product_images: { url: string; alt: string | null; position: number }[];
  product_variants: Variant[];
  badge?: BadgeKind | null; // selo efetivo (manual do administrador ou automático)
};
export type Store = {
  store_id: string;
  name: string; logo_url: string | null; description: string | null; phone: string | null;
  whatsapp: string | null; address: string | null; social_links: Record<string, string>;
  opening_hours: Record<string, string>; delivery_info: string | null; pickup_info: string | null;
};
export type Filters = {
  q?: string; categoria?: string; tamanho?: string; cor?: string;
  min?: string; max?: string; ordem?: string;
};

const SELECT =
  "id,name,slug,description,price,promo_price,is_featured,created_at,categories(name,slug),product_images(url,alt,position),product_variants(id,size,color,color_hex,stock,price_override,is_active)";

/** Selos efetivos por produto (função do banco: respeita o selo manual e aplica as regras automáticas). */
async function getBadgeMap(supabase: ReturnType<typeof createPublicClient>, storeId: string) {
  const { data } = await supabase.rpc("get_product_badges", { p_store_id: storeId });
  const map = new Map<string, BadgeKind>();
  ((data ?? []) as { product_id: string; badge: BadgeKind | null }[]).forEach((r) => { if (r.badge) map.set(r.product_id, r.badge); });
  return map;
}

export async function getStore(): Promise<Store> {
  const current = await getCurrentStore();
  if (!current) return { store_id: "", name: "Loja", social_links: {}, opening_hours: {} } as unknown as Store;
  const { data } = await createPublicClient().from("store_settings").select("*").eq("store_id", current.id).maybeSingle();
  return { ...(data ?? { name: current.name, social_links: {}, opening_hours: {} }), store_id: current.id } as Store;
}

export async function getCategories() {
  const current = await getCurrentStore();
  if (!current) return [];
  const { data } = await createPublicClient().from("categories").select("id,name,slug").eq("store_id", current.id).order("position");
  return data ?? [];
}

export async function getProducts(f: Filters = {}): Promise<Product[]> {
  const current = await getCurrentStore();
  if (!current) return [];
  const supabase = createPublicClient();
  let query = supabase.from("products").select(SELECT).eq("store_id", current.id).order("created_at", { ascending: false });
  if (f.q) query = query.ilike("name", `%${f.q.replace(/[%,]/g, " ")}%`);
  const [{ data }, badges] = await Promise.all([query, getBadgeMap(supabase, current.id)]);
  let list = ((data ?? []) as unknown as Product[]).map((p) => ({ ...p, badge: badges.get(p.id) ?? null }));

  if (f.categoria) list = list.filter((p) => p.categories?.slug === f.categoria);
  if (f.tamanho) list = list.filter((p) => p.product_variants.some((v) => v.size === f.tamanho && v.stock > 0));
  if (f.cor) list = list.filter((p) => p.product_variants.some((v) => v.color === f.cor && v.stock > 0));
  const min = Number(f.min), max = Number(f.max);
  if (f.min && !Number.isNaN(min)) list = list.filter((p) => basePrice(p) >= min);
  if (f.max && !Number.isNaN(max)) list = list.filter((p) => basePrice(p) <= max);

  if (f.ordem === "menor") list.sort((a, b) => basePrice(a) - basePrice(b));
  if (f.ordem === "maior") list.sort((a, b) => basePrice(b) - basePrice(a));
  return list;
}

export async function getProductBySlug(slug: string) {
  const current = await getCurrentStore();
  if (!current) return null;
  const supabase = createPublicClient();
  const [{ data }, badges] = await Promise.all([
    supabase.from("products").select(SELECT).eq("store_id", current.id).eq("slug", slug).maybeSingle(),
    getBadgeMap(supabase, current.id),
  ]);
  if (!data) return null;
  const p = data as unknown as Product;
  return { ...p, badge: badges.get(p.id) ?? null } as Product;
}

export async function getRelated(p: Product) {
  if (!p.categories) return [];
  const all = await getProducts({ categoria: p.categories.slug });
  return all.filter((x) => x.id !== p.id).slice(0, 4);
}
