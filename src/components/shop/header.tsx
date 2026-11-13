"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeToggle } from "./theme-toggle";
import { useCart } from "@/lib/store/cart";

type Cat = { id: string; name: string; slug: string };

export function Header({ storeName, categories }: { storeName: string; categories: Cat[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));
  useEffect(() => setMounted(true), []);

  const links = [{ href: "/catalogo?ordem=novidades", label: "Novidades" }, ...categories.map((c) => ({ href: `/catalogo?categoria=${c.slug}`, label: c.name }))];

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full lg:hidden">
          <Menu size={22} />
        </button>
        <Link href="/" className="text-xl font-black tracking-tight">{storeName}</Link>

        <nav className="mx-6 hidden gap-5 text-sm font-medium lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-neutral-600 transition hover:text-black dark:text-neutral-400 dark:hover:text-white">{l.label}</Link>
          ))}
        </nav>

        <form action="/catalogo" className="ml-auto hidden max-w-xs flex-1 md:block">
          <label className="relative block">
            <span className="sr-only">Buscar produtos</span>
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input name="q" placeholder="Buscar" className="w-full rounded-full bg-neutral-100 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-neutral-900 dark:bg-neutral-900 dark:focus:ring-white" />
          </label>
        </form>

        <div className="ml-auto flex items-center md:ml-0">
          <Link href="/catalogo" aria-label="Buscar" className="grid size-10 place-items-center rounded-full md:hidden"><Search size={20} /></Link>
          <ThemeToggle />
          <Link href="/carrinho" aria-label={`Carrinho, ${mounted ? count : 0} itens`} className="relative grid size-10 place-items-center rounded-full transition hover:bg-neutral-100 active:scale-90 dark:hover:bg-neutral-800">
            <ShoppingBag size={20} />
            <AnimatePresence>
              {mounted && count > 0 && (
                <motion.span key={count} initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-neutral-950 px-1 text-[11px] font-bold text-white dark:bg-white dark:text-neutral-950">
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-[82%] max-w-sm bg-white p-6 dark:bg-neutral-950" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "tween", duration: 0.25 }}>
              <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="mb-6 grid size-10 place-items-center rounded-full"><X size={22} /></button>
              <form action="/catalogo" className="mb-6">
                <input name="q" placeholder="Buscar produtos" className="w-full rounded-full bg-neutral-100 px-4 py-3 outline-none dark:bg-neutral-900" />
              </form>
              <nav className="flex flex-col">
                {links.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-neutral-100 py-4 text-2xl font-bold tracking-tight dark:border-neutral-900">{l.label}</Link>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
