"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/format";
import { PinDialog } from "./pin-dialog";

export type EditorLine = {
  key: string; item_id: string | null; variant_id: string | null;
  name: string; size: string; color: string; quantity: number; price: string;
};
export type CatalogVariant = { id: string; label: string; price: number; stock: number };

type Props = {
  orderId: string; wasEdited: boolean; readOnly: boolean;
  initial: EditorLine[]; catalog: CatalogVariant[]; stock: Record<string, number>;
  methods: { id: string; name: string }[];
};

const sig = (ls: EditorLine[]) => JSON.stringify(ls.map((l) => [l.key, l.quantity, l.price]));
type RpcResult = { ok: boolean; error?: string };

async function call(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await createClient().rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  return (data as RpcResult) ?? { ok: false, error: "Resposta inválida." };
}

export function OrderEditor({ orderId, wasEdited, readOnly, initial, catalog, stock, methods }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initial);
  const [pick, setPick] = useState("");
  const [pickQty, setPickQty] = useState(1);
  const [dialog, setDialog] = useState<"save" | "confirm" | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [method, setMethod] = useState(methods[0]?.id ?? "");

  const parsed = lines.map((l) => ({ ...l, unit: Number(l.price.replace(",", ".")) }));
  const valid = parsed.length > 0 && parsed.every((l) => Number.isFinite(l.unit) && l.unit >= 0 && l.quantity >= 1);
  const total = parsed.reduce((s, l) => s + (Number.isFinite(l.unit) ? (Math.round(l.unit * 100) * l.quantity) / 100 : 0), 0);
  const dirty = sig(lines) !== sig(initial);

  const setQty = (key: string, q: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(999, q)) } : l)));
  const setPrice = (key: string, price: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, price } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  function addLine() {
    const v = catalog.find((c) => c.id === pick);
    if (!v) return;
    setLines((ls) => {
      const ex = ls.find((l) => l.variant_id === v.id);
      if (ex) return ls.map((l) => (l === ex ? { ...l, quantity: Math.min(999, l.quantity + pickQty) } : l));
      const [name, rest = ""] = v.label.split(" — ");
      const [size = "", color = ""] = rest.split(" / ");
      return [...ls, { key: crypto.randomUUID(), item_id: null, variant_id: v.id, name, size, color, quantity: pickQty, price: v.price.toFixed(2) }];
    });
    setPick(""); setPickQty(1);
  }

  async function save(pin: string) {
    setBusy(true); setDialogError(null);
    const r = await call("update_order_items", {
      p_order_id: orderId, p_pin: pin,
      p_items: parsed.map((l) => ({ item_id: l.item_id, variant_id: l.item_id ? null : l.variant_id, quantity: l.quantity, unit_price: l.unit })),
    });
    setBusy(false);
    if (!r.ok) { setDialogError(r.error ?? "Erro ao salvar."); return; }
    setDialog(null);
    setMessage({ ok: true, text: "Alterações salvas." });
    router.refresh();
  }

  async function doConfirm(pin: string | null) {
    setBusy(true); setDialogError(null);
    const r = await call("confirm_sale", { p_order_id: orderId, p_payment_method_id: method, p_pin: pin });
    setBusy(false);
    if (!r.ok) {
      if (dialog) setDialogError(r.error ?? "Erro ao confirmar.");
      else setMessage({ ok: false, text: r.error ?? "Erro ao confirmar." });
      return;
    }
    router.push("/admin/possiveis-vendas");
    router.refresh();
  }

  function startConfirm() {
    setMessage(null);
    if (!method) return;
    if (wasEdited) { setDialogError(null); setDialog("confirm"); return; }
    if (window.confirm(`Confirmar a venda de ${formatBRL(total)}?`)) void doConfirm(null);
  }

  async function cancelOrder() {
    if (!window.confirm("Cancelar este pedido? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    const r = await call("cancel_order", { p_order_id: orderId });
    setBusy(false);
    if (!r.ok) { setMessage({ ok: false, text: r.error ?? "Erro ao cancelar." }); return; }
    router.push("/admin/possiveis-vendas");
    router.refresh();
  }

  const field = "rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-neutral-900 dark:border-neutral-700 dark:focus:ring-white";
  const btn = "rounded-full px-5 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-50";

  return (
    <div className="mt-6 space-y-6">
      <ul className="space-y-3">
        {lines.map((l) => {
          const st = l.variant_id ? stock[l.variant_id] ?? catalog.find((c) => c.id === l.variant_id)?.stock : undefined;
          const short = !readOnly && st !== undefined && l.quantity > st;
          return (
            <li key={l.key} className="grid gap-3 rounded-xl border border-neutral-200 p-4 sm:grid-cols-[1fr_auto_8rem_auto] sm:items-center dark:border-neutral-800">
              <div className="min-w-0">
                <p className="font-medium">{l.name}</p>
                <p className="text-xs text-neutral-500">Tam. {l.size} · {l.color}</p>
                {!l.variant_id && !readOnly && <p className="text-xs text-red-600">Produto removido do catálogo. Remova este item para poder confirmar.</p>}
                {!readOnly && st !== undefined && <p className={`text-xs ${short ? "font-semibold text-red-600" : "text-neutral-500"}`}>Estoque: {st}{short ? " (insuficiente)" : ""}</p>}
              </div>

              {readOnly ? (
                <>
                  <p className="text-sm">{l.quantity} un.</p>
                  <p className="text-sm">{formatBRL(Number(l.price))}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center rounded-full border border-neutral-300 dark:border-neutral-700">
                    <button type="button" aria-label="Diminuir" disabled={l.quantity <= 1} onClick={() => setQty(l.key, l.quantity - 1)} className="grid size-9 place-items-center transition active:scale-90 disabled:opacity-30"><Minus size={14} /></button>
                    <span className="w-8 text-center text-sm font-semibold">{l.quantity}</span>
                    <button type="button" aria-label="Aumentar" onClick={() => setQty(l.key, l.quantity + 1)} className="grid size-9 place-items-center transition active:scale-90"><Plus size={14} /></button>
                  </div>
                  <label className="flex items-center gap-1 text-sm">
                    <span className="text-neutral-500">R$</span>
                    <input inputMode="decimal" aria-label={`Preço unitário de ${l.name}`} value={l.price} onChange={(e) => setPrice(l.key, e.target.value)} className={`${field} w-full`} />
                  </label>
                </>
              )}

              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <p className="font-semibold">{formatBRL((Math.round((Number(l.price.replace(",", ".")) || 0) * 100) * l.quantity) / 100)}</p>
                {!readOnly && (
                  <button type="button" aria-label={`Remover ${l.name}`} disabled={lines.length <= 1} onClick={() => removeLine(l.key)}
                    className="grid size-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-red-600 active:scale-90 disabled:opacity-30 dark:hover:bg-neutral-800"><Trash2 size={16} /></button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-neutral-300 p-4 sm:flex-row dark:border-neutral-700">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Adicionar produto" className={`${field} flex-1`}>
            <option value="">Adicionar produto...</option>
            {catalog.map((c) => <option key={c.id} value={c.id} disabled={c.stock <= 0}>{c.label} · {formatBRL(c.price)} · estoque {c.stock}</option>)}
          </select>
          <input type="number" min={1} max={999} value={pickQty} onChange={(e) => setPickQty(Math.max(1, Number(e.target.value) || 1))} aria-label="Quantidade" className={`${field} w-24`} />
          <button type="button" onClick={addLine} disabled={!pick} className={`${btn} bg-neutral-950 text-white dark:bg-white dark:text-neutral-950`}>Adicionar</button>
        </div>
      )}

      <div className="flex items-baseline justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <span className="text-neutral-500">Total</span>
        <span className="text-2xl font-black">{formatBRL(total)}</span>
      </div>

      {message && <p role="status" className={`rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>{message.text}</p>}

      {!readOnly && (
        <div className="space-y-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          {dirty && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-amber-700 dark:text-amber-300">Você tem alterações não salvas. Salvar exige o código de 4 dígitos.</p>
              <button type="button" onClick={() => setLines(initial)} className={`${btn} border border-neutral-300 dark:border-neutral-700`}>Descartar</button>
              <button type="button" disabled={!valid || busy} onClick={() => { setDialogError(null); setDialog("save"); }} className={`${btn} bg-neutral-950 text-white dark:bg-white dark:text-neutral-950`}>Salvar alterações</button>
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Forma de pagamento</legend>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <label key={m.id} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95 ${method === m.id ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950" : "border-neutral-300 dark:border-neutral-700"}`}>
                  <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="sr-only" />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={startConfirm} disabled={busy || dirty || !valid || !method} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>Confirmar venda</button>
            <button type="button" onClick={cancelOrder} disabled={busy} className={`${btn} border border-red-300 text-red-700 dark:border-red-900 dark:text-red-300`}>Cancelar pedido</button>
            {dirty && <span className="text-xs text-neutral-500">Salve as alterações antes de confirmar.</span>}
            {!dirty && wasEdited && <span className="text-xs text-neutral-500">Pedido editado: a confirmação exige o código.</span>}
          </div>
        </div>
      )}

      {dialog && (
        <PinDialog
          title={dialog === "save" ? "Autorizar alterações" : "Autorizar confirmação"}
          description={dialog === "save" ? "Digite o código de 4 dígitos para salvar as alterações do pedido." : `Pedido editado. Digite o código para confirmar a venda de ${formatBRL(total)}.`}
          error={dialogError} loading={busy}
          onCancel={() => { if (!busy) setDialog(null); }}
          onSubmit={(pin) => (dialog === "save" ? void save(pin) : void doConfirm(pin))}
        />
      )}
    </div>
  );
}
