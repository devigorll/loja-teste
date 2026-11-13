import Link from "next/link";
import { ProductCard } from "@/components/shop/product-card";
import { getCategories, getProducts, getStore } from "@/lib/catalog";

export const revalidate = 60;

export default async function HomePage() {
  const [store, categories, products] = await Promise.all([getStore(), getCategories(), getProducts()]);
  const featured = products.filter((p) => p.is_featured).slice(0, 4);
  const news = products.slice(0, 8);

  return (
    <>
      <section className="bg-neutral-950 text-white">
        <div className="mx-auto flex min-h-[70dvh] max-w-7xl flex-col justify-end px-4 pb-14 pt-24 sm:px-6">
          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tighter sm:text-7xl lg:text-8xl">
            Roupa para quem não espera a cidade acordar.
          </h1>
          <p className="mt-5 max-w-md text-neutral-300">{store.description}</p>
          <div className="mt-8 flex gap-3">
            <Link href="/catalogo?ordem=novidades" className="rounded-full bg-white px-7 py-3.5 font-semibold text-neutral-950 transition active:scale-95">Ver novidades</Link>
            <Link href="/catalogo" className="rounded-full border border-white/40 px-7 py-3.5 font-semibold transition active:scale-95">Todo o catálogo</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">Categorias</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link key={c.id} href={`/catalogo?categoria=${c.slug}`} className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium transition hover:bg-neutral-950 hover:text-white active:scale-95 dark:border-neutral-700 dark:hover:bg-white dark:hover:text-neutral-950">{c.name}</Link>
          ))}
        </div>
      </section>

      <Section title="Em destaque" href="/catalogo" items={featured} />
      <Section title="Novidades" href="/catalogo?ordem=novidades" items={news} />
    </>
  );
}

function Section({ title, href, items }: { title: string; href: string; items: Awaited<ReturnType<typeof getProducts>> }) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <Link href={href} className="text-sm font-medium underline underline-offset-4">Ver tudo</Link>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
        {items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
