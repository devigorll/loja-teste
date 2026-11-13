"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Product } from "@/lib/catalog";
import { formatBRL } from "@/lib/format";
import { useCart } from "@/lib/store/cart";

export function ProductPurchase({ product, image }: { product: Product; image: string | null }) {
  const variants = product.product_variants;
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size))], [variants]);
  const colors = useMemo(() => {
    const map = new Map<string, string | null>();
    variants.forEach((v) => map.set(v.color, v.color_hex));
    return [...map];
  }, [variants]);

  const firstAvail = variants.find((v) => v.stock > 0);
  const [size, setSize] = useState(firstAvail?.size ?? sizes[0]);
  const [color, setColor] = useState(firstAvail?.color ?? colors[0]?.[0]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const add = useCart((s) => s.add);

  const variant = variants.find((v) => v.size === size && v.color === color);
  const stock = variant?.stock ?? 0;
  const soldOut = variants.every((v) => v.stock === 0);
  const unit = variant?.price_override ?? product.promo_price ?? product.price;
  const available = (s: string, c: string) => (variants.find((v) => v.size === s && v.color === c)?.stock ?? 0) > 0;

  function handleAdd() {
    if (!variant || stock === 0) return;
    add({ variantId: variant.id, slug: product.slug, name: product.name, size, color, price: unit, qty, max: stock, image });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  if (soldOut) {
    return <p className="rounded-xl bg-neutral-100 p-5 font-medium dark:bg-neutral-900">Produto esgotado. Em breve teremos reposição!</p>;
  }

  return (
    <div className="space-y-7">
      <p className="text-2xl font-bold">
        {formatBRL(unit)}
        {!variant?.price_override && product.promo_price && <span className="ml-3 text-base font-normal text-neutral-500 line-through">{formatBRL(product.price)}</span>}
      </p>

      <fieldset>
        <legend className="mb-3 font-semibold">Cor: <span className="font-normal">{color}</span></legend>
        <div className="flex flex-wrap gap-3">
          {colors.map(([name, hex]) => {
            const ok = sizes.some((s) => available(s, name));
            return (
              <button key={name} type="button" disabled={!ok} aria-label={`${name}${ok ? "" : " (esgotada)"}`} aria-pressed={color === name}
                onClick={() => { setColor(name); setQty(1); if (!available(size, name)) setSize(sizes.find((s) => available(s, name)) ?? size); }}
                style={{ backgroundColor: hex ?? "#ccc" }}
                className={`size-10 rounded-full border-2 transition active:scale-90 disabled:opacity-30 ${color === name ? "ring-2 ring-offset-2 ring-neutral-950 dark:ring-white dark:ring-offset-neutral-950" : "border-neutral-300"}`} />
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-semibold">Tamanho</legend>
        <div className="grid grid-cols-4 gap-2">
          {sizes.map((s) => {
            const ok = color ? available(s, color) : false;
            return (
              <button key={s} type="button" disabled={!ok} aria-pressed={size === s} onClick={() => { setSize(s); setQty(1); }}
                className={`relative rounded-lg border py-3 text-sm font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:line-through ${size === s ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950" : "border-neutral-300 dark:border-neutral-700"}`}>
                {s}
              </button>
            );
          })}
        </div>
      </fieldset>

      <p className="text-sm text-neutral-500" aria-live="polite">
        {stock === 0 ? "Esta combinação está esgotada." : stock <= (variant?.stock ? 3 : 0) ? `Restam apenas ${stock} unidades.` : `${stock} unidades disponíveis.`}
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center rounded-full border border-neutral-300 dark:border-neutral-700">
          <button type="button" aria-label="Diminuir quantidade" disabled={qty <= 1} onClick={() => setQty(qty - 1)} className="grid size-11 place-items-center disabled:opacity-30"><Minus size={16} /></button>
          <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
          <button type="button" aria-label="Aumentar quantidade" disabled={qty >= stock} onClick={() => setQty(qty + 1)} className="grid size-11 place-items-center disabled:opacity-30"><Plus size={16} /></button>
        </div>
        <button type="button" onClick={handleAdd} disabled={stock === 0}
          className="relative flex-1 overflow-hidden rounded-full bg-neutral-950 py-3.5 font-semibold text-white transition active:scale-[0.98] disabled:opacity-40 dark:bg-white dark:text-neutral-950">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={added ? "ok" : "add"} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} className="flex items-center justify-center gap-2">
              {added ? <><Check size={18} /> Adicionado</> : "Adicionar ao carrinho"}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
