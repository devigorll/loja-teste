import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { BADGE_LABEL, basePrice, isSoldOut, mainImage } from "@/lib/product-utils";
import { formatBRL } from "@/lib/format";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const img = mainImage(product);
  const soldOut = isSoldOut(product);
  return (
    <Link href={`/produto/${product.slug}`} className="group block rounded-xl transition-transform duration-200 active:scale-[0.98]">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-900">
        {img && (
          <Image src={img} alt={product.name} fill priority={priority} unoptimized={img.endsWith(".svg")}
            sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
            className={`object-cover transition duration-500 group-hover:scale-105 ${soldOut ? "opacity-50" : ""}`} />
        )}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {soldOut && <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">Esgotado</span>}
          {!soldOut && product.badge === "bestseller" && <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">{BADGE_LABEL.bestseller}</span>}
          {!soldOut && product.badge === "new" && <span className="rounded-full border border-neutral-950 bg-white px-3 py-1 text-xs font-semibold text-neutral-950 dark:border-white dark:bg-neutral-950 dark:text-white">{BADGE_LABEL.new}</span>}
          {!soldOut && product.promo_price && <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-950 dark:bg-neutral-800 dark:text-white">Promoção</span>}
        </div>
      </div>
      <div className="mt-3 space-y-0.5">
        <p className="font-semibold leading-snug transition group-hover:underline group-hover:underline-offset-4">{product.name}</p>
        <p className="text-sm text-neutral-500">{product.categories?.name}</p>
        <p className="pt-1 text-sm font-semibold">
          {formatBRL(basePrice(product))}
          {product.promo_price && <span className="ml-2 font-normal text-neutral-500 line-through">{formatBRL(product.price)}</span>}
        </p>
      </div>
    </Link>
  );
}