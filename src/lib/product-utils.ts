import type { Product } from "@/lib/catalog";

export const basePrice = (p: Product) => p.promo_price ?? p.price;
export const totalStock = (p: Product) => p.product_variants.reduce((s, v) => s + v.stock, 0);
export const isSoldOut = (p: Product) => totalStock(p) === 0;
export const mainImage = (p: Product) =>
  [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url ?? null;

export type BadgeKind = "new" | "bestseller";
export const BADGE_LABEL: Record<BadgeKind, string> = { new: "Novidade", bestseller: "Mais vendido" };
