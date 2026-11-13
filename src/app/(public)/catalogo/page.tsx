import { CatalogClient, type CatalogFilters } from "@/components/shop/catalog-client";
import { getCategories, getProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";

type SP = Partial<Record<keyof CatalogFilters, string>>;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);

  const initial: CatalogFilters = {
    q: sp.q ?? "", categoria: sp.categoria ?? "", tamanho: sp.tamanho ?? "", cor: sp.cor ?? "",
    min: sp.min ?? "", max: sp.max ?? "", ordem: sp.ordem ?? "novidades",
  };

  return <CatalogClient key={JSON.stringify(initial)} products={products} categories={categories} initial={initial} />;
}