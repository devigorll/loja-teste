"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/lib/store/cart";
import { formatBRL } from "@/lib/format";
import { buildWhatsAppUrl, type OrderResult } from "@/lib/whatsapp";

type VariantRow = {
  id: string; stock: number; price_override: number | null;
  products: { price: number; promo_price: number | null; is_active: boolean } | null;
};

export function CartView({ whatsapp }: { whatsapp: string | null }) {
  const { items, setQty, remove, clear, sync } = useCart();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; url: string } | null>(null);
  const idemKey = useRef<string>("");

  // Revalida preços e estoque com o banco
  const refresh = useCallback(async () => {
    const ids = useCart.getState().items.map((i) => i.variantId);
    if (ids.length === 0) return;
    const { data, error } = await createClient()
      .from("product_variants")
      .select("id, stock, price_override, products(price, promo_price, is_active)")
      .in("id", ids);
    if (error) return;
    const rows = (data ?? []) as unknown as VariantRow[];
    const next: Record<string, { price: number; max: number }> = {};
    rows.forEach((r) => {
      if (r.products?.is_active && r.stock > 0) {
        next[r.id] = { price: r.price_override ?? r.products.promo_price ?? r.products.price, max: r.stock };
      }
    });
    const changed = useCart.getState().items.some((i) => {
      const n = next[i.variantId];
      return !n || n.price !== i.price || n.max < i.qty;
    });
    if (changed) {
      sync(next);
      setNotice("Atualizamos sua sacola: alguns preços ou estoques mudaram.");
    }
  }, [sync]);

  useEffect(() => {
    setMounted(true);
    idemKey.current = crypto.randomUUID();
    refresh();
  }, [refresh]);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || items.length === 0) return;
    setError(null);
    if (!whatsapp) {
      setError("O WhatsApp da loja ainda não foi configurado. Tente novamente mais tarde.");
      return;
    }
    setSending(true);
    const { data, error: rpcError } = await createClient().rpc("create_order", {
      p_customer_name: name,
      p_customer_phone: phone,
      p_notes: notes,
      p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.qty })),
      p_idempotency_key: idemKey.current,
    });
    if (rpcError || !data) {
      setError(rpcError?.message ?? "Não foi possível registrar o pedido. Tente novamente.");
      setSending(false);
      refresh();
      return;
    }
    const order = data as OrderResult;
    const url = buildWhatsAppUrl(whatsapp, order);
    clear();
    idemKey.current = crypto.randomUUID();
    setDone({ code: order.code, url });
    window.location.assign(url);
  }

  if (!mounted) return <div className="mx-auto min-h-[60dvh] max-w-5xl px-4 py-10 sm:px-6" />;

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"><Check size={28} /></div>
        <h1 className="text-2xl font-black tracking-tight">Pedido {done.code} registrado!</h1>
        <p className="mt-3 text-neutral-500">Abrindo o WhatsApp com a mensagem pronta. Se não abrir, toque no botão.</p>
        <a href={done.url} className="mt-8 inline-block rounded-full bg-neutral-950 px-7 py-3.5 font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-950">Abrir WhatsApp</a>
        <div className="mt-4"><Link href="/catalogo" className="text-sm underline underline-offset-4">Continuar comprando</Link></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-28 text-center">
        <h1 className="text-2xl font-black tracking-tight">Sua sacola está vazia</h1>
        <p className="mt-3 text-neutral-500">Escolha seus produtos no catálogo.</p>
        <Link href="/catalogo" className="mt-8 inline-block rounded-full bg-neutral-950 px-7 py-3.5 font-semibold text-white transition active:scale-95 dark:bg-white dark:text-neutral-950">Ver catálogo</Link>
      </div>
    );
  }

  const field = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:focus:ring-white";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Sua sacola</h1>
      {notice && <p role="status" className="mt-4 rounded-lg border border-neutral-300 bg-neutral-100 p-3 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">{notice}</p>}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          <AnimatePresence initial={false}>
            {items.map((i) => (
              <motion.li key={i.variantId} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex gap-4 py-5">
                <Link href={`/produto/${i.slug}`} className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900">
                  {i.image && <Image src={i.image} alt={i.name} fill unoptimized={i.image.endsWith(".svg")} sizes="96px" className="object-cover" />}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/produto/${i.slug}`} className="font-semibold leading-snug hover:underline">{i.name}</Link>
                      <p className="text-sm text-neutral-500">Tam. {i.size} · {i.color}</p>
                    </div>
                    <p className="shrink-0 font-semibold">{formatBRL(i.price * i.qty)}</p>
                  </div>
                  <p className="text-sm text-neutral-500">{formatBRL(i.price)} cada</p>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center rounded-full border border-neutral-300 dark:border-neutral-700">
                      <button type="button" aria-label="Diminuir quantidade" disabled={i.qty <= 1} onClick={() => setQty(i.variantId, i.qty - 1)} className="grid size-9 place-items-center transition active:scale-90 disabled:opacity-30"><Minus size={14} /></button>
                      <span className="w-7 text-center text-sm font-semibold" aria-live="polite">{i.qty}</span>
                      <button type="button" aria-label="Aumentar quantidade" disabled={i.qty >= i.max} onClick={() => setQty(i.variantId, i.qty + 1)} className="grid size-9 place-items-center transition active:scale-90 disabled:opacity-30"><Plus size={14} /></button>
                    </div>
                    <button type="button" aria-label={`Remover ${i.name}`} onClick={() => remove(i.variantId)} className="grid size-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:text-white active:scale-90 dark:hover:bg-neutral-800"><Trash2 size={16} /></button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <form onSubmit={handleSubmit} className="h-fit space-y-4 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800 lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between">
            <span className="text-neutral-500">Total</span>
            <span className="text-2xl font-black">{formatBRL(total)}</span>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">Seu nome</label>
            <input id="name" required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-sm font-medium">Seu telefone <span className="font-normal text-neutral-500">(opcional)</span></label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="notes" className="text-sm font-medium">Observações <span className="font-normal text-neutral-500">(opcional)</span></label>
            <textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
          </div>
          {error && <p role="alert" className="rounded-lg border border-neutral-400 bg-neutral-100 p-3 text-sm font-semibold text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100">{error}</p>}
          <button type="submit" disabled={sending} className="w-full rounded-full bg-neutral-950 py-3.5 font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200">
            {sending ? "Registrando pedido..." : "Finalizar compra pelo WhatsApp"}
          </button>
          <p className="text-xs text-neutral-500">Você revisa a mensagem no WhatsApp antes de enviar. O pagamento é combinado direto com a loja.</p>
        </form>
      </div>
    </div>
  );
}