import { createClient } from "@/lib/supabase/server";

import { basePrice } from "@/lib/product-utils";
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
};
export type Store = {
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

export async function getStore(): Promise<Store> {
  const supabase = await createClient();
  const { data } = await supabase.from("store_settings").select("*").eq("id", 1).single();
  return (data ?? { name: "Loja", social_links: {}, opening_hours: {} }) as Store;
}

export async function getCategories() {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id,name,slug").order("position");
  return data ?? [];
}

export async function getProducts(f: Filters = {}): Promise<Product[]> {
  const supabase = await createClient();
  let query = supabase.from("products").select(SELECT).order("created_at", { ascending: false });
  if (f.q) query = query.ilike("name", `%${f.q.replace(/[%,]/g, " ")}%`);
  const { data } = await query;
  let list = (data ?? []) as unknown as Product[];

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
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(SELECT).eq("slug", slug).maybeSingle();
  return (data as unknown as Product) ?? null;
}

export async function getRelated(p: Product) {
  if (!p.categories) return [];
  const all = await getProducts({ categoria: p.categories.slug });
  return all.filter((x) => x.id !== p.id).slice(0, 4);
}
