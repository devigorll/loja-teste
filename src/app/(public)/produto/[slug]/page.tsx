import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProductCard } from "@/components/shop/product-card";
import { getProductBySlug, getRelated, mainImage } from "@/lib/catalog";
import { ProductPurchase } from "./product-purchase";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  return { title: p?.name ?? "Produto", description: p?.description ?? undefined };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();

  const related = await getRelated(product);
  const images = [...product.product_images].sort((a, b) => a.position - b.position);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto lg:grid lg:overflow-visible">
          {images.map((img, i) => (
            <div key={img.url} className="relative aspect-[4/5] w-full shrink-0 snap-center overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900">
              <Image src={img.url} alt={img.alt ?? product.name} fill priority={i === 0} unoptimized={img.url.endsWith(".svg")} sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
            </div>
          ))}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-sm text-neutral-500">{product.categories?.name}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{product.name}</h1>
          <p className="mt-4 max-w-prose text-neutral-600 dark:text-neutral-400">{product.description}</p>
          <div className="mt-8">
            <ProductPurchase product={product} image={mainImage(product)} />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">Você também pode gostar</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
