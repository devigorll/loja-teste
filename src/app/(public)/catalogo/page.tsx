import Link from "next/link";
import { ProductCard } from "@/components/shop/product-card";
import { getCategories, getProducts, type Filters } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const [categories, all, products] = await Promise.all([getCategories(), getProducts(), getProducts(f)]);

  const sizes = [...new Set(all.flatMap((p) => p.product_variants.map((v) => v.size)))];
  const colors = [...new Set(all.flatMap((p) => p.product_variants.map((v) => v.color)))];
  const active = Object.values(f).some(Boolean);
  const field = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Catálogo</h1>

      <form className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <details className="group" open={active}>
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
            Buscar e filtrar <span className="text-sm font-normal text-neutral-500">{products.length} produtos</span>
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input name="q" defaultValue={f.q} placeholder="Nome do produto" aria-label="Nome do produto" className={field} />
            <select name="categoria" defaultValue={f.categoria ?? ""} aria-label="Categoria" className={field}>
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
            <select name="tamanho" defaultValue={f.tamanho ?? ""} aria-label="Tamanho" className={field}>
              <option value="">Qualquer tamanho</option>
              {sizes.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select name="cor" defaultValue={f.cor ?? ""} aria-label="Cor" className={field}>
              <option value="">Qualquer cor</option>
              {colors.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input name="min" type="number" min="0" defaultValue={f.min} placeholder="Preço mínimo (R$)" aria-label="Preço mínimo" className={field} />
            <input name="max" type="number" min="0" defaultValue={f.max} placeholder="Preço máximo (R$)" aria-label="Preço máximo" className={field} />
            <select name="ordem" defaultValue={f.ordem ?? "novidades"} aria-label="Ordenar por" className={field}>
              <option value="novidades">Novidades</option>
              <option value="menor">Menor preço</option>
              <option value="maior">Maior preço</option>
            </select>
            <div className="flex gap-2">
              <button className="flex-1 rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-950">Aplicar</button>
              {active && <Link href="/catalogo" className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium dark:border-neutral-700">Limpar</Link>}
            </div>
          </div>
        </details>
      </form>

      {products.length === 0 ? (
        <p className="py-24 text-center text-neutral-500">Nenhum produto encontrado. Tente remover alguns filtros.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
          {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
        </div>
      )}
    </div>
  );
}
