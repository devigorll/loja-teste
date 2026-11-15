// Utilitários do módulo de estoque. Sem imports de servidor: usado por páginas e por componentes do navegador.
export { BADGE_LABEL } from "@/lib/product-utils";

export type Status = "active" | "unavailable" | "archived";

export type AdminVariant = {
  id: string; size: string; color: string; color_hex: string | null; sku: string | null;
  price_override: number | null; stock: number; low_stock_threshold: number; is_active: boolean;
};
export type AdminImage = { id: string; url: string; alt: string | null; position: number };
export type AdminProduct = {
  id: string; name: string; slug: string; description: string | null;
  price: number; promo_price: number | null;
  is_active: boolean; is_archived: boolean; is_featured: boolean; badge_override: string | null;
  created_at: string; category_id: string | null;
  categories: { name: string } | null;
  product_images: AdminImage[];
  product_variants: AdminVariant[];
};

export const PRODUCT_SELECT =
  "id,name,slug,description,price,promo_price,is_active,is_archived,is_featured,badge_override,created_at,category_id,categories(name),product_images(id,url,alt,position),product_variants(id,size,color,color_hex,sku,price_override,stock,low_stock_threshold,is_active)";

export const BUCKET = "media";
export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export const statusOf = (p: Pick<AdminProduct, "is_active" | "is_archived">): Status =>
  p.is_archived ? "archived" : p.is_active ? "active" : "unavailable";

export const STATUS_LABEL: Record<Status, string> = { active: "Disponível", unavailable: "Indisponível", archived: "Arquivado" };
export const STATUS_HELP: Record<Status, string> = {
  active: "Aparece no site e pode ser comprado.",
  unavailable: "Fica cadastrado, mas some do site e não pode ser comprado.",
  archived: "Fora de circulação. Os dados ficam guardados e dá para restaurar.",
};

export const BADGE_OPTIONS = [
  { value: "", label: "Automático (pelas regras)" },
  { value: "new", label: "Novidade" },
  { value: "bestseller", label: "Mais vendido" },
  { value: "none", label: "Sem selo" },
];

export const MOVEMENT_LABEL: Record<string, string> = {
  entry: "Entrada", exit: "Saída", adjustment: "Ajuste", sale: "Venda", refund: "Estorno",
};

/** Totais considerando só as variações ativas. */
export function stockInfo(p: Pick<AdminProduct, "product_variants">) {
  const vs = p.product_variants.filter((v) => v.is_active);
  const total = vs.reduce((s, v) => s + v.stock, 0);
  return { total, out: total === 0, low: total > 0 && vs.some((v) => v.stock > 0 && v.stock <= v.low_stock_threshold) };
}

/** Caminho do arquivo no Storage a partir da URL pública (null se a imagem não for do nosso bucket). */
export function storagePathFromUrl(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/media\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Aceita "12,50" ou "12.50". Vazio/ inválido vira NaN. */
export function parseMoney(s: string) {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

// ---- Rascunho do formulário de produto (usado no servidor para montar o valor inicial e no navegador para editar)
export type VariantDraft = {
  key: string; id: string | null; size: string; color: string; color_hex: string; sku: string;
  price_override: string; stock: string; low_stock_threshold: string; is_active: boolean;
};
export type ProductDraft = {
  name: string; description: string; category_id: string; price: string; promo_price: string;
  is_featured: boolean; status: Status; badge_override: string; variants: VariantDraft[];
};
export const blankVariant = (size = "", color = ""): VariantDraft => ({
  key: crypto.randomUUID(), id: null, size, color, color_hex: "", sku: "", price_override: "", stock: "0", low_stock_threshold: "3", is_active: true,
});
