"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { ProductCard } from "./product-card";
import { basePrice } from "@/lib/product-utils";
import type { Product } from "@/lib/catalog";

type Category = { id: string; name: string; slug: string };
export type CatalogFilters = { q: string; categoria: string; tamanho: string; cor: string; min: string; max: string; ordem: string };

const DEFAULTS: CatalogFilters = { q: "", categoria: "", tamanho: "", cor: "", min: "", max: "", ordem: "novidades" };

export function CatalogClient({ products, categories, initial }: { products: Product[]; categories: Category[]; initial: CatalogFilters }) {
  const [f, setF] = useState<CatalogFilters>(initial);
  const [panel, setPanel] = useState(Boolean(initial.tamanho || initial.cor || initial.min || initial.max));
  const d = useDeferredValue(f);
  const stale = d !== f;

  const sizes = useMemo(() => [...new Set(products.flatMap((p) => p.product_variants.map((v) => v.size)))], [products]);
  const colors = useMemo(() => [...new Set(products.flatMap((p) => p.product_variants.map((v) => v.color)))], [products]);

  const list = useMemo(() => {
    const q = d.q.trim().toLowerCase();
    const min = Number(d.min), max = Number(d.max);
    const r = products.filter((p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (!d.categoria || p.categories?.slug === d.categoria) &&
      (!d.tamanho || p.product_variants.some((v) => v.size === d.tamanho && v.stock > 0)) &&
      (!d.cor || p.product_variants.some((v) => v.color === d.cor && v.stock > 0)) &&
      (!d.min || basePrice(p) >= min) &&
      (!d.max || basePrice(p) <= max)
    );
    if (d.ordem === "menor") return [...r].sort((a, b) => basePrice(a) - basePrice(b));
    if (d.ordem === "maior") return [...r].sort((a, b) => basePrice(b) - basePrice(a));
    return r; // "novidades": a lista já vem ordenada por data de criação
  }, [products, d]);

  function update(patch: Partial<CatalogFilters>) {
    const next = { ...f, ...patch };
    setF(next);
    const qs = new URLSearchParams();
    (Object.keys(next) as (keyof CatalogFilters)[]).forEach((k) => {
      if (next[k] && next[k] !== DEFAULTS[k]) qs.set(k, next[k]);
    });
    const s = qs.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }

  const hasFilters = (Object.keys(DEFAULTS) as (keyof CatalogFilters)[]).some((k) => f[k] !== DEFAULTS[k]);
  const field = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:ring-white";
  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95 ${on
      ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
      : "border-neutral-300 hover:border-neutral-950 dark:border-neutral-700 dark:hover:border-white"}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Catálogo</h1>

      <div className="mt-6 space-y-4">
        <div className="flex gap-3">
          <input value={f.q} onChange={(e) => update({ q: e.target.value })} placeholder="Buscar produto" aria-label="Buscar produto" className={field} />
          <button type="button" aria-expanded={panel} onClick={() => setPanel(!panel)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-neutral-300 px-4 text-sm font-medium transition active:scale-95 dark:border-neutral-700">
            <SlidersHorizontal size={16} /> Filtros
          </button>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" className={chip(!f.categoria)} onClick={() => update({ categoria: "" })}>Todos</button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={chip(f.categoria === c.slug)} onClick={() => update({ categoria: c.slug })}>{c.name}</button>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {panel && (
            <motion.div key="panel" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="grid gap-3 pb-1 sm:grid-cols-2 lg:grid-cols-5">
                <select value={f.tamanho} onChange={(e) => update({ tamanho: e.target.value })} aria-label="Tamanho" className={field}>
                  <option value="">Qualquer tamanho</option>
                  {sizes.map((s) => <option key={s}>{s}</option>)}
                </select>
                <select value={f.cor} onChange={(e) => update({ cor: e.target.value })} aria-label="Cor" className={field}>
                  <option value="">Qualquer cor</option>
                  {colors.map((c) => <option key={c}>{c}</option>)}
                </select>
                <input type="number" min="0" inputMode="numeric" value={f.min} onChange={(e) => update({ min: e.target.value })} placeholder="Preço mínimo (R$)" aria-label="Preço mínimo" className={field} />
                <input type="number" min="0" inputMode="numeric" value={f.max} onChange={(e) => update({ max: e.target.value })} placeholder="Preço máximo (R$)" aria-label="Preço máximo" className={field} />
                <select value={f.ordem} onChange={(e) => update({ ordem: e.target.value })} aria-label="Ordenar por" className={field}>
                  <option value="novidades">Novidades</option>
                  <option value="menor">Menor preço</option>
                  <option value="maior">Maior preço</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between text-sm text-neutral-500" aria-live="polite">
          <span>{list.length} {list.length === 1 ? "produto" : "produtos"}</span>
          {hasFilters && (
            <button type="button" onClick={() => { setF(DEFAULTS); window.history.replaceState(null, "", window.location.pathname); }}
              className="font-medium underline underline-offset-4 transition active:scale-95">Limpar filtros</button>
          )}
        </div>
      </div>

      <div className={`transition-opacity duration-200 ${stale ? "opacity-60" : "opacity-100"}`}>
        {list.length === 0 ? (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-24 text-center text-neutral-500">
            Nenhum produto encontrado. Tente remover alguns filtros.
          </motion.p>
        ) : (
          <div className="relative mt-6 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {list.map((p, i) => (
                <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }}>
                  <ProductCard product={p} priority={i < 4} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}